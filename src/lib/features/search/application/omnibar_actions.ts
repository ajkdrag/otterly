import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  OmnibarItem,
  OmnibarScope,
  SearchQuery,
} from "$lib/shared/types/search";
import type { CommandId } from "$lib/features/search/types/command_palette";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import { parse_search_query } from "$lib/features/search/domain/search_query_parser";
import { tag_key, type TagMatch, type TaggedNote } from "$lib/features/tags";
import { as_note_path, type VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("omnibar_actions");
const is_performance_logging_enabled =
  import.meta.env.DEV && import.meta.env.MODE !== "test";

export const COMMAND_TO_ACTION_ID: Record<CommandId, string> = {
  create_new_note: ACTION_IDS.note_create,
  save_note: ACTION_IDS.note_request_save,
  toggle_source_mode: ACTION_IDS.editor_toggle_source_mode,
  clean_up_legacy_markdown: ACTION_IDS.note_cleanup_markdown_request,
  change_vault: ACTION_IDS.vault_request_change,
  open_settings: ACTION_IDS.settings_open,
  open_theme_settings: ACTION_IDS.settings_open,
  open_hotkeys: ACTION_IDS.settings_open,
  toggle_sidebar: ACTION_IDS.ui_toggle_sidebar,
  find_in_note: ACTION_IDS.find_in_file_open,
  open_help: ACTION_IDS.help_open,
  next_tab: ACTION_IDS.tab_next,
  previous_tab: ACTION_IDS.tab_prev,
  last_used_tab: ACTION_IDS.tab_go_to_last_used,
  reopen_closed_tab: ACTION_IDS.tab_reopen_closed,
  sync_index: ACTION_IDS.vault_sync_index,
  reindex_vault: ACTION_IDS.vault_reindex,
  show_vault_dashboard: ACTION_IDS.ui_open_vault_dashboard,
  git_version_history: ACTION_IDS.git_open_history,
  git_create_checkpoint: ACTION_IDS.git_open_checkpoint,
  git_init_repo: ACTION_IDS.git_init,
  toggle_links_panel: ACTION_IDS.ui_toggle_context_rail,
  search_tags: ACTION_IDS.omnibar_open_tags,
  show_tags_pane: ACTION_IDS.tags_show_pane,
  check_for_updates: ACTION_IDS.app_check_for_updates,
};

const COMMAND_ACTION_ARGUMENTS: Partial<Record<CommandId, unknown[]>> = {
  open_theme_settings: ["theme"],
  open_hotkeys: ["hotkeys"],
};

// Rows in tag suggestions and in tag mode. The header shows "50+" past this.
const TAG_RESULT_LIMIT = 50;

function set_omnibar_state(
  input: ActionRegistrationInput,
  patch: Partial<ActionRegistrationInput["stores"]["ui"]["omnibar"]>,
) {
  input.stores.ui.omnibar = {
    ...input.stores.ui.omnibar,
    ...patch,
  };
}

function set_omnibar_searching(
  input: ActionRegistrationInput,
  is_searching: boolean,
) {
  set_omnibar_state(input, { is_searching });
}

function map_cross_vault_items(
  result: Awaited<
    ReturnType<
      ActionRegistrationInput["services"]["search"]["search_notes_all_vaults"]
    >
  >,
): OmnibarItem[] {
  return result.groups.flatMap((group) =>
    group.results.map((entry) => ({
      kind: "cross_vault_note" as const,
      note: entry.note,
      vault_id: group.vault_id,
      vault_name: group.vault_name,
      vault_note_count: group.vault_note_count,
      vault_last_opened_at: group.vault_last_opened_at,
      vault_is_available: group.vault_is_available,
      score: entry.score,
      snippet: entry.snippet,
      match_kind: entry.match_kind,
      match_detail: entry.match_detail,
    })),
  );
}

function clamp_selected_index(input: ActionRegistrationInput) {
  const item_count = input.stores.search.omnibar_items.length;
  if (item_count === 0) {
    return 0;
  }
  return Math.min(input.stores.ui.omnibar.selected_index, item_count - 1);
}

function open_omnibar(input: ActionRegistrationInput) {
  set_omnibar_state(input, {
    open: true,
    query: "",
    selected_index: 0,
    is_searching: false,
  });
  input.stores.search.clear_omnibar();
}

function close_omnibar(input: ActionRegistrationInput) {
  set_omnibar_state(input, {
    open: false,
    query: "",
    selected_index: 0,
    is_searching: false,
    scope: "current_vault",
    tags: [],
    tag_match: "all",
  });
  input.stores.search.clear_omnibar();
  input.services.search.reset_search_notes_operation();
}

function clear_cross_vault_open_confirm(input: ActionRegistrationInput) {
  input.stores.ui.cross_vault_open_confirm = {
    open: false,
    target_vault_id: null,
    target_vault_name: "",
    note_path: null,
  };
}

function is_unavailable_vault_error(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("vault unavailable") ||
    normalized.includes("could not be found") ||
    normalized.includes("no such file or directory")
  );
}

function mark_vault_unavailable(
  input: ActionRegistrationInput,
  vault_id: VaultId,
) {
  input.stores.vault.set_vault_availability(vault_id, false);
  input.stores.search.set_omnibar_items(
    input.stores.search.omnibar_items.map((item) => {
      if (item.kind !== "cross_vault_note" || item.vault_id !== vault_id) {
        return item;
      }
      return {
        ...item,
        vault_is_available: false,
      };
    }),
  );
}

// What the omnibar is showing decides the search:
//
//   last token is `#...`        tag suggestions, chips excluded
//   chips, notes query          notes with the chip tags, narrowed by the text
//   otherwise                   notes, commands, planned notes, as before
//
// Every caller goes through here. An answer that comes back after the query,
// the chips, the match mode or the scope changed is dropped.
async function run_omnibar_search(input: ActionRegistrationInput) {
  const { stores, services } = input;
  const omnibar = stores.ui.omnibar;
  if (!omnibar.query.trim() && omnibar.tags.length === 0) {
    set_omnibar_searching(input, false);
    stores.search.clear_omnibar();
    services.search.reset_search_notes_operation();
    return;
  }

  const key = omnibar_search_key(input);
  const parsed = parse_search_query(omnibar.query);
  const started_at = is_performance_logging_enabled ? performance.now() : null;
  set_omnibar_searching(input, true);
  const result = await fetch_omnibar_items(input, parsed);
  if (omnibar_search_key(input) !== key) return;

  stores.search.set_omnibar_items(result.items, result.truncated);
  set_omnibar_state(input, {
    is_searching: false,
    selected_index: clamp_selected_index(input),
  });
  if (started_at !== null) {
    log.debug("Omnibar query results ready", {
      query_length: parsed.raw.length,
      result_count: result.items.length,
      duration_ms: performance.now() - started_at,
    });
  }
}

function omnibar_search_key(input: ActionRegistrationInput): string {
  const { query, tags, tag_match, scope } = input.stores.ui.omnibar;
  return JSON.stringify([query, tags, tag_match, scope]);
}

async function fetch_omnibar_items(
  input: ActionRegistrationInput,
  parsed: SearchQuery,
): Promise<{ items: OmnibarItem[]; truncated: boolean }> {
  const { services } = input;
  const { tags, tag_match, scope } = input.stores.ui.omnibar;

  if (parsed.domain === "tags") {
    const suggestions = await services.tags.suggest_tags(
      parsed.text,
      tags,
      TAG_RESULT_LIMIT,
    );
    const items = suggestions.map((entry) => ({
      kind: "tag" as const,
      tag: entry.tag,
      count: entry.count,
    }));
    return { items, truncated: false };
  }

  if (tags.length > 0 && parsed.domain === "notes") {
    const result = await services.tags.search_tagged_notes({
      tags,
      match: tag_match,
      text: parsed.text,
      limit: TAG_RESULT_LIMIT,
    });
    if (result.status !== "ok") return { items: [], truncated: false };
    return {
      items: result.page.notes.map(tagged_note_item),
      truncated: result.page.truncated,
    };
  }

  if (scope === "all_vaults" && parsed.domain === "notes") {
    const result = await services.search.search_notes_all_vaults(parsed.raw);
    return { items: map_cross_vault_items(result), truncated: false };
  }

  const result = await services.search.search_omnibar(parsed.raw);
  return { items: result.items, truncated: false };
}

// The index already ordered these, so the score only keeps that order.
function tagged_note_item(
  entry: TaggedNote,
  index: number,
  entries: TaggedNote[],
): OmnibarItem {
  const detail = entry.match_detail ?? undefined;
  return {
    kind: "note",
    note: entry.note,
    score: entries.length - index,
    snippet: entry.snippet ?? undefined,
    match_kind: detail && (detail === "content" ? "content" : "file"),
    match_detail: detail,
  };
}

function has_tag(tags: string[], tag: string): boolean {
  const key = tag_key(tag);
  return tags.some((existing) => tag_key(existing) === key);
}

// Chips replace the `#...` token: the query keeps the text typed before it.
// Tags live in each vault's index, so a chip scopes the search to this vault.
async function add_tag_chip(
  input: ActionRegistrationInput,
  tag: string,
  before_tag: string,
) {
  const { tags } = input.stores.ui.omnibar;
  set_omnibar_state(input, {
    tags: has_tag(tags, tag) ? tags : [...tags, tag],
    query: before_tag ? `${before_tag} ` : "",
    scope: "current_vault",
    selected_index: 0,
  });
  await run_omnibar_search(input);
}

// Space after an existing tag makes it a chip. The previous query must have
// been that `#tag` token and the shown suggestions must hold it exactly.
// Without chips, `#planned ` stays the planned notes search.
function tag_completed_by_space(
  input: ActionRegistrationInput,
  previous_query: string,
  next_query: string,
): { tag: string; before_tag: string } | null {
  if (next_query !== `${previous_query} `) return null;
  const previous = parse_search_query(previous_query);
  if (previous.domain !== "tags" || !previous.text) return null;
  const { tags } = input.stores.ui.omnibar;
  if (tags.length === 0 && previous.text.toLowerCase() === "planned")
    return null;
  const key = tag_key(previous.text);
  const match = input.stores.search.omnibar_items.find(
    (item) => item.kind === "tag" && tag_key(item.tag) === key,
  );
  if (match?.kind !== "tag") return null;
  return { tag: match.tag, before_tag: previous.before_tag ?? "" };
}

function read_tags_arg(arg: unknown): string[] {
  if (typeof arg !== "object" || arg === null || !("tags" in arg)) return [];
  const { tags } = arg;
  if (!Array.isArray(tags)) return [];
  const unique: string[] = [];
  for (const tag of tags) {
    if (typeof tag === "string" && tag && !has_tag(unique, tag))
      unique.push(tag);
  }
  return unique;
}

function is_tag_match(value: unknown): value is TagMatch {
  return value === "all" || value === "any";
}

async function execute_command(
  input: ActionRegistrationInput,
  command_id: CommandId,
) {
  const { registry } = input;
  const action_id = COMMAND_TO_ACTION_ID[command_id];
  await registry.execute(
    action_id,
    ...(COMMAND_ACTION_ARGUMENTS[command_id] ?? []),
  );
}

async function confirm_item(input: ActionRegistrationInput, item: OmnibarItem) {
  const { registry } = input;

  switch (item.kind) {
    case "tag": {
      const parsed = parse_search_query(input.stores.ui.omnibar.query);
      await add_tag_chip(input, item.tag, parsed.before_tag ?? "");
      break;
    }
    case "note":
    case "recent_note":
      close_omnibar(input);
      await registry.execute(ACTION_IDS.note_open, {
        note_path: item.note.id,
        cleanup_if_missing: true,
      });
      break;
    case "cross_vault_note":
      if (
        input.stores.vault.recent_vaults.some(
          (vault) => vault.id === item.vault_id && vault.is_available === false,
        )
      ) {
        mark_vault_unavailable(input, item.vault_id as VaultId);
        return;
      }

      close_omnibar(input);
      if (input.stores.vault.vault?.id !== item.vault_id) {
        input.stores.ui.cross_vault_open_confirm = {
          open: true,
          target_vault_id: item.vault_id as VaultId,
          target_vault_name: item.vault_name,
          note_path: item.note.id,
        };
        return;
      }
      await registry.execute(ACTION_IDS.note_open, {
        note_path: item.note.id,
        cleanup_if_missing: true,
      });
      break;
    case "command":
      close_omnibar(input);
      input.stores.ui.add_recent_command(
        item.command.id,
        COMMANDS_REGISTRY.length,
      );
      await execute_command(input, item.command.id);
      break;
    case "setting":
      close_omnibar(input);
      await registry.execute(
        ACTION_IDS.settings_open,
        item.setting.category.toLowerCase(),
      );
      break;
    case "planned_note":
      close_omnibar(input);
      await registry.execute(
        ACTION_IDS.note_open_wiki_link,
        as_note_path(item.target_path),
      );
      break;
  }
}

export function register_omnibar_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  registry.register({
    id: ACTION_IDS.omnibar_toggle,
    label: "Toggle Omnibar",
    execute: () => {
      if (stores.ui.omnibar.open) {
        close_omnibar(input);
        return;
      }
      set_omnibar_state(input, {
        open: true,
        query: ">",
        selected_index: 0,
        is_searching: false,
      });
      stores.search.clear_omnibar();
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_open,
    label: "Open Omnibar",
    execute: async () => {
      if (stores.ui.omnibar.open) {
        await registry.execute(ACTION_IDS.omnibar_set_scope, "current_vault");
        return;
      }
      open_omnibar(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_open_all_vaults,
    label: "Open Omnibar (All Vaults)",
    execute: async () => {
      if (stores.ui.omnibar.open) {
        await registry.execute(ACTION_IDS.omnibar_set_scope, "all_vaults");
        return;
      }
      set_omnibar_state(input, {
        open: true,
        query: "",
        selected_index: 0,
        is_searching: false,
        scope: "all_vaults",
      });
      stores.search.clear_omnibar();
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_close,
    label: "Close Omnibar",
    execute: () => {
      close_omnibar(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_set_query,
    label: "Set Omnibar Query",
    execute: async (query: unknown) => {
      const next_query = String(query);
      const previous_query = stores.ui.omnibar.query;
      const completed = tag_completed_by_space(
        input,
        previous_query,
        next_query,
      );
      if (completed) {
        await add_tag_chip(input, completed.tag, completed.before_tag);
        return;
      }
      set_omnibar_state(input, {
        query: next_query,
        selected_index: 0,
      });
      await run_omnibar_search(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_set_selected_index,
    label: "Set Omnibar Selected Index",
    execute: (index: unknown) => {
      set_omnibar_state(input, { selected_index: Number(index) });
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_set_scope,
    label: "Set Omnibar Scope",
    execute: async (scope: unknown) => {
      const new_scope = scope as OmnibarScope;
      set_omnibar_state(input, {
        scope: new_scope,
        selected_index: 0,
        // Tags live in one vault's index, so all vaults drops the chips.
        ...(new_scope === "all_vaults" ? { tags: [] } : {}),
      });
      stores.search.clear_omnibar();
      await run_omnibar_search(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_open_tags,
    label: "Search Tags",
    execute: async (arg: unknown) => {
      const requested = read_tags_arg(arg);
      const caret_tag =
        requested.length === 0 && !stores.ui.omnibar.open
          ? services.editor.tag_at_cursor()
          : null;
      const tags = caret_tag ? [caret_tag] : requested;

      // A chip, the rail, the sidebar or the caret in a #tag: search that tag.
      if (tags.length > 0) {
        set_omnibar_state(input, {
          open: true,
          query: "",
          selected_index: 0,
          is_searching: false,
          scope: "current_vault",
          tags,
          tag_match: "all",
        });
        stores.search.clear_omnibar();
        await run_omnibar_search(input);
        return;
      }

      if (!stores.ui.omnibar.open) {
        set_omnibar_state(input, {
          open: true,
          query: "#",
          selected_index: 0,
          is_searching: false,
          scope: "current_vault",
        });
        stores.search.clear_omnibar();
        await run_omnibar_search(input);
        return;
      }

      // Already open: toggle the `#` token at the end of the query.
      const { query } = stores.ui.omnibar;
      const parsed = parse_search_query(query);
      let next_query = query.trim() ? `${query.trimEnd()} #` : "#";
      if (parsed.domain === "tags") next_query = parsed.before_tag ?? "";
      if (parsed.domain === "commands") next_query = "#";
      set_omnibar_state(input, {
        query: next_query,
        selected_index: 0,
        scope: "current_vault",
      });
      await run_omnibar_search(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_remove_tag,
    label: "Remove Omnibar Tag Filter",
    execute: async (tag: unknown) => {
      if (typeof tag !== "string") return;
      const key = tag_key(tag);
      set_omnibar_state(input, {
        tags: stores.ui.omnibar.tags.filter(
          (existing) => tag_key(existing) !== key,
        ),
        selected_index: 0,
      });
      await run_omnibar_search(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_set_tag_match,
    label: "Set Omnibar Tag Match",
    execute: async (mode: unknown) => {
      if (!is_tag_match(mode) || mode === stores.ui.omnibar.tag_match) return;
      set_omnibar_state(input, { tag_match: mode, selected_index: 0 });
      await run_omnibar_search(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_confirm_item,
    label: "Confirm Omnibar Item",
    execute: async (arg: unknown) => {
      const item = arg as OmnibarItem | undefined;
      if (!item) return;
      await confirm_item(input, item);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_confirm_cross_vault_open,
    label: "Confirm Open Cross-Vault Note",
    execute: async () => {
      const pending = stores.ui.cross_vault_open_confirm;
      const target_vault_id = pending.target_vault_id;
      const note_path = pending.note_path;
      clear_cross_vault_open_confirm(input);
      if (!target_vault_id || !note_path) {
        return;
      }

      if (stores.vault.vault?.id !== target_vault_id) {
        await registry.execute(ACTION_IDS.vault_select, target_vault_id);
      }
      if (stores.vault.vault?.id !== target_vault_id) {
        const vault_change_error = stores.ui.change_vault.error;
        if (
          vault_change_error &&
          is_unavailable_vault_error(vault_change_error)
        ) {
          mark_vault_unavailable(input, target_vault_id);
        }
        return;
      }

      await registry.execute(ACTION_IDS.note_open, {
        note_path: as_note_path(note_path),
        cleanup_if_missing: true,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_cancel_cross_vault_open,
    label: "Cancel Open Cross-Vault Note",
    execute: () => {
      clear_cross_vault_open_confirm(input);
    },
  });
}

import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  OmnibarItem,
  OmnibarScope,
  SearchQuery,
} from "$lib/shared/types/search";
import type { CommandId } from "$lib/features/search/types/command_palette";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import {
  parse_search_query,
  set_search_query_target,
} from "$lib/features/search/domain/search_query_parser";
import { tag_key, type TaggedNote } from "$lib/features/tags";
import { is_unavailable_vault_error } from "$lib/features/vault";
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
  open_theme_file: ACTION_IDS.theme_open_file,
  reveal_theme_file: ACTION_IDS.theme_reveal_file,
  copy_theme_file_path: ACTION_IDS.theme_copy_file_path,
  open_hotkeys: ACTION_IDS.settings_open,
  toggle_sidebar: ACTION_IDS.ui_toggle_sidebar,
  find_in_note: ACTION_IDS.find_in_file_open,
  find_in_vault: ACTION_IDS.omnibar_open_find,
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
  new_window: ACTION_IDS.vault_open_new_window,
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

// UIStore.vault_find is left alone: the pattern, options and selection last
// for the session.
function close_omnibar(input: ActionRegistrationInput) {
  set_omnibar_state(input, {
    open: false,
    mode: "notes",
    query: "",
    selected_index: 0,
    is_searching: false,
    scope: "current_vault",
    tags: [],
    return_to_find: false,
  });
  input.stores.search.clear_omnibar();
  input.services.search.reset_search_notes_operation();
}

// Text mode keeps its pattern in UIStore.vault_find and the find reactor runs
// the search, so the notes query and its results go. Text mode walks one
// vault, like the chips.
function enter_find_mode(input: ActionRegistrationInput) {
  set_omnibar_state(input, {
    mode: "find",
    query: "",
    selected_index: 0,
    is_searching: false,
    scope: "current_vault",
    return_to_find: false,
  });
  input.stores.search.clear_omnibar();
  input.services.search.reset_search_notes_operation();
}

// Notes to Text. A plain notes search brings its text along, without the
// `@file` style prefix. A `>` or `#...` query means something else, so the
// last pattern comes back instead.
function switch_notes_to_find(input: ActionRegistrationInput) {
  const parsed = parse_search_query(input.stores.ui.omnibar.query);
  if (parsed.domain === "notes" && parsed.text) {
    input.stores.ui.vault_find.query = parsed.text;
  }
  enter_find_mode(input);
}

// Text to Notes. The pattern becomes the notes query, after `@file ` for the
// Files button. The chips stay. The caller runs the notes search.
function leave_find_mode(
  input: ActionRegistrationInput,
  target: "all" | "files",
) {
  const pattern = input.stores.ui.vault_find.query;
  set_omnibar_state(input, {
    mode: "notes",
    query: target === "files" ? `@file ${pattern}` : pattern,
    selected_index: 0,
    return_to_find: false,
  });
}

// Cmd+T in Text mode opened the tag picker. Once the query is no longer a
// `#...` token (Esc, Backspace over the `#`, Cmd+T again), go back to Text.
function is_done_picking_tag_for_find(
  input: ActionRegistrationInput,
  next_query: string,
): boolean {
  return (
    input.stores.ui.omnibar.return_to_find &&
    parse_search_query(next_query).domain !== "tags"
  );
}

function clear_cross_vault_open_confirm(input: ActionRegistrationInput) {
  input.stores.ui.cross_vault_open_confirm = {
    open: false,
    target_vault_id: null,
    target_vault_name: "",
    note_path: null,
  };
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
// Every caller goes through here. An answer that comes back after the mode,
// the query, the chips or the scope changed is dropped. Text mode searches
// through the vault find reactor instead, so chip changes there only feed
// that.
async function run_omnibar_search(input: ActionRegistrationInput) {
  const { stores, services } = input;
  const omnibar = stores.ui.omnibar;
  if (omnibar.mode === "find") return;
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

  stores.search.set_omnibar_items(
    result.items,
    result.truncated,
    result.failed,
  );
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
  const { mode, query, tags, scope } = input.stores.ui.omnibar;
  return JSON.stringify([mode, query, tags, scope]);
}

async function fetch_omnibar_items(
  input: ActionRegistrationInput,
  parsed: SearchQuery,
): Promise<{ items: OmnibarItem[]; truncated: boolean; failed: boolean }> {
  const { services } = input;
  const { tags, scope } = input.stores.ui.omnibar;

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
    return { items, truncated: false, failed: false };
  }

  if (tags.length > 0 && parsed.domain === "notes") {
    // @Incomplete: tag mode ignores the title:/path: prefixes. Only
    // parsed.text goes to the index, so the text matches every field. The
    // Files button is the one exception, below.
    const result = await services.tags.search_tagged_notes({
      tags,
      text: parsed.text,
      limit: TAG_RESULT_LIMIT,
    });
    if (result.status !== "ok") {
      return {
        items: [],
        truncated: false,
        failed: result.status === "failed",
      };
    }
    // Files means names, titles and paths, with chips too. File hits come
    // first in the page, so when a content hit made it in, every file hit
    // did: dropping content hits leaves a list that is not truncated.
    const notes =
      parsed.target === "files"
        ? result.page.notes.filter((entry) => entry.match_detail !== "content")
        : result.page.notes;
    return {
      items: notes.map(tagged_note_item),
      truncated:
        result.page.truncated && notes.length === result.page.notes.length,
      failed: false,
    };
  }

  if (scope === "all_vaults" && parsed.domain === "notes") {
    const result = await services.search.search_notes_all_vaults(parsed.raw);
    return {
      items: map_cross_vault_items(result),
      truncated: false,
      failed: false,
    };
  }

  const result = await services.search.search_omnibar(parsed.raw);
  return { items: result.items, truncated: false, failed: false };
}

function tagged_note_item(entry: TaggedNote): OmnibarItem {
  const detail = entry.match_detail ?? undefined;
  return {
    kind: "note",
    note: entry.note,
    score: 0,
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
// A picker opened from Text mode goes back to Text with the new chip.
async function add_tag_chip(
  input: ActionRegistrationInput,
  tag: string,
  before_tag: string,
) {
  const { tags, return_to_find } = input.stores.ui.omnibar;
  set_omnibar_state(input, {
    tags: has_tag(tags, tag) ? tags : [...tags, tag],
    query: before_tag ? `${before_tag} ` : "",
    scope: "current_vault",
    selected_index: 0,
  });
  if (return_to_find) {
    enter_find_mode(input);
    return;
  }
  await run_omnibar_search(input);
}

// Enter in tag suggestions adds the highlighted tag for the text in the input
// right now. Type-ahead can get here before the answer for the last keystroke
// (Cmd+T, "todo", Enter within a few ms): the rows on screen then belong to an
// older partial, and the first row of the "#" list is not #todo. While a
// search is in flight we ask the index again and ignore the rows on screen.
async function add_highlighted_tag_chip(input: ActionRegistrationInput) {
  const { stores, services } = input;
  const { query, tags, selected_index, is_searching } = stores.ui.omnibar;
  const parsed = parse_search_query(query);
  if (parsed.domain !== "tags") return;

  const rows: Array<{ tag: string }> = is_searching
    ? await services.tags.suggest_tags(parsed.text, tags, TAG_RESULT_LIMIT)
    : stores.search.omnibar_items.filter((item) => item.kind === "tag");
  // More typing, or Esc, while we asked: this Enter is out of date.
  if (stores.ui.omnibar.query !== query) return;

  const row = rows[Math.min(selected_index, rows.length - 1)];
  if (row) await add_tag_chip(input, row.tag, parsed.before_tag ?? "");
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

  // Cmd+O while open: this vault, and back to All from Text mode.
  registry.register({
    id: ACTION_IDS.omnibar_open,
    label: "Open Omnibar",
    execute: async () => {
      const { open, mode } = stores.ui.omnibar;
      if (open && mode === "find") {
        leave_find_mode(input, "all");
        await run_omnibar_search(input);
        return;
      }
      if (open) {
        await registry.execute(ACTION_IDS.omnibar_set_scope, "current_vault");
        return;
      }
      open_omnibar(input);
    },
  });

  // Find in Vault. Closed: open in Text mode on the last pattern. Notes: switch
  // to Text. Text: ask the omnibar to focus and select the pattern again.
  registry.register({
    id: ACTION_IDS.omnibar_open_find,
    label: "Find in Vault",
    when: () => stores.vault.vault !== null,
    execute: () => {
      const { open, mode } = stores.ui.omnibar;
      if (open && mode === "find") {
        stores.ui.vault_find.focus_nonce += 1;
        return;
      }
      if (open) {
        switch_notes_to_find(input);
        return;
      }
      set_omnibar_state(input, { open: true });
      enter_find_mode(input);
    },
  });

  // The All | Files | Text strip.
  registry.register({
    id: ACTION_IDS.omnibar_set_target,
    label: "Set Omnibar Search Target",
    execute: async (target: unknown) => {
      if (target === "text") {
        await registry.execute(ACTION_IDS.omnibar_open_find);
        return;
      }
      if (target !== "all" && target !== "files") return;
      const { mode, query } = stores.ui.omnibar;
      if (mode === "find") {
        leave_find_mode(input, target);
      } else {
        set_omnibar_state(input, {
          query: set_search_query_target(query, target),
          selected_index: 0,
        });
      }
      await run_omnibar_search(input);
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
      // Text mode: the input is the raw pattern, nothing is parsed. The find
      // reactor searches.
      if (stores.ui.omnibar.mode === "find") {
        stores.ui.vault_find.query = next_query;
        return;
      }
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
      if (is_done_picking_tag_for_find(input, next_query)) {
        enter_find_mode(input);
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
      // Text mode walks one vault, so all vaults goes back to Notes.
      if (new_scope === "all_vaults" && stores.ui.omnibar.mode === "find") {
        leave_find_mode(input, "all");
      }
      set_omnibar_state(input, {
        scope: new_scope,
        selected_index: 0,
        // Picking a scope ends the detour through the tag picker. Going back
        // to Text later would force this vault and undo the pick.
        return_to_find: false,
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
          mode: "notes",
          query: "",
          selected_index: 0,
          is_searching: false,
          scope: "current_vault",
          tags,
          return_to_find: false,
        });
        stores.search.clear_omnibar();
        await run_omnibar_search(input);
        return;
      }

      // Text mode: pick a tag in Notes mode, then come back to Text.
      if (stores.ui.omnibar.open && stores.ui.omnibar.mode === "find") {
        set_omnibar_state(input, {
          mode: "notes",
          query: "#",
          selected_index: 0,
          return_to_find: true,
        });
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
      if (is_done_picking_tag_for_find(input, next_query)) {
        enter_find_mode(input);
        return;
      }
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
    id: ACTION_IDS.omnibar_confirm_item,
    label: "Confirm Omnibar Item",
    execute: async (arg: unknown) => {
      const item = arg as OmnibarItem | undefined;
      if (!item) return;
      await confirm_item(input, item);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_confirm_tag_suggestion,
    label: "Confirm Omnibar Tag Suggestion",
    execute: async () => {
      await add_highlighted_tag_chip(input);
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

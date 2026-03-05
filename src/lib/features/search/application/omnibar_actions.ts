import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { OmnibarItem, OmnibarScope } from "$lib/shared/types/search";
import type { CommandId } from "$lib/features/search/types/command_palette";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import { parse_search_query } from "$lib/features/search/domain/search_query_parser";
import { as_note_path, type VaultId } from "$lib/shared/types/ids";

export const COMMAND_TO_ACTION_ID: Record<CommandId, string> = {
  create_new_note: ACTION_IDS.note_create,
  change_vault: ACTION_IDS.vault_request_change,
  open_settings: ACTION_IDS.settings_open,
  open_hotkeys: ACTION_IDS.settings_open,
  sync_index: ACTION_IDS.vault_sync_index,
  reindex_vault: ACTION_IDS.vault_reindex,
  show_vault_dashboard: ACTION_IDS.ui_open_vault_dashboard,
  git_version_history: ACTION_IDS.git_open_history,
  git_create_checkpoint: ACTION_IDS.git_open_checkpoint,
  git_init_repo: ACTION_IDS.git_init,
  toggle_links_panel: ACTION_IDS.ui_toggle_context_rail,
  toggle_outline_panel: ACTION_IDS.ui_toggle_outline_panel,
  check_for_updates: ACTION_IDS.app_check_for_updates,
};

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

async function search_omnibar_query(
  input: ActionRegistrationInput,
  query: string,
  scope: OmnibarScope,
) {
  const parsed_query = parse_search_query(query);

  if (scope === "all_vaults" && parsed_query.domain === "notes") {
    const result = await input.services.search.search_notes_all_vaults(query);
    if (input.stores.ui.omnibar.query.trim() !== query.trim()) {
      return;
    }
    if (input.stores.ui.omnibar.scope !== "all_vaults") {
      return;
    }
    input.stores.search.set_omnibar_items(map_cross_vault_items(result));
    return;
  }

  const result = await input.services.search.search_omnibar(query);
  if (input.stores.ui.omnibar.query.trim() !== query.trim()) {
    return;
  }
  if (input.stores.ui.omnibar.scope !== scope) {
    return;
  }
  input.stores.search.set_omnibar_items(result.items);
}

async function execute_command(
  input: ActionRegistrationInput,
  command_id: CommandId,
) {
  const { registry } = input;
  const action_id = COMMAND_TO_ACTION_ID[command_id];
  if (command_id === "open_hotkeys") {
    await registry.execute(action_id, "hotkeys");
  } else {
    await registry.execute(action_id);
  }
}

async function confirm_item(input: ActionRegistrationInput, item: OmnibarItem) {
  const { registry } = input;

  switch (item.kind) {
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
    execute: () => {
      open_omnibar(input);
    },
  });

  registry.register({
    id: ACTION_IDS.omnibar_open_all_vaults,
    label: "Open Omnibar (All Vaults)",
    execute: () => {
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
      const normalized_query = String(query);
      set_omnibar_state(input, {
        query: normalized_query,
        selected_index: 0,
      });

      if (!normalized_query.trim()) {
        set_omnibar_searching(input, false);
        stores.search.clear_omnibar();
        services.search.reset_search_notes_operation();
        return;
      }

      set_omnibar_searching(input, true);
      const scope = stores.ui.omnibar.scope;
      await search_omnibar_query(input, normalized_query, scope);
      set_omnibar_state(input, {
        is_searching: false,
        selected_index: clamp_selected_index(input),
      });
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
      });
      stores.search.clear_omnibar();

      const current_query = stores.ui.omnibar.query.trim();
      if (!current_query) return;

      set_omnibar_searching(input, true);
      await search_omnibar_query(input, current_query, new_scope);
      set_omnibar_state(input, {
        is_searching: false,
        selected_index: clamp_selected_index(input),
      });
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

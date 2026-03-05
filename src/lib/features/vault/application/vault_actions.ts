import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { is_unavailable_vault_error } from "$lib/features/vault/domain/vault_errors";
import type { EditorSettings } from "$lib/shared/types/editor_settings";
import type { VaultId } from "$lib/shared/types/ids";
import { toast } from "svelte-sonner";

async function apply_opened_vault(
  input: ActionRegistrationInput,
  editor_settings: EditorSettings,
) {
  input.stores.tab.reset();
  input.stores.editor.clear_open_note();
  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings(editor_settings);
  input.stores.ui.change_vault = {
    open: false,
    confirm_discard_open: false,
    is_loading: false,
    error: null,
  };
  await input.registry.execute(ACTION_IDS.folder_refresh_tree);
  await input.registry.execute(ACTION_IDS.git_check_repo);

  const persisted = await input.services.tab.load_tabs();
  if (persisted && persisted.tabs.length > 0) {
    await input.services.tab.restore_tabs(persisted);
  }

  if (input.stores.tab.tabs.length === 0) {
    input.services.note.create_new_note([]);
    const open_note = input.stores.editor.open_note;
    if (open_note) {
      input.stores.tab.open_tab(
        open_note.meta.path,
        open_note.meta.title || "Untitled",
      );
    }
  }
}

export function register_vault_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  let change_vault_request_revision = 0;
  let pending_discard_confirm_change: (() => Promise<void>) | null = null;

  const has_unsaved_editor_changes = (): boolean =>
    stores.editor.open_note?.is_dirty === true ||
    stores.tab.get_dirty_tabs().length > 0;

  const clear_discard_confirm_state = () => {
    pending_discard_confirm_change = null;
    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      confirm_discard_open: false,
      error: null,
    };
  };

  const run_with_unsaved_confirm = async (run_change: () => Promise<void>) => {
    if (!has_unsaved_editor_changes()) {
      await run_change();
      return;
    }

    pending_discard_confirm_change = run_change;
    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      open: false,
      confirm_discard_open: true,
      error: null,
    };
  };

  const handle_open_result = async (
    request_revision: number,
    result:
      | Awaited<ReturnType<typeof services.vault.change_vault_by_id>>
      | Awaited<ReturnType<typeof services.vault.select_pinned_vault_by_slot>>,
    attempted_vault_id?: VaultId,
  ) => {
    if (request_revision !== change_vault_request_revision) {
      return;
    }
    if (result.status === "opened") {
      await apply_opened_vault(input, result.editor_settings);
      if (result.editor_settings.show_vault_dashboard_on_open) {
        await registry.execute(ACTION_IDS.ui_open_vault_dashboard);
      }
      return;
    }
    if (result.status === "stale") {
      return;
    }
    if (result.status === "skipped") {
      stores.ui.change_vault = {
        ...stores.ui.change_vault,
        is_loading: false,
        error: null,
      };
      services.vault.reset_change_operation();
      return;
    }

    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      is_loading: false,
      error: result.error,
    };

    if (attempted_vault_id && is_unavailable_vault_error(result.error)) {
      stores.vault.set_vault_availability(attempted_vault_id, false);
    }
  };

  registry.register({
    id: ACTION_IDS.vault_request_change,
    label: "Request Change Vault",
    execute: () => {
      stores.ui.change_vault = {
        ...stores.ui.change_vault,
        open: true,
        error: null,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_close_change,
    label: "Close Change Vault Dialog",
    execute: () => {
      clear_discard_confirm_state();
      stores.ui.change_vault = {
        ...stores.ui.change_vault,
        open: false,
        error: null,
      };
      services.vault.reset_change_operation();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_choose,
    label: "Choose Vault",
    execute: async () => {
      await run_with_unsaved_confirm(async () => {
        const request_revision = ++change_vault_request_revision;
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: true,
          error: null,
        };

        stores.ui.set_system_dialog_open(true);
        const path_result = await services.vault.choose_vault_path();
        stores.ui.set_system_dialog_open(false);

        if (request_revision !== change_vault_request_revision) {
          return;
        }

        if (path_result.status === "cancelled") {
          stores.ui.change_vault = {
            ...stores.ui.change_vault,
            is_loading: false,
          };
          services.vault.reset_change_operation();
          return;
        }

        if (path_result.status === "failed") {
          stores.ui.change_vault = {
            ...stores.ui.change_vault,
            is_loading: false,
            error: path_result.error,
          };
          return;
        }

        const result = await services.vault.change_vault_by_path(
          path_result.path,
        );
        await handle_open_result(request_revision, result);
      });
    },
  });

  registry.register({
    id: ACTION_IDS.vault_select,
    label: "Select Vault",
    execute: async (vault_id: unknown) => {
      const selected_vault_id = vault_id as Parameters<
        typeof services.vault.change_vault_by_id
      >[0];
      await run_with_unsaved_confirm(async () => {
        const request_revision = ++change_vault_request_revision;
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: true,
          error: null,
        };

        const result =
          await services.vault.change_vault_by_id(selected_vault_id);
        await handle_open_result(request_revision, result, selected_vault_id);
      });
    },
  });

  registry.register({
    id: ACTION_IDS.vault_select_pinned_slot,
    label: "Select Pinned Vault Slot",
    execute: async (slot: unknown) => {
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
        return;
      }

      await run_with_unsaved_confirm(async () => {
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: true,
          error: null,
        };

        const request_revision = ++change_vault_request_revision;
        const result = await services.vault.select_pinned_vault_by_slot(slot);
        await handle_open_result(request_revision, result);
      });
    },
  });

  registry.register({
    id: ACTION_IDS.vault_confirm_save_change,
    label: "Confirm Save and Change Vault",
    execute: async () => {
      const run_change = pending_discard_confirm_change;
      if (!run_change) {
        clear_discard_confirm_state();
        return;
      }

      stores.ui.change_vault = {
        ...stores.ui.change_vault,
        is_loading: true,
        error: null,
      };

      const active_save = await services.note.save_note(null, true);
      if (active_save.status !== "saved") {
        const error =
          active_save.status === "failed"
            ? active_save.error
            : "Could not save current note before switching vault.";
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: false,
          error,
          confirm_discard_open: true,
        };
        return;
      }

      const remaining_dirty = stores.tab
        .get_dirty_tabs()
        .filter((t) => t.id !== stores.tab.active_tab_id);

      try {
        for (const tab of remaining_dirty) {
          const cached = stores.tab.get_cached_note(tab.id);
          if (cached) {
            await services.note.write_note_content(
              cached.meta.path,
              cached.markdown,
            );
          }
        }
      } catch {
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: false,
          error: "Could not save all open tabs before switching vault.",
          confirm_discard_open: true,
        };
        return;
      }

      clear_discard_confirm_state();
      await run_change();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_confirm_discard_change,
    label: "Confirm Discard and Change Vault",
    execute: async () => {
      const run_change = pending_discard_confirm_change;
      clear_discard_confirm_state();
      if (!run_change) {
        return;
      }
      await run_change();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_cancel_discard_change,
    label: "Cancel Discard and Change Vault",
    execute: () => {
      clear_discard_confirm_state();
      stores.ui.change_vault = {
        ...stores.ui.change_vault,
        open: true,
        is_loading: false,
        error: null,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_remove_from_registry,
    label: "Remove Vault From Registry",
    execute: async (vault_id: unknown) => {
      if (typeof vault_id !== "string") {
        return;
      }
      const result = await services.vault.remove_vault_from_registry(
        vault_id as VaultId,
      );
      if (result.status === "failed") {
        toast.error(result.error);
      } else {
        stores.vault.vault_git_cache.delete(vault_id as VaultId);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.vault_toggle_pin,
    label: "Toggle Vault Pin",
    execute: async (vault_id: unknown) => {
      if (typeof vault_id !== "string") {
        return;
      }
      const result = await services.vault.toggle_vault_pin(vault_id as VaultId);
      if (result.status === "failed") {
        toast.error(result.error);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.vault_open_switcher,
    label: "Quick Switch Vault",
    execute: () => {
      stores.ui.toggle_vault_switcher();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_fetch_git_info_for_list,
    label: "Fetch Git Info for Vault List",
    execute: async () => {
      const vaults = stores.vault.recent_vaults;
      await Promise.all(
        vaults.map(async (vault) => {
          if (stores.vault.vault_git_cache.has(vault.id)) return;
          const info = await services.git.get_git_info_for_path(vault.path);
          if (info) {
            stores.vault.set_vault_git_info(vault.id, info);
          }
        }),
      );
    },
  });

  registry.register({
    id: ACTION_IDS.vault_sync_index,
    label: "Sync Vault Index",
    when: () => stores.vault.vault !== null,
    execute: async () => {
      const result = await services.vault.sync_index();
      if (result.status === "failed") {
        toast.error(result.error);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.vault_reindex,
    label: "Reindex Vault",
    when: () => stores.vault.vault !== null,
    execute: async () => {
      const result = await services.vault.rebuild_index();
      if (result.status === "failed") {
        toast.error(result.error);
      }
    },
  });
}

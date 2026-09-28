import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { is_unavailable_vault_error } from "$lib/features/vault/domain/vault_errors";
import type { VaultId } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { toast } from "svelte-sonner";
import { apply_opened_vault_session } from "./vault_action_helpers";

export function register_vault_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  let change_vault_request_revision = 0;
  let pending_discard_confirm_change:
    | ((before_change?: () => boolean) => Promise<void>)
    | null = null;

  const has_unsaved_editor_changes = (): boolean =>
    stores.tab.has_tabs_requiring_save();

  const clear_discard_confirm_state = () => {
    pending_discard_confirm_change = null;
    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      confirm_discard_open: false,
      error: null,
      unsaved_note_label: null,
    };
  };

  const run_with_unsaved_confirm = async (run_change: () => Promise<void>) => {
    const run_change_with_session_persist = async (
      before_change?: () => boolean,
    ) => {
      await services.session.save_latest_session();
      if (before_change && !before_change()) return;
      await run_change();
    };

    if (!has_unsaved_editor_changes()) {
      await run_change_with_session_persist();
      return;
    }

    pending_discard_confirm_change = run_change_with_session_persist;
    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      open: false,
      confirm_discard_open: true,
      error: null,
      unsaved_note_label: stores.tab.resolve_unsaved_tabs_label(),
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
      await apply_opened_vault_session(input, result.editor_settings);
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
        unsaved_note_label: null,
      };
      services.vault.reset_change_operation();
      return;
    }

    stores.ui.change_vault = {
      ...stores.ui.change_vault,
      is_loading: false,
      error: result.error,
      unsaved_note_label: null,
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
            unsaved_note_label: null,
          };
          services.vault.reset_change_operation();
          return;
        }

        if (path_result.status === "failed") {
          stores.ui.change_vault = {
            ...stores.ui.change_vault,
            is_loading: false,
            error: path_result.error,
            unsaved_note_label: null,
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

      const tabs_requiring_save = stores.tab.get_tabs_requiring_save();
      const vault_generation = stores.vault.generation;
      const saved_notes = new Map<string, OpenNoteState>();
      const is_current_request = () =>
        stores.vault.generation === vault_generation &&
        pending_discard_confirm_change === run_change;
      const saved_tabs_are_current = () => {
        services.editor.flush();
        for (const [tab_id, saved] of saved_notes) {
          const active = stores.editor.open_note;
          const latest =
            active?.meta.path === saved.meta.path
              ? active
              : stores.tab.get_cached_note(tab_id);
          if (
            !latest ||
            latest.buffer_id !== saved.buffer_id ||
            latest.markdown !== saved.markdown
          )
            return false;
        }
        return !stores.tab
          .get_tabs_requiring_save()
          .some((tab) => !saved_notes.has(tab.id));
      };
      const active_tab_id = stores.tab.active_tab_id;
      const active_tab_requires_save =
        active_tab_id !== null &&
        tabs_requiring_save.some((tab) => tab.id === active_tab_id);

      if (active_tab_requires_save) {
        const origin = stores.editor.open_note;
        const active_save = await services.note.save_note(null, true);
        if (!is_current_request()) return;
        services.editor.flush();
        const latest = stores.editor.open_note;
        if (
          active_save.status !== "saved" ||
          !origin ||
          !latest ||
          latest.buffer_id !== origin.buffer_id ||
          latest.meta.path !== origin.meta.path ||
          latest.is_dirty
        ) {
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
        saved_notes.set(active_tab_id, latest);
      }

      const background_tabs_requiring_save = tabs_requiring_save.filter(
        (tab) => tab.id !== active_tab_id,
      );

      try {
        for (const tab of background_tabs_requiring_save) {
          const cached = stores.tab.get_cached_note(tab.id);
          if (!cached) {
            throw new Error("missing cached note");
          }

          const saved_mtime_ms = await services.note.write_note_content(
            cached.meta.path,
            cached.markdown,
          );
          if (!is_current_request()) return;
          if (saved_mtime_ms === undefined) throw new Error("write skipped");
          services.editor.flush();
          const active = stores.editor.open_note;
          const is_active = active?.meta.path === cached.meta.path;
          const latest = is_active
            ? active
            : stores.tab.get_cached_note(tab.id);
          if (
            !latest ||
            latest.buffer_id !== cached.buffer_id ||
            latest.meta.path !== cached.meta.path
          )
            throw new Error("saved buffer changed");
          const is_dirty = latest.markdown !== cached.markdown;
          stores.tab.set_cached_note(tab.id, {
            ...latest,
            meta: { ...latest.meta, mtime_ms: saved_mtime_ms },
            is_dirty,
          });
          stores.tab.set_dirty(tab.id, is_dirty);
          if (is_active)
            stores.editor.update_mtime(latest.meta.id, saved_mtime_ms);
          services.editor.mark_clean(cached.meta.path, cached.markdown);
          if (is_dirty) throw new Error("note changed during save");
          saved_notes.set(tab.id, cached);
        }

        if (!saved_tabs_are_current())
          throw new Error("note changed during save");
      } catch {
        if (!is_current_request()) return;
        stores.ui.change_vault = {
          ...stores.ui.change_vault,
          is_loading: false,
          error: "Could not save all open tabs before switching vault.",
          confirm_discard_open: true,
        };
        return;
      }

      await run_change(() => {
        if (!is_current_request()) return false;
        if (!saved_tabs_are_current()) {
          stores.ui.change_vault = {
            ...stores.ui.change_vault,
            is_loading: false,
            error: "Could not save all open tabs before switching vault.",
            confirm_discard_open: true,
          };
          return false;
        }
        clear_discard_confirm_state();
        return true;
      });
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
        unsaved_note_label: null,
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

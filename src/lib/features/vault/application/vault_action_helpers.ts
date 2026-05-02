import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { open_active_tab_note } from "$lib/features/tab";
import { to_editor_buffer_view_state } from "$lib/shared/types/editor";
import type { EditorSettings } from "$lib/shared/types/editor_settings";

function sync_mounted_editor_to_active_tab(
  input: ActionRegistrationInput,
): void {
  if (!input.services.editor.is_mounted()) {
    return;
  }

  const active_tab = input.stores.tab.active_tab;
  const open_note = input.stores.editor.open_note;
  if (!active_tab || !open_note) {
    return;
  }
  if (active_tab.note_path !== open_note.meta.path) {
    return;
  }

  const snapshot = input.stores.tab.get_snapshot(active_tab.id);
  input.services.editor.open_buffer(
    open_note,
    "reuse_cache",
    to_editor_buffer_view_state(snapshot),
  );
  input.services.editor.set_scroll_top(snapshot?.scroll_top ?? 0);
}

export async function apply_opened_vault_session(
  input: ActionRegistrationInput,
  editor_settings: EditorSettings,
): Promise<void> {
  input.stores.tab.reset();
  input.stores.editor.clear_open_note();
  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings(editor_settings);
  input.stores.ui.change_vault = {
    open: false,
    confirm_discard_open: false,
    is_loading: false,
    error: null,
    unsaved_note_label: null,
  };

  await input.registry.execute(ACTION_IDS.folder_refresh_tree);
  await input.registry.execute(ACTION_IDS.git_check_repo);
  await input.registry.execute(ACTION_IDS.user_load);

  const session = await input.services.session.load_latest_session();
  if (session && session.tabs.length > 0) {
    await input.services.session.restore_latest_session(session);
  }

  if (input.stores.tab.tabs.length > 0) {
    await open_active_tab_note(input);
    sync_mounted_editor_to_active_tab(input);
    return;
  }

  input.services.note.create_new_note([]);
  const open_note = input.stores.editor.open_note;
  if (!open_note) {
    return;
  }

  input.stores.tab.open_tab(
    open_note.meta.path,
    open_note.meta.title || "Untitled",
  );
}

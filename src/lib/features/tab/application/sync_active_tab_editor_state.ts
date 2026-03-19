import type { EditorService, EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";

export function sync_active_tab_editor_state(
  tab_store: TabStore,
  editor_store: EditorStore,
  editor_service: Pick<
    EditorService,
    "get_scroll_top" | "get_code_block_heights"
  >,
): void {
  const active_tab = tab_store.active_tab;
  const open_note = editor_store.open_note;
  if (!active_tab || !open_note) {
    return;
  }
  if (active_tab.note_path !== open_note.meta.path) {
    return;
  }

  const snapshot = {
    scroll_top: editor_service.get_scroll_top(),
    cursor: editor_store.cursor,
    code_block_heights: editor_service.get_code_block_heights(),
  };

  tab_store.set_snapshot(active_tab.id, snapshot);
  tab_store.set_cached_note(active_tab.id, open_note);
}

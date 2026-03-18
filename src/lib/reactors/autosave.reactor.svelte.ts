import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { TabService, TabStore } from "$lib/features/tab";
import { is_draft_note_path } from "$lib/features/note";

export function create_autosave_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  ui_store: UIStore,
  note_service: NoteService,
  tab_service: TabService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!ui_store.editor_settings.autosave_enabled) {
        return;
      }

      const open_note = editor_store.open_note;
      if (!tab_store.is_open_note_dirty(open_note)) return;
      if (!open_note) return;
      if (is_draft_note_path(open_note.meta.path)) return;

      const note_snapshot = open_note;
      const note_path = open_note.meta.path;
      const delay = ui_store.editor_settings.autosave_delay_ms;

      const handle = setTimeout(() => {
        void note_service.save_note(null, true).then((result) => {
          if (result.status === "saved") {
            tab_service.reconcile_saved_note({
              ...note_snapshot,
              is_dirty: false,
              meta: {
                ...note_snapshot.meta,
                path: result.saved_path,
                id: result.saved_path,
                mtime_ms: result.saved_mtime_ms,
              },
            });
          }
          if (result.status === "conflict") {
            tab_service.mark_conflict(note_path);
          }
        });
      }, delay);

      return () => {
        clearTimeout(handle);
      };
    });
  });
}

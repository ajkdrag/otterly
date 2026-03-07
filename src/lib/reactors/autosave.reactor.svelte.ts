import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { TabService } from "$lib/features/tab";
import { is_draft_note_path } from "$lib/features/note";

const AUTOSAVE_DELAY_MS = 2000;

export function create_autosave_reactor(
  editor_store: EditorStore,
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
      if (!open_note?.is_dirty) return;
      if (is_draft_note_path(open_note.meta.path)) return;

      const note_path = open_note.meta.path;

      const handle = setTimeout(() => {
        void note_service.save_note(null, true).then((result) => {
          if (result.status === "conflict") {
            tab_service.mark_conflict(note_path);
          }
        });
      }, AUTOSAVE_DELAY_MS);

      return () => {
        clearTimeout(handle);
      };
    });
  });
}

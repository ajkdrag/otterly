import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import {
  active_note_conflict_callbacks,
  type ConflictToastManager,
} from "$lib/reactors/conflict_toast";

const AUTOSAVE_DELAY_MS = 2000;

export function create_autosave_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  note_service: NoteService,
  conflict_toast_manager: ConflictToastManager,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!ui_store.editor_settings.autosave_enabled) {
        return;
      }

      const open_note = editor_store.open_note;
      if (!open_note?.is_dirty) return;
      if (!open_note.meta.path.endsWith(".md")) return;

      const note_path = open_note.meta.path;
      const note_id = open_note.meta.id;

      const handle = setTimeout(() => {
        void note_service.save_note(null, true).then((result) => {
          if (result.status === "conflict") {
            conflict_toast_manager.show(
              note_path,
              active_note_conflict_callbacks(note_path, note_id, note_service),
            );
          }
        });
      }, AUTOSAVE_DELAY_MS);

      return () => {
        clearTimeout(handle);
      };
    });
  });
}

import type { VaultStore } from "$lib/features/vault";
import type { EditorStore, EditorService } from "$lib/features/editor";
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
  vault_store: VaultStore,
  editor_service: EditorService,
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

      const vault_generation = vault_store.generation;
      const buffer_id = open_note.buffer_id;
      const note_path = open_note.meta.path;
      const delay = ui_store.editor_settings.autosave_delay_ms;

      const handle = setTimeout(() => {
        if (
          vault_store.generation !== vault_generation ||
          editor_store.open_note?.buffer_id !== buffer_id
        )
          return;
        editor_service.flush();
        const note_snapshot = editor_store.open_note;
        if (!note_snapshot || note_snapshot.meta.path !== note_path) return;
        void note_service.save_note(null, true).then((result) => {
          if (vault_store.generation !== vault_generation) return;
          const active_note = editor_store.open_note;
          if (
            result.status === "saved" &&
            active_note?.buffer_id === buffer_id
          ) {
            editor_service.flush();
          }
          const latest_note =
            editor_store.open_note?.meta.path === note_path
              ? editor_store.open_note
              : tab_store.get_cached_note(note_path);
          if (latest_note && latest_note.buffer_id !== buffer_id) return;
          if (!tab_store.find_tab_by_path(note_path)) return;
          if (result.status === "saved") {
            tab_service.reconcile_saved_note(
              {
                ...note_snapshot,
                meta: {
                  ...note_snapshot.meta,
                  path: result.saved_path,
                  id: result.saved_path,
                  mtime_ms: result.saved_mtime_ms,
                },
              },
              latest_note ?? undefined,
            );
            editor_service.mark_clean(
              result.saved_path,
              note_snapshot.markdown,
            );
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

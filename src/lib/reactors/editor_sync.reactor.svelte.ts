import type { EditorStore } from "$lib/features/editor";
import type { EditorService } from "$lib/features/editor";
import type { BufferRestorePolicy } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";

export function resolve_editor_sync_open(input: {
  open_note_id: string;
  open_note_buffer_id: string;
  last_note_id: string | null;
  last_buffer_id: string | null;
}): boolean {
  return (
    input.open_note_id !== input.last_note_id ||
    input.open_note_buffer_id !== input.last_buffer_id
  );
}

export function resolve_editor_sync_restore_policy(input: {
  open_note_id: string;
  last_note_id: string | null;
}): BufferRestorePolicy {
  if (input.open_note_id !== input.last_note_id) {
    return "reuse_cache";
  }
  return "fresh";
}

export function create_editor_sync_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  editor_service: EditorService,
): () => void {
  let last_note_id: string | null = null;
  let last_buffer_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;

      if (!open_note) {
        last_note_id = null;
        last_buffer_id = null;
        return;
      }

      if (!editor_service.is_mounted()) {
        last_note_id = open_note.meta.id;
        last_buffer_id = open_note.buffer_id;
        return;
      }

      const previous_note_id = last_note_id;
      const should_open = resolve_editor_sync_open({
        open_note_id: open_note.meta.id,
        open_note_buffer_id: open_note.buffer_id,
        last_note_id: previous_note_id,
        last_buffer_id,
      });

      last_note_id = open_note.meta.id;
      last_buffer_id = open_note.buffer_id;

      if (!should_open) return;
      const restore_policy = resolve_editor_sync_restore_policy({
        open_note_id: open_note.meta.id,
        last_note_id: previous_note_id,
      });
      editor_service.open_buffer(open_note, restore_policy);
      const snapshot = tab_store.active_tab
        ? tab_store.get_snapshot(tab_store.active_tab.id)
        : null;
      editor_service.restore_cursor(snapshot?.cursor ?? null);
    });
  });
}

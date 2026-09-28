import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { NotePath } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";

export class TabService {
  constructor(private readonly tab_store: TabStore) {}

  sync_dirty_state(tab_id: string, is_dirty: boolean) {
    this.tab_store.set_dirty(tab_id, is_dirty);
  }

  reconcile_saved_note(saved_note: OpenNoteState, latest_note?: OpenNoteState) {
    const tab = this.tab_store.find_tab_by_path(saved_note.meta.path);
    if (!tab) return;
    const current =
      latest_note ?? this.tab_store.get_cached_note(tab.id) ?? saved_note;
    if (
      current.buffer_id !== saved_note.buffer_id ||
      current.meta.path !== saved_note.meta.path
    )
      return;
    const updated = {
      ...current,
      meta: { ...current.meta, mtime_ms: saved_note.meta.mtime_ms },
      is_dirty: current.markdown !== saved_note.markdown,
    };
    this.tab_store.set_cached_note(tab.id, updated);
    this.tab_store.set_dirty(tab.id, updated.is_dirty);
  }

  mark_conflict(note_path: NotePath) {
    this.tab_store.mark_conflict(note_path);
  }

  clear_conflict(note_path: NotePath) {
    this.tab_store.clear_conflict(note_path);
  }

  has_conflict(note_path: NotePath): boolean {
    return this.tab_store.has_conflict(note_path);
  }

  invalidate_cache(note_path: NotePath) {
    this.tab_store.invalidate_cache_by_path(note_path);
  }

  remove_tab(note_path: NotePath) {
    this.tab_store.remove_tab_by_path(note_path);
  }
}

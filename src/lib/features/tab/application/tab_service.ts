import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { NotePath } from "$lib/shared/types/ids";

export class TabService {
  constructor(private readonly tab_store: TabStore) {}

  sync_dirty_state(tab_id: string, is_dirty: boolean) {
    this.tab_store.set_dirty(tab_id, is_dirty);
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

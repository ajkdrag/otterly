import type { EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";
import type { TabService } from "$lib/features/tab";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab";

export function resolve_tab_dirty_sync(
  open_note: OpenNoteState | null,
  active_tab: Tab | null,
): { tab_id: string; is_dirty: boolean } | null {
  if (!open_note || !active_tab) return null;
  if (active_tab.kind !== "note") return null;
  if (open_note.meta.path !== active_tab.note_path) return null;
  return { tab_id: active_tab.id, is_dirty: open_note.is_dirty };
}

export function create_tab_dirty_sync_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  tab_service: TabService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;
      const active_tab = tab_store.active_tab;
      const sync_target = resolve_tab_dirty_sync(open_note, active_tab);
      if (!sync_target) return;
      tab_service.sync_dirty_state(sync_target.tab_id, sync_target.is_dirty);
    });
  });
}

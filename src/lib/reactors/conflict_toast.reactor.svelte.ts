import type { EditorStore } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { TabService, TabStore } from "$lib/features/tab";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import type { ConflictToastManager } from "$lib/reactors/conflict_toast";

export type ConflictToastTarget = {
  note_id: NoteId;
  note_path: NotePath;
} | null;

type ConflictToastCallbacks = {
  on_reload: () => void;
  on_keep: () => void;
};

export function resolve_conflict_toast_target(
  active_tab: TabStore["active_tab"],
  open_note: EditorStore["open_note"],
  has_conflict: (note_path: NotePath) => boolean,
): ConflictToastTarget {
  if (!active_tab || !open_note) return null;
  if (!active_tab.is_dirty) return null;
  if (!paths_equal_ignore_case(active_tab.note_path, open_note.meta.path)) {
    return null;
  }
  if (!has_conflict(active_tab.note_path)) return null;

  return {
    note_id: open_note.meta.id,
    note_path: active_tab.note_path,
  };
}

export function create_conflict_toast_callbacks(
  target: NonNullable<ConflictToastTarget>,
  tab_service: Pick<TabService, "clear_conflict" | "invalidate_cache">,
  note_service: Pick<NoteService, "open_note" | "skip_mtime_guard">,
): ConflictToastCallbacks {
  return {
    on_reload: () => {
      tab_service.clear_conflict(target.note_path);
      tab_service.invalidate_cache(target.note_path);
      void note_service.open_note(target.note_path, false, {
        force_reload: true,
      });
    },
    on_keep: () => {
      tab_service.clear_conflict(target.note_path);
      note_service.skip_mtime_guard(target.note_id);
    },
  };
}

export function create_conflict_toast_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  tab_service: TabService,
  note_service: NoteService,
  conflict_toast_manager: ConflictToastManager,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const active_tab = tab_store.active_tab;
      const open_note = editor_store.open_note;
      const _conflicts = tab_store.conflicted_note_paths;

      const target = resolve_conflict_toast_target(
        active_tab,
        open_note,
        (note_path) => tab_store.has_conflict(note_path),
      );

      if (!target) {
        conflict_toast_manager.dismiss();
        return;
      }

      conflict_toast_manager.show(
        target.note_path,
        create_conflict_toast_callbacks(target, tab_service, note_service),
      );
    });

    return () => {
      conflict_toast_manager.dismiss_all();
    };
  });
}

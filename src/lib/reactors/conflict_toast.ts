import { toast } from "svelte-sonner";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import type { NoteService } from "$lib/features/note";

type ConflictCallbacks = {
  on_reload: () => void;
  on_keep: () => void;
};

/**
 * Deduplicating manager for conflict toasts. At most one toast per note path
 * is shown at a time. Shared between the watcher and autosave reactors.
 */
export class ConflictToastManager {
  private active = new Map<string, string | number>();

  /** Shows a conflict toast for the given path. No-op if one is already active. */
  show(note_path: string, callbacks: ConflictCallbacks): void {
    if (this.active.has(note_path)) return;

    const tid = toast.warning("Note modified externally", {
      description: "Reload from disk or keep your changes?",
      classes: { toast: "toast--stacked-actions" },
      duration: Infinity,
      action: {
        label: "Reload from disk",
        onClick: () => {
          this.active.delete(note_path);
          callbacks.on_reload();
        },
      },
      cancel: {
        label: "Keep my changes",
        onClick: () => {
          this.active.delete(note_path);
          callbacks.on_keep();
        },
      },
    });
    this.active.set(note_path, tid);
  }

  dismiss_all(): void {
    for (const tid of this.active.values()) {
      toast.dismiss(tid);
    }
    this.active.clear();
  }
}

/**
 * Creates conflict callbacks for the currently-open note.
 * "Reload" re-opens from disk; "Keep" zeroes the mtime guard so the
 * next save overwrites without a conflict check.
 */
export function active_note_conflict_callbacks(
  note_path: NotePath,
  note_id: NoteId,
  note_service: NoteService,
): ConflictCallbacks {
  return {
    on_reload: () => {
      void note_service.open_note(note_path, false, { force_reload: true });
    },
    on_keep: () => {
      note_service.skip_mtime_guard(note_id);
    },
  };
}

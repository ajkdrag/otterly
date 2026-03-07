import type { EditorStore } from "$lib/features/editor";
import type { GitStore } from "$lib/features/git";
import type { UIStore } from "$lib/app";
import type { GitService } from "$lib/features/git";
import { is_draft_note_path } from "$lib/features/note";

const AUTOCOMMIT_DELAY_MS = 30_000;
const RETRY_DELAY_WHILE_COMMITTING_MS = 1_000;

export function create_git_autocommit_reactor(
  editor_store: EditorStore,
  git_store: GitStore,
  ui_store: UIStore,
  git_service: GitService,
): () => void {
  return $effect.root(() => {
    let commit_handle: ReturnType<typeof setTimeout> | null = null;
    const dirty_paths = new Set<string>();
    const pending_paths = new Set<string>();

    const clear_commit_handle = () => {
      if (!commit_handle) return;
      clearTimeout(commit_handle);
      commit_handle = null;
    };

    const schedule_commit = (delay_ms: number) => {
      clear_commit_handle();
      commit_handle = setTimeout(() => {
        if (!git_store.enabled) {
          pending_paths.clear();
          return;
        }
        if (pending_paths.size === 0) {
          return;
        }
        if (git_store.sync_status === "committing") {
          schedule_commit(RETRY_DELAY_WHILE_COMMITTING_MS);
          return;
        }
        const paths = Array.from(pending_paths);
        pending_paths.clear();
        void git_service.auto_commit(paths);
      }, delay_ms);
    };

    $effect(() => {
      if (git_store.enabled) return;
      clear_commit_handle();
      dirty_paths.clear();
      pending_paths.clear();
    });

    $effect(() => {
      if (!git_store.enabled) return;
      if (!ui_store.editor_settings.git_autocommit_enabled) return;

      const open_note = editor_store.open_note;
      if (!open_note) return;

      const path = open_note.meta.path;
      if (is_draft_note_path(path)) return;

      if (open_note.is_dirty) {
        dirty_paths.add(path);
        return;
      }
      if (!dirty_paths.has(path)) return;

      dirty_paths.delete(path);
      pending_paths.add(path);
      schedule_commit(AUTOCOMMIT_DELAY_MS);
    });

    return () => {
      clear_commit_handle();
      dirty_paths.clear();
      pending_paths.clear();
    };
  });
}

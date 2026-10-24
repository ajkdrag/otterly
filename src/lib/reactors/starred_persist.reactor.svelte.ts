import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";

const STARRED_PATHS_PERSIST_DELAY_MS = 400;

// The list as this window last loaded or saved it. Another profile can change
// the file meanwhile, so we save only the difference from this list. It is an
// object so a save still queued when the vault changes updates the old vault's
// list, not the new one's.
type SavedStarredPaths = { paths: string[] };

export function create_starred_persist_reactor(
  notes_store: NotesStore,
  vault_store: VaultStore,
  vault_service: VaultService,
) {
  let active_vault_id = vault_store.vault?.id ?? null;
  let saved: SavedStarredPaths | null = null;
  let pending_paths: string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Every save reads the list on disk and writes it back, so two saves that
  // overlap could lose a change. They run one after another instead.
  let save_chain: Promise<unknown> = Promise.resolve();

  function schedule_persist(starred_paths: string[]) {
    pending_paths = starred_paths;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush_pending, STARRED_PATHS_PERSIST_DELAY_MS);
  }

  function flush_pending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const paths = pending_paths;
    pending_paths = null;
    const vault_id = active_vault_id;
    const target = saved;
    if (!vault_id || !paths || !target) {
      return;
    }
    save_chain = save_chain.then(() => save_change(vault_id, target, paths));
  }

  // Compares with the list as of now, after the saves ahead of us finished.
  function save_change(
    vault_id: VaultId,
    target: SavedStarredPaths,
    paths: string[],
  ): Promise<void> {
    if (JSON.stringify(paths) === JSON.stringify(target.paths)) {
      return Promise.resolve();
    }
    return vault_service
      .save_starred_paths(vault_id, target.paths, paths)
      .then((was_saved) => {
        // After a failed save the next one still starts from the old list, so
        // it carries this change too.
        if (was_saved) {
          target.paths = [...paths];
        }
      });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const starred_paths = notes_store.starred_paths;

      if (vault_id !== active_vault_id) {
        flush_pending();
        active_vault_id = vault_id;
        saved = null;
      }

      if (!vault_id) {
        return;
      }
      if (!saved) {
        // First look at this vault: what was loaded is what the file holds.
        saved = { paths: [...starred_paths] };
        return;
      }
      schedule_persist(starred_paths);
    });

    return () => {
      flush_pending();
    };
  });
}

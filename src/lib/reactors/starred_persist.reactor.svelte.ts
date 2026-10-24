import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";

const STARRED_PATHS_PERSIST_DELAY_MS = 400;

export function create_starred_persist_reactor(
  notes_store: NotesStore,
  vault_store: VaultStore,
  vault_service: VaultService,
) {
  let active_vault_id = vault_store.vault?.id ?? null;
  // The list as this window last loaded or saved it. Another profile can change
  // the file meanwhile, so we save only the difference from this list.
  let saved_paths: string[] | null = null;
  let pending_paths: string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

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
    if (!active_vault_id || !paths || !saved_paths) {
      return;
    }
    if (JSON.stringify(paths) === JSON.stringify(saved_paths)) {
      return;
    }

    const previous_paths = saved_paths;
    saved_paths = [...paths];
    void vault_service.save_starred_paths(
      active_vault_id,
      previous_paths,
      paths,
    );
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const starred_paths = notes_store.starred_paths;

      if (vault_id !== active_vault_id) {
        flush_pending();
        active_vault_id = vault_id;
        saved_paths = null;
      }

      if (!vault_id) {
        return;
      }
      if (!saved_paths) {
        // First look at this vault: what was loaded is what the file holds.
        saved_paths = [...starred_paths];
        return;
      }
      schedule_persist(starred_paths);
    });

    return () => {
      flush_pending();
    };
  });
}

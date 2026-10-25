import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";

const STARRED_PATHS_PERSIST_DELAY_MS = 400;

export function create_starred_persist_reactor(
  notes_store: NotesStore,
  vault_store: VaultStore,
  vault_service: VaultService,
) {
  let active_vault_id = vault_store.vault?.id ?? null;
  let last_saved_serialized: string | null = null;
  let pending_paths: string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule_persist(vault_id: VaultId, starred_paths: string[]) {
    const serialized = JSON.stringify(starred_paths);
    if (serialized === last_saved_serialized) {
      return;
    }

    pending_paths = starred_paths;
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      const paths = pending_paths;
      pending_paths = null;
      timer = null;
      if (!paths) {
        return;
      }
      void vault_service.save_starred_paths(vault_id, paths).then(() => {
        last_saved_serialized = JSON.stringify(paths);
      });
    }, STARRED_PATHS_PERSIST_DELAY_MS);
  }

  function flush_pending() {
    if (!active_vault_id || !pending_paths) {
      pending_paths = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return;
    }

    const paths = pending_paths;
    pending_paths = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void vault_service.save_starred_paths(active_vault_id, paths).then(() => {
      last_saved_serialized = JSON.stringify(paths);
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const starred_paths = notes_store.starred_paths;

      if (vault_id !== active_vault_id) {
        flush_pending();
        active_vault_id = vault_id;
        last_saved_serialized = null;
      }

      if (!vault_id) {
        return;
      }
      schedule_persist(vault_id, starred_paths);
    });

    return () => {
      flush_pending();
    };
  });
}

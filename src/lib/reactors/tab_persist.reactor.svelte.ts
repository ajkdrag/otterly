import type { TabStore } from "$lib/features/tab";
import type { VaultStore } from "$lib/features/vault";
import type { TabService } from "$lib/features/tab";
import type { VaultId } from "$lib/shared/types/ids";

const TAB_PERSIST_DELAY_MS = 1000;

export function create_tab_persist_reactor(
  tab_store: TabStore,
  vault_store: VaultStore,
  tab_service: TabService,
): () => void {
  let active_vault_id: VaultId | null = null;
  let last_saved_serialized: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule_persist() {
    const serialized = JSON.stringify({
      tabs: tab_store.tabs.map((t) => ({
        p: t.kind === "note" ? t.note_path : t.file_path,
        pin: t.is_pinned,
      })),
      active: tab_store.active_tab_id,
    });
    if (serialized === last_saved_serialized) return;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void tab_service.save_tabs().then(() => {
        last_saved_serialized = serialized;
      });
    }, TAB_PERSIST_DELAY_MS);
  }

  function flush_pending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!active_vault_id) return;
    void tab_service.save_tabs().then(() => {
      last_saved_serialized = null;
    });
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const _tabs = tab_store.tabs;
      const _active = tab_store.active_tab_id;

      if (vault_id !== active_vault_id) {
        flush_pending();
        active_vault_id = vault_id;
        last_saved_serialized = null;
      }

      if (!vault_id || !vault_store.is_vault_mode) return;
      schedule_persist();
    });

    return () => {
      flush_pending();
    };
  });
}

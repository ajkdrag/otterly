import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { VaultStore } from "$lib/features/vault";
import {
  build_vault_find_request,
  type VaultFindService,
} from "$lib/features/search";

const VAULT_FIND_DEBOUNCE_MS = 200;

// Runs the vault find while you type in the panel, and again when another
// vault opens. An empty query clears the results right away.
export function create_vault_find_reactor(
  ui_store: UIStore,
  vault_store: VaultStore,
  vault_find_service: Pick<VaultFindService, "search" | "clear">,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Toggling a row with nothing in it does not change the request. Skip
  // the search then, so results do not flash.
  let last_key: string | null = null;

  function cancel_pending() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const request = build_vault_find_request(ui_store.vault_find);
      const key = JSON.stringify([vault_id, request]);
      if (key === last_key) return;
      last_key = key;
      cancel_pending();

      if (!vault_id || !request) {
        untrack(() => {
          vault_find_service.clear();
        });
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void vault_find_service.search(request);
      }, VAULT_FIND_DEBOUNCE_MS);
    });

    return cancel_pending;
  });
}

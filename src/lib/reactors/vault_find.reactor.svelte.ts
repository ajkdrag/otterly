import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { VaultStore } from "$lib/features/vault";
import {
  build_vault_find_request,
  type VaultFindService,
} from "$lib/features/search";

const VAULT_FIND_DEBOUNCE_MS = 200;

// Runs the vault find while you type in the panel, and again when another
// vault opens. An empty query clears the results right away. The replacement
// text is not part of the request, so editing it never searches again.
export function create_vault_find_reactor(
  ui_store: UIStore,
  vault_store: VaultStore,
  vault_find_service: Pick<VaultFindService, "search" | "clear">,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The vault store can hand us a new vault object with the same id. That
  // is not a new request. Skip the search then, so results do not flash.
  let last_key: string | null = null;
  let last_vault_id: string | null = null;

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
      const vault_changed = vault_id !== last_vault_id;
      last_key = key;
      last_vault_id = vault_id;
      cancel_pending();

      if (!vault_id || !request) {
        untrack(() => {
          vault_find_service.clear();
        });
        return;
      }
      // The old vault's walk must not keep streaming files into the new
      // vault's results while the debounce waits.
      if (vault_changed) {
        untrack(() => {
          vault_find_service.clear();
        });
      }
      timer = setTimeout(() => {
        timer = null;
        void vault_find_service.search(request);
      }, VAULT_FIND_DEBOUNCE_MS);
    });

    return cancel_pending;
  });
}

import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { VaultStore } from "$lib/features/vault";
import {
  build_vault_find_request,
  vault_find_request_key,
  type VaultFindService,
} from "$lib/features/search";

const VAULT_FIND_DEBOUNCE_MS = 200;

// Runs the vault find while the omnibar is open in Text mode:
//
//   not active          -> clear, if it was active (close or a mode switch)
//   empty pattern       -> clear
//   just became active  -> search now, so reopening shows results at once
//   request changed     -> search after 200 ms of no typing
//
// The replacement and the selection are not part of the request, so editing
// the replacement or moving through matches never searches again.
export function create_vault_find_reactor(
  ui_store: UIStore,
  vault_store: VaultStore,
  vault_find_service: Pick<VaultFindService, "search" | "clear">,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let was_active = false;
  // The vault store can hand us a new vault object with the same id. That
  // is not a new request, so the key holds the id, not the object.
  let last_key: string | null = null;

  function cancel_pending() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  return $effect.root(() => {
    $effect(() => {
      const { omnibar, vault_find } = ui_store;
      const vault_id = vault_store.vault?.id ?? null;
      const active =
        omnibar.open && omnibar.mode === "find" && vault_id !== null;
      if (!active) {
        if (!was_active) return;
        was_active = false;
        last_key = null;
        cancel_pending();
        untrack(() => {
          vault_find_service.clear();
        });
        return;
      }

      const request = build_vault_find_request(vault_find, omnibar.tags);
      const key = request
        ? JSON.stringify([vault_id, vault_find_request_key(request)])
        : null;
      const just_became_active = !was_active;
      if (!just_became_active && key === last_key) return;
      was_active = true;
      last_key = key;
      cancel_pending();

      if (!request) {
        untrack(() => {
          vault_find_service.clear();
        });
        return;
      }
      // search() reads and writes the result store. Untracked, so its reads
      // do not become dependencies of this effect.
      if (just_became_active) {
        untrack(() => {
          void vault_find_service.search(request);
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

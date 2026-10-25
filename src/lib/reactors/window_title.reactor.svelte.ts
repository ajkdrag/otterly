import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import type { Vault } from "$lib/shared/types/vault";
import type { Tab } from "$lib/features/tab";

const APP_NAME = "otterly";

export function resolve_window_title(
  vault: Vault | null,
  active_tab: Tab | null,
): string {
  if (!vault) return APP_NAME;
  if (!active_tab) return vault.name;

  const prefix = active_tab.is_dirty ? "∘ " : "";
  return `${prefix}${active_tab.title} — ${vault.name}`;
}

export function create_window_title_reactor(
  vault_store: VaultStore,
  tab_store: TabStore,
  set_title: (title: string) => void,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      set_title(resolve_window_title(vault_store.vault, tab_store.active_tab));
    });
  });
}

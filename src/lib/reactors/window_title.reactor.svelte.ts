import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import { DEFAULT_PROFILE_ID } from "$lib/features/profile";
import type { ProfileStore } from "$lib/features/profile";
import type { Vault } from "$lib/shared/types/vault";
import type { Tab } from "$lib/features/tab";

const APP_NAME = "otterly";

// Profiles look alike in the Dock, so a profile's windows say which one they
// are. The default profile's titles stay as they were.
export function resolve_window_title(
  vault: Vault | null,
  active_tab: Tab | null,
  profile_id: string | null,
): string {
  const suffix =
    profile_id && profile_id !== DEFAULT_PROFILE_ID ? ` (${profile_id})` : "";
  if (!vault) return `${APP_NAME}${suffix}`;
  if (!active_tab) return `${vault.name}${suffix}`;

  const prefix = active_tab.is_dirty ? "∘ " : "";
  return `${prefix}${active_tab.title} — ${vault.name}${suffix}`;
}

export function create_window_title_reactor(
  vault_store: VaultStore,
  tab_store: TabStore,
  profile_store: ProfileStore,
  set_title: (title: string) => void,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      set_title(
        resolve_window_title(
          vault_store.vault,
          tab_store.active_tab,
          profile_store.current_id,
        ),
      );
    });
  });
}

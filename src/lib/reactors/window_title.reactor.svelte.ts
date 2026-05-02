import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import type { Vault } from "$lib/shared/types/vault";
import type { Tab } from "$lib/features/tab";

const APP_NAME = "LeapGrowNotes";

let cached_version: string | null = null;

async function get_app_version(): Promise<string> {
  if (cached_version) return cached_version;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    cached_version = await getVersion();
  } catch {
    cached_version = "dev";
  }
  return cached_version;
}

export function resolve_window_title(
  vault: Vault | null,
  active_tab: Tab | null,
  version?: string,
): string {
  const app_label = version ? `${APP_NAME} v${version}` : APP_NAME;
  if (!vault) return app_label;
  if (!active_tab) return `${vault.name} — ${app_label}`;

  const prefix = active_tab.is_dirty ? "∘ " : "";
  return `${prefix}${active_tab.title} — ${vault.name} — ${app_label}`;
}

export function create_window_title_reactor(
  vault_store: VaultStore,
  tab_store: TabStore,
  set_title: (title: string) => void,
): () => void {
  let version: string | undefined;
  get_app_version().then((v) => {
    version = v;
    set_title(
      resolve_window_title(vault_store.vault, tab_store.active_tab, version),
    );
  });

  return $effect.root(() => {
    $effect(() => {
      set_title(
        resolve_window_title(vault_store.vault, tab_store.active_tab, version),
      );
    });
  });
}

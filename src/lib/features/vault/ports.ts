import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type { Vault } from "$lib/shared/types/vault";

export interface VaultPort {
  choose_vault(): Promise<VaultPath | null>;
  open_vault(vault_path: VaultPath): Promise<Vault>;
  open_vault_by_id(vault_id: VaultId): Promise<Vault>;
  list_vaults(): Promise<Vault[]>;
  remove_vault(vault_id: VaultId): Promise<void>;
  remember_last_vault(vault_id: VaultId): Promise<void>;
  // The vault this window shows, or the one New Window opened it for.
  get_window_vault_id(): Promise<VaultId | null>;
  // A new window on the picker (null) or on the vault. When another window
  // has the vault, that window comes to the front instead.
  open_new_vault_window(vault_id: VaultId | null): Promise<void>;
  // True when another window has the vault and it came to the front.
  focus_window_with_vault(vault_id: VaultId): Promise<boolean>;
}

export interface VaultSettingsPort {
  get_vault_setting<T>(vault_id: VaultId, key: string): Promise<T | null>;
  set_vault_setting(
    vault_id: VaultId,
    key: string,
    value: unknown,
  ): Promise<void>;
}

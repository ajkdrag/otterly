import type { VaultPort } from "$lib/features/vault/ports";
import { choose_vault_directory } from "$lib/features/vault/adapters/dialog_adapter";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type { Vault } from "$lib/shared/types/vault";

export function create_vault_tauri_adapter(): VaultPort {
  const invoke_vault = <Result>(
    command: string,
    payload?: Record<string, unknown>,
  ) => tauri_invoke<Result>(command, payload);
  const invoke_vault_args = <Result>(
    command: string,
    args: Record<string, unknown>,
  ) => tauri_invoke<Result>(command, { args });

  return {
    choose_vault: choose_vault_directory,
    async open_vault(vault_path: VaultPath) {
      return await invoke_vault_args<Vault>("open_vault", { vault_path });
    },
    async open_vault_by_id(vault_id: VaultId) {
      return await invoke_vault<Vault>("open_vault_by_id", {
        vaultId: vault_id,
      });
    },
    async list_vaults() {
      return await invoke_vault<Vault[]>("list_vaults");
    },
    async remove_vault(vault_id: VaultId) {
      await invoke_vault_args<undefined>("remove_vault_from_registry", {
        vault_id,
      });
    },
    async remember_last_vault(vault_id: VaultId) {
      await invoke_vault_args<undefined>("remember_last_vault", {
        vault_id,
      });
    },
    async get_window_vault_id() {
      return await invoke_vault<VaultId | null>("get_window_vault_id");
    },
    async open_new_vault_window(vault_id: VaultId | null) {
      await invoke_vault<undefined>("open_new_vault_window", {
        vaultId: vault_id,
      });
    },
    async focus_window_with_vault(vault_id: VaultId) {
      return await invoke_vault<boolean>("focus_window_with_vault", {
        vaultId: vault_id,
      });
    },
  };
}

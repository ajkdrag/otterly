export { register_vault_actions } from "$lib/features/vault/application/vault_actions";
export { apply_opened_vault_session } from "$lib/features/vault/application/vault_action_helpers";
export { VaultService } from "$lib/features/vault/application/vault_service";
export { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
export type { AppMountConfig } from "$lib/features/vault/application/vault_service";
export type { VaultPort, VaultSettingsPort } from "$lib/features/vault/ports";
export { create_vault_tauri_adapter } from "$lib/features/vault/adapters/vault_tauri_adapter";
export { create_vault_settings_tauri_adapter } from "$lib/features/vault/adapters/vault_settings_tauri_adapter";
export { default as VaultDialog } from "$lib/features/vault/ui/vault_dialog.svelte";
export { default as VaultDashboardDialog } from "$lib/features/vault/ui/vault_dashboard_dialog.svelte";
export { default as ConfirmVaultSwitchDialog } from "$lib/features/vault/ui/confirm_vault_switch_dialog.svelte";
export { default as ConfirmCrossVaultOpenDialog } from "$lib/features/vault/ui/confirm_cross_vault_open_dialog.svelte";
export { default as VaultDashboardPanel } from "$lib/features/vault/ui/vault_dashboard_panel.svelte";
export { default as VaultSelectionPanel } from "$lib/features/vault/ui/vault_selection_panel.svelte";
export type { Vault } from "$lib/shared/types/vault";
export type {
  VaultChoosePathResult,
  VaultInitializeResult,
  VaultOpenResult,
} from "$lib/features/vault/types/vault_service_result";

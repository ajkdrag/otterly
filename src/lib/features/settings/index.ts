export {
  register_settings_actions,
  register_editor_zoom_actions,
} from "$lib/features/settings/application/settings_actions";
export { SettingsService } from "$lib/features/settings/application/settings_service";
export type { SettingsPort } from "$lib/features/settings/ports";
export { create_settings_tauri_adapter } from "$lib/features/settings/adapters/settings_tauri_adapter";
export {
  SETTINGS_REGISTRY,
  type SettingDefinition,
} from "$lib/features/settings/domain/settings_catalog";
export { default as SettingsDialog } from "$lib/features/settings/ui/settings_dialog.svelte";
export type { EditorSettings } from "$lib/shared/types/editor_settings";
export type {
  SettingsLoadResult,
  SettingsSaveResult,
} from "$lib/features/settings/types/settings_service_result";

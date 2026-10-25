export { SearchService } from "$lib/features/search/application/search_service";
export { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
export { register_find_in_file_actions } from "$lib/features/search/application/find_in_file_actions";
export { VaultFindService } from "$lib/features/search/application/vault_find_service";
export type { VaultReplaceResult } from "$lib/features/search/application/vault_find_service";
export { register_vault_find_actions } from "$lib/features/search/application/vault_find_actions";
export {
  build_vault_find_request,
  vault_find_request_key,
} from "$lib/features/search/domain/vault_find_request";
export { search_within_text } from "$lib/features/search/domain/search_within_text";
export { SearchStore } from "$lib/features/search/state/search_store.svelte";
export type {
  IndexProgress,
  VaultFindResults,
  VaultFindStatus,
} from "$lib/features/search/state/search_store.svelte";
export type {
  SearchPort,
  WorkspaceIndexPort,
  VaultFindPort,
} from "$lib/features/search/ports";
export { create_search_tauri_adapter } from "$lib/features/search/adapters/search_tauri_adapter";
export { create_vault_find_tauri_adapter } from "$lib/features/search/adapters/vault_find_tauri_adapter";
export { create_workspace_index_tauri_adapter } from "$lib/features/search/adapters/workspace_index_tauri_adapter";
export { default as Omnibar } from "$lib/features/search/ui/omnibar.svelte";
export { default as FindInFileBar } from "$lib/features/search/ui/find_in_file_bar.svelte";
export { default as VaultFindPanel } from "$lib/features/search/ui/vault_find_panel.svelte";
export { default as VaultReplaceDialog } from "$lib/features/search/ui/vault_replace_dialog.svelte";
export type {
  SearchNotesResult,
  WikiSuggestionsResult,
  OmnibarSearchResult,
  CrossVaultSearchResult,
} from "$lib/features/search/types/search_service_result";
export type {
  CommandId,
  CommandIcon,
  CommandDefinition,
} from "$lib/features/search/types/command_palette";
export type {
  VaultFindRequest,
  VaultFindSelection,
  VaultFindMatch,
  VaultFindFile,
  VaultFindStats,
  VaultFindEvent,
  VaultFindError,
  VaultReplaceFile,
  VaultReplaceRequest,
  VaultReplaceResponse,
} from "$lib/features/search/types/vault_find";

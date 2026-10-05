export { DocumentService } from "$lib/features/document/application/document_service";
export { register_document_actions } from "$lib/features/document/application/document_actions";
export { DocumentStore } from "$lib/features/document/state/document_store.svelte";
export type { DocumentPort } from "$lib/features/document/ports";
export type {
  DocumentFile,
  DocumentSaveResult,
} from "$lib/features/document/types/document";
export {
  create_document_tauri_adapter,
  document_asset_url,
} from "$lib/features/document/adapters/document_tauri_adapter";
export { default as DocumentWindow } from "$lib/features/document/ui/document_window.svelte";

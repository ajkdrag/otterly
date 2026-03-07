export {
  type DocumentFileType,
  detect_file_type,
} from "$lib/features/document/domain/document_types";
export {
  DocumentStore,
  type DocumentViewerState,
} from "$lib/features/document/state/document_store.svelte";
export { type DocumentPort } from "$lib/features/document/ports";
export { create_document_tauri_adapter } from "$lib/features/document/adapters/document_tauri_adapter";

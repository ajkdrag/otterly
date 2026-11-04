export { EditorService } from "$lib/features/editor/application/editor_service";
export { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
export type {
  BufferRestorePolicy,
  EditorPort,
  EditorSession,
} from "$lib/features/editor/ports";
export {
  is_selection_format,
  type SelectionFormat,
} from "$lib/features/editor/domain/selection_format";
export { create_codemirror_editor_port } from "$lib/features/editor/adapters/codemirror_adapter";
export { default as EditorStatusBar } from "$lib/features/editor/ui/editor_status_bar.svelte";

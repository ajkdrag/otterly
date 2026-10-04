export { EditorService } from "$lib/features/editor/application/editor_service";
export { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
export type {
  BufferRestorePolicy,
  EditorPort,
} from "$lib/features/editor/ports";
export { create_codemirror_editor_port } from "$lib/features/editor/adapters/codemirror_adapter";
export { default as EditorStatusBar } from "$lib/features/editor/ui/editor_status_bar.svelte";

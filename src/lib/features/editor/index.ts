export { EditorService } from "$lib/features/editor/application/editor_service";
export { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
export { register_editor_actions } from "$lib/features/editor/application/editor_actions";
export { create_switchable_editor_port } from "$lib/features/editor/adapters/switchable_editor_adapter";
export { default as EditorDiagnosticsPanel } from "$lib/features/editor/ui/editor_diagnostics_panel.svelte";
export type {
  BufferRestorePolicy,
  EditorPort,
} from "$lib/features/editor/ports";
export { create_codemirror_editor_port } from "$lib/features/editor/adapters/codemirror_adapter";
export { default as EditorStatusBar } from "$lib/features/editor/ui/editor_status_bar.svelte";

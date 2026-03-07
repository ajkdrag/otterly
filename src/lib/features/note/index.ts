export { register_note_actions } from "$lib/features/note/application/note_actions";
export { NoteService } from "$lib/features/note/application/note_service";
export { NotesStore } from "$lib/features/note/state/note_store.svelte";
export {
  ensure_open_note,
  create_untitled_open_note,
  is_draft_note_path,
} from "$lib/features/note/domain/ensure_open_note";
export {
  to_markdown_asset_target,
  resolve_relative_asset_path,
} from "$lib/features/note/domain/asset_markdown_path";
export { note_path_exists } from "$lib/features/note/domain/note_path_exists";
export { resolve_existing_note_path } from "$lib/features/note/domain/note_lookup";
export { sanitize_note_name } from "$lib/features/note/domain/sanitize_note_name";
export { extract_note_title } from "$lib/features/note/domain/extract_note_title";
export type {
  AssetsPort,
  FolderStats,
  NotesPort,
  WriteImageAssetInput,
} from "$lib/features/note/ports";
export { create_notes_tauri_adapter } from "$lib/features/note/adapters/notes_tauri_adapter";
export { create_assets_tauri_adapter } from "$lib/features/note/adapters/assets_tauri_adapter";
export { default as NoteEditor } from "$lib/features/note/ui/note_editor.svelte";
export { default as NoteDetailsDialog } from "$lib/features/note/ui/note_details_dialog.svelte";
export { default as DeleteNoteDialog } from "$lib/features/note/ui/delete_note_dialog.svelte";
export { default as RenameNoteDialog } from "$lib/features/note/ui/rename_note_dialog.svelte";
export { default as SaveNoteDialog } from "$lib/features/note/ui/save_note_dialog.svelte";
export { default as ImagePasteDialog } from "$lib/features/note/ui/image_paste_dialog.svelte";
export type { NoteMeta, NoteDoc } from "$lib/shared/types/note";
export type {
  NoteOpenResult,
  NoteSaveResult,
} from "$lib/features/note/types/note_service_result";

export { register_folder_actions } from "$lib/features/folder/application/folder_actions";
export { FolderService } from "$lib/features/folder/application/folder_service";
export { clear_folder_filetree_state } from "$lib/features/folder/application/filetree_action_helpers";
export {
  build_filetree,
  sort_tree,
  get_invalid_drop_reason,
  is_valid_drop_target,
  move_destination_path,
} from "$lib/features/folder/domain/filetree";
export { flatten_filetree } from "$lib/features/folder/domain/flatten_filetree";
export { scope_flat_tree } from "$lib/features/folder/domain/scope_flat_tree";
export { default as CreateFolderDialog } from "$lib/features/folder/ui/create_folder_dialog.svelte";
export { default as DeleteFolderDialog } from "$lib/features/folder/ui/delete_folder_dialog.svelte";
export { default as RenameFolderDialog } from "$lib/features/folder/ui/rename_folder_dialog.svelte";
export { default as FiletreeMoveConflictDialog } from "$lib/features/folder/ui/filetree_move_conflict_dialog.svelte";
export { default as VirtualFileTree } from "$lib/features/folder/ui/virtual_file_tree.svelte";
export type {
  FolderMutationResult,
  FolderMoveResult,
} from "$lib/features/folder/types/folder_service_result";

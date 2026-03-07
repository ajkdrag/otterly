import type { NoteMeta } from "$lib/shared/types/note";
import type {
  FileMeta,
  FlatTreeNode,
  FolderLoadState,
  FolderPaginationState,
} from "$lib/shared/types/filetree";
import {
  build_filetree,
  sort_tree,
  type FileTreeNode,
} from "$lib/features/folder/domain/filetree";

export type FlattenInput = {
  notes: NoteMeta[];
  folder_paths: string[];
  files: FileMeta[];
  expanded_paths: Set<string>;
  load_states: Map<string, FolderLoadState>;
  error_messages: Map<string, string>;
  show_hidden_files: boolean;
  pagination: Map<string, FolderPaginationState>;
};

export function flatten_filetree(input: FlattenInput): FlatTreeNode[] {
  const {
    notes,
    folder_paths,
    files,
    expanded_paths,
    load_states,
    error_messages,
    show_hidden_files,
    pagination,
  } = input;
  const tree = sort_tree(build_filetree(notes, folder_paths, files));
  const result: FlatTreeNode[] = [];

  function visit(
    node: FileTreeNode,
    depth: number,
    parent_path: string | null,
  ) {
    for (const [, child] of node.children) {
      if (!show_hidden_files && child.name.startsWith(".")) {
        continue;
      }

      const is_folder = child.is_folder;
      const is_expanded = expanded_paths.has(child.path);
      const load_state = load_states.get(child.path) ?? "unloaded";

      const flat_node: FlatTreeNode = {
        id: child.path,
        path: child.path,
        name: child.name,
        depth,
        is_folder,
        is_expanded,
        is_loading: load_state === "loading",
        has_error: load_state === "error",
        error_message: error_messages.get(child.path) ?? null,
        note: child.note,
        file_meta: child.file_meta,
        parent_path,
        is_load_more: false,
      };

      result.push(flat_node);

      if (is_folder && is_expanded) {
        visit(child, depth + 1, child.path);
      }
    }

    const pagination_state = pagination.get(node.path);
    if (
      pagination_state &&
      pagination_state.loaded_count < pagination_state.total_count
    ) {
      const key_suffix = node.path === "" ? "root" : node.path;
      result.push({
        id: `__load_more__${key_suffix}`,
        path: `__load_more__${key_suffix}`,
        name: "",
        depth,
        is_folder: false,
        is_expanded: false,
        is_loading: pagination_state.load_state === "loading",
        has_error: pagination_state.load_state === "error",
        error_message: pagination_state.error_message,
        note: null,
        file_meta: null,
        parent_path: node.path,
        is_load_more: true,
      });
    }
  }

  visit(tree, 0, null);
  return result;
}

import type { NoteMeta } from "$lib/shared/types/note";
import type { FileMeta, MoveItem } from "$lib/shared/types/filetree";

export type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  note: NoteMeta | null;
  file_meta: FileMeta | null;
  is_folder: boolean;
};

export function build_filetree(
  notes: NoteMeta[],
  folder_paths: string[] = [],
  files: FileMeta[] = [],
): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    children: new Map(),
    note: null,
    file_meta: null,
    is_folder: true,
  };

  for (const note of notes) {
    const parts = note.path.split("/").filter(Boolean);
    let current = root;
    let node_path = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const is_last = i === parts.length - 1;
      node_path = node_path ? `${node_path}/${part}` : part;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: node_path,
          children: new Map(),
          note: is_last ? note : null,
          file_meta: null,
          is_folder: !is_last,
        });
      }
      const next = current.children.get(part);
      if (!next) throw new Error(`Missing node for part: ${part}`);
      if (is_last) {
        next.note = note;
        next.is_folder = false;
      }
      current = next;
    }
  }

  for (const rel_path of folder_paths) {
    const parts = rel_path.split("/").filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!part) continue;
      const node_path = current.path ? `${current.path}/${part}` : part;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: node_path,
          children: new Map(),
          note: null,
          file_meta: null,
          is_folder: true,
        });
      }
      const next_node = current.children.get(part);
      if (!next_node) throw new Error(`Missing node for part: ${part}`);
      current = next_node;
    }
  }

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let node_path = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const is_last = i === parts.length - 1;
      node_path = node_path ? `${node_path}/${part}` : part;
      if (is_last) {
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: file.name,
            path: node_path,
            children: new Map(),
            note: null,
            file_meta: file,
            is_folder: false,
          });
        }
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: node_path,
            children: new Map(),
            note: null,
            file_meta: null,
            is_folder: true,
          });
        }
        const next_node = current.children.get(part);
        if (!next_node) throw new Error(`Missing node for part: ${part}`);
        current = next_node;
      }
    }
  }

  return root;
}

export function sort_tree(node: FileTreeNode): FileTreeNode {
  const sorted_children = new Map<string, FileTreeNode>();
  const entries = Array.from(node.children.entries());

  entries.sort(([a_name, a_node], [b_name, b_node]) => {
    if (a_node.is_folder !== b_node.is_folder) {
      return a_node.is_folder ? -1 : 1;
    }
    return a_name.localeCompare(b_name);
  });

  for (const [name, child] of entries) {
    sorted_children.set(name, sort_tree(child));
  }

  return {
    ...node,
    children: sorted_children,
  };
}

export function parent_path(path: string): string {
  const index = path.lastIndexOf("/");
  if (index < 0) {
    return "";
  }
  return path.slice(0, index);
}

export function move_destination_path(
  source_path: string,
  target_folder: string,
): string {
  const leaf = source_path.split("/").at(-1) ?? source_path;
  if (!target_folder) {
    return leaf;
  }
  return `${target_folder}/${leaf}`;
}

export function is_path_same_or_descendant(
  path: string,
  parent: string,
): boolean {
  if (!parent) {
    return false;
  }
  return path === parent || path.startsWith(`${parent}/`);
}

export function is_valid_drop_target(
  dragged_paths: string[],
  target_folder: string,
): boolean {
  if (dragged_paths.length === 0) {
    return false;
  }

  for (const source_path of dragged_paths) {
    const next_path = move_destination_path(source_path, target_folder);
    if (next_path === source_path) {
      return false;
    }
  }

  return true;
}

export function get_invalid_drop_reason(
  dragged_items: MoveItem[],
  target_folder: string,
): string | null {
  if (dragged_items.length === 0) {
    return "no items selected";
  }

  for (const item of dragged_items) {
    if (!item.path) {
      return "invalid source path";
    }
    if (
      item.is_folder &&
      is_path_same_or_descendant(target_folder, item.path)
    ) {
      return "cannot move folder into itself";
    }
    const next_path = move_destination_path(item.path, target_folder);
    if (next_path === item.path) {
      return "item already in target folder";
    }
  }

  const folder_items = dragged_items.filter((item) => item.is_folder);
  for (const folder_item of folder_items) {
    for (const other of dragged_items) {
      if (other.path === folder_item.path) {
        continue;
      }
      if (is_path_same_or_descendant(other.path, folder_item.path)) {
        return "selection contains nested folder items";
      }
    }
  }

  return null;
}

import type { FlatTreeNode } from "$lib/shared/types/filetree";

function is_scoped_descendant(path: string, scoped_root_path: string): boolean {
  if (path === scoped_root_path) {
    return true;
  }
  return path.startsWith(`${scoped_root_path}/`);
}

export function scope_flat_tree(
  nodes: FlatTreeNode[],
  scoped_root_path: string | null,
): FlatTreeNode[] {
  if (!scoped_root_path) {
    return nodes;
  }

  const scoped_root_node = nodes.find(
    (node) => !node.is_load_more && node.path === scoped_root_path,
  );

  if (!scoped_root_node) {
    return [];
  }

  return nodes
    .filter((node) => {
      if (node.is_load_more) {
        const parent = node.parent_path;
        return !!parent && is_scoped_descendant(parent, scoped_root_path);
      }
      return is_scoped_descendant(node.path, scoped_root_path);
    })
    .map((node) => {
      return {
        ...node,
        depth: Math.max(0, node.depth - scoped_root_node.depth),
      };
    });
}

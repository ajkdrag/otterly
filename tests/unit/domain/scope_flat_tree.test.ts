import { describe, expect, test } from "vitest";
import { scope_flat_tree } from "$lib/features/folder";
import type { FlatTreeNode } from "$lib/shared/types/filetree";

function folder_node(path: string, depth: number): FlatTreeNode {
  return {
    id: path,
    path,
    name: path.split("/").at(-1) ?? path,
    depth,
    is_folder: true,
    is_expanded: false,
    is_loading: false,
    has_error: false,
    error_message: null,
    note: null,
    parent_path: depth === 0 ? null : path.split("/").slice(0, -1).join("/"),
    is_load_more: false,
  };
}

function file_node(path: string, depth: number): FlatTreeNode {
  return {
    id: path,
    path,
    name: path.split("/").at(-1) ?? path,
    depth,
    is_folder: false,
    is_expanded: false,
    is_loading: false,
    has_error: false,
    error_message: null,
    note: null,
    parent_path: path.split("/").slice(0, -1).join("/"),
    is_load_more: false,
  };
}

function load_more_node(parent_path: string, depth: number): FlatTreeNode {
  return {
    id: `__load_more__${parent_path || "root"}`,
    path: `__load_more__${parent_path || "root"}`,
    name: "",
    depth,
    is_folder: false,
    is_expanded: false,
    is_loading: false,
    has_error: false,
    error_message: null,
    note: null,
    parent_path,
    is_load_more: true,
  };
}

describe("scope_flat_tree", () => {
  test("returns all nodes when scope is null", () => {
    const nodes = [folder_node("docs", 0), file_node("docs/note.md", 1)];
    expect(scope_flat_tree(nodes, null)).toEqual(nodes);
  });

  test("keeps only scoped folder subtree and rebases depth", () => {
    const nodes = [
      folder_node("admin", 0),
      folder_node("docs", 0),
      folder_node("docs/specs", 1),
      file_node("docs/specs/note.md", 2),
      file_node("docs/readme.md", 1),
      folder_node("public", 0),
    ];

    const result = scope_flat_tree(nodes, "docs");
    expect(result.map((node) => node.path)).toEqual([
      "docs",
      "docs/specs",
      "docs/specs/note.md",
      "docs/readme.md",
    ]);
    expect(result.map((node) => node.depth)).toEqual([0, 1, 2, 1]);
    expect(result[0]?.is_expanded).toBe(false);
  });

  test("keeps load-more rows for folders inside scope", () => {
    const nodes = [
      folder_node("docs", 0),
      folder_node("docs/specs", 1),
      load_more_node("docs/specs", 2),
      folder_node("other", 0),
      load_more_node("other", 1),
    ];

    const result = scope_flat_tree(nodes, "docs");
    expect(result.map((node) => node.path)).toEqual([
      "docs",
      "docs/specs",
      "__load_more__docs/specs",
    ]);
    expect(result.map((node) => node.depth)).toEqual([0, 1, 2]);
  });

  test("returns empty when scoped root folder is missing", () => {
    const nodes = [folder_node("docs", 0), file_node("docs/readme.md", 1)];
    expect(scope_flat_tree(nodes, "missing")).toEqual([]);
  });
});

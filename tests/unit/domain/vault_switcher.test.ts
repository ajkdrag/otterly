import { describe, expect, it } from "vitest";
import {
  clamp_vault_selection,
  duplicate_vault_names,
  format_vault_path,
  move_vault_selection,
} from "$lib/features/vault/domain/vault_switcher";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

describe("vault_switcher", () => {
  it("clamps selection to bounds", () => {
    expect(clamp_vault_selection(-1, 3)).toBe(0);
    expect(clamp_vault_selection(1, 3)).toBe(1);
    expect(clamp_vault_selection(10, 3)).toBe(2);
    expect(clamp_vault_selection(0, 0)).toBe(-1);
  });

  it("moves selection with wrap-around", () => {
    expect(move_vault_selection(0, 3, 1)).toBe(1);
    expect(move_vault_selection(2, 3, 1)).toBe(0);
    expect(move_vault_selection(0, 3, -1)).toBe(2);
  });

  it("starts from first or last when nothing selected", () => {
    expect(move_vault_selection(-1, 3, 1)).toBe(0);
    expect(move_vault_selection(-1, 3, -1)).toBe(2);
    expect(move_vault_selection(-1, 0, 1)).toBe(-1);
  });

  it("returns names that require path disambiguation", () => {
    const duplicate = create_test_vault({
      id: as_vault_id("vault-2"),
      path: as_vault_path("/work/secondary"),
      name: "Work",
    });
    const unique = create_test_vault({
      id: as_vault_id("vault-3"),
      path: as_vault_path("/research/main"),
      name: "Research",
    });

    const primary = create_test_vault({
      name: "Work",
      path: as_vault_path("/work/main"),
    });

    const result = duplicate_vault_names([primary, duplicate, unique]);
    expect(result.has("Work")).toBe(true);
    expect(result.has("Research")).toBe(false);
  });

  describe("format_vault_path", () => {
    it("returns full path when vault name is a duplicate", () => {
      const dupes = new Set(["Work"]);
      expect(format_vault_path("/a/b/c/Work", "Work", dupes)).toBe(
        "/a/b/c/Work",
      );
    });

    it("truncates long paths for unique names", () => {
      const dupes = new Set<string>();
      expect(format_vault_path("/home/user/docs/Work", "Work", dupes)).toBe(
        ".../docs/Work",
      );
    });

    it("returns short paths as-is for unique names", () => {
      const dupes = new Set<string>();
      expect(format_vault_path("/docs/Work", "Work", dupes)).toBe("/docs/Work");
    });
  });
});

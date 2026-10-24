import { describe, expect, it } from "vitest";
import { apply_starred_paths_change } from "$lib/features/vault/domain/apply_starred_paths_change";

describe("apply_starred_paths_change", () => {
  it("keeps stars another profile added to the file", () => {
    expect(apply_starred_paths_change(["x.md"], [], ["y.md"])).toEqual([
      "x.md",
      "y.md",
    ]);
  });

  it("removes only what this profile unstarred", () => {
    expect(
      apply_starred_paths_change(["a.md", "x.md"], ["a.md", "b.md"], ["b.md"]),
    ).toEqual(["x.md"]);
  });

  it("does not star a path twice when the file already has it", () => {
    expect(apply_starred_paths_change(["a.md"], [], ["a.md"])).toEqual([
      "a.md",
    ]);
  });

  it("treats a rename as an unstar plus a star", () => {
    expect(
      apply_starred_paths_change(["old.md", "x.md"], ["old.md"], ["new.md"]),
    ).toEqual(["x.md", "new.md"]);
  });
});

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

  it("unstars a path that the file spells with other case or spaces", () => {
    expect(
      apply_starred_paths_change(["Docs/A.md", " x.md "], ["docs/a.md"], []),
    ).toEqual(["x.md"]);
  });

  it("does not star a path again when the file has it in other case", () => {
    expect(
      apply_starred_paths_change(["Docs/A.md"], [], ["docs/a.md"]),
    ).toEqual(["Docs/A.md"]);
  });

  it("takes the new spelling when a rename only changes case", () => {
    expect(apply_starred_paths_change(["a.md"], ["a.md"], ["A.md"])).toEqual([
      "A.md",
    ]);
  });
});

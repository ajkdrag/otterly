import { describe, expect, it } from "vitest";
import {
  first_match_after_file,
  next_match_after_replace,
} from "$lib/features/search/domain/next_match_after_replace";
import type { VaultFindFile } from "$lib/features/search/types/vault_find";

// Matches as [line, column], numbered in order like Rust numbers them.
function file(path: string, ...matches: [number, number][]): VaultFindFile {
  return {
    path,
    content_hash: `hash:${path}`,
    matches: matches.map(([line, column], index) => ({
      index,
      line,
      column,
      length: 3,
      before: "",
      text: "foo",
      after: "",
      groups: [],
    })),
  };
}

function replaced(
  path: string,
  line: number,
  column: number,
  inserted_length: number,
) {
  return { path, line, column, inserted_length };
}

describe("next_match_after_replace", () => {
  it("picks the next match on the same line, after the inserted text", () => {
    const files = [file("a.md", [1, 0], [1, 10])];

    expect(next_match_after_replace(files, replaced("a.md", 1, 0, 3))).toEqual({
      path: "a.md",
      index: 1,
    });
  });

  it("skips a match inside the inserted text, so foo to foobar moves on", () => {
    // "foo foo" became "foobar foo": the fresh scan finds foo at 0 and 7.
    const files = [file("a.md", [1, 0], [1, 7])];

    expect(next_match_after_replace(files, replaced("a.md", 1, 0, 6))).toEqual({
      path: "a.md",
      index: 1,
    });
  });

  it("moves to a later line of the same file", () => {
    const files = [file("a.md", [2, 0], [5, 4])];

    expect(next_match_after_replace(files, replaced("a.md", 3, 8, 3))).toEqual({
      path: "a.md",
      index: 1,
    });
  });

  it("moves to the next file once the replaced file has nothing after it", () => {
    const files = [file("a.md", [1, 0]), file("B.md", [4, 2])];
    expect(next_match_after_replace(files, replaced("a.md", 9, 0, 3))).toEqual({
      path: "B.md",
      index: 0,
    });

    // The replaced file is gone from the results when nothing is left in it.
    const without_replaced = [file("B.md", [4, 2])];
    expect(
      next_match_after_replace(without_replaced, replaced("a.md", 1, 0, 3)),
    ).toEqual({ path: "B.md", index: 0 });
  });

  it("returns null after the last match", () => {
    const files = [file("a.md", [1, 0])];

    expect(
      next_match_after_replace(files, replaced("b.md", 1, 0, 3)),
    ).toBeNull();
  });
});

describe("first_match_after_file", () => {
  it("skips the file itself, files without matches and earlier files", () => {
    const files = [
      file("a.md", [1, 0]),
      file("b.md", [1, 0], [2, 0]),
      file("c.md"),
      file("d.md", [7, 3]),
    ];

    expect(first_match_after_file(files, "b.md")).toEqual({
      path: "d.md",
      index: 0,
    });
  });

  it("returns null for the last file", () => {
    const files = [file("a.md", [1, 0]), file("b.md", [1, 0])];

    expect(first_match_after_file(files, "b.md")).toBeNull();
  });
});

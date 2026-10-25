import { describe, expect, it } from "vitest";
import { next_match_after_replace } from "$lib/features/search/domain/next_match_after_replace";
import type { VaultFindFile } from "$lib/features/search/types/vault_find";

// Matches as [line, column], numbered in order like Rust numbers them.
function file(path: string, matches: [number, number][]): VaultFindFile {
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

describe("next_match_after_replace", () => {
  it("picks the next match on the same line, after the inserted text", () => {
    const files = [file("a.md", [[1, 0], [1, 10]])];

    expect(
      next_match_after_replace(files, {
        path: "a.md",
        line: 1,
        column: 0,
        inserted_length: 3,
      }),
    ).toEqual({ path: "a.md", index: 1 });
  });

  it("skips a match inside the inserted text, so foo to foobar moves on", () => {
    // "foo foo" became "foobar foo": the fresh scan finds foo at 0 and 7.
    const files = [file("a.md", [[1, 0], [1, 7]])];

    expect(
      next_match_after_replace(files, {
        path: "a.md",
        line: 1,
        column: 0,
        inserted_length: 6,
      }),
    ).toEqual({ path: "a.md", index: 1 });
  });

  it("moves to a later line of the same file", () => {
    const files = [file("a.md", [[2, 0], [5, 4]])];

    expect(
      next_match_after_replace(files, {
        path: "a.md",
        line: 3,
        column: 8,
        inserted_length: 3,
      }),
    ).toEqual({ path: "a.md", index: 1 });
  });

  it("moves to the next file once the replaced file has nothing after it", () => {
    const files = [file("a.md", [[1, 0]]), file("B.md", [[4, 2]])];

    expect(
      next_match_after_replace(files, {
        path: "a.md",
        line: 9,
        column: 0,
        inserted_length: 3,
      }),
    ).toEqual({ path: "B.md", index: 0 });
    // The replaced file is gone from the results when nothing is left in it.
    expect(
      next_match_after_replace([file("B.md", [[4, 2]])], {
        path: "a.md",
        line: 1,
        column: 0,
        inserted_length: 3,
      }),
    ).toEqual({ path: "B.md", index: 0 });
  });

  it("returns null after the last match", () => {
    const files = [file("a.md", [[1, 0]])];

    expect(
      next_match_after_replace(files, {
        path: "b.md",
        line: 1,
        column: 0,
        inserted_length: 3,
      }),
    ).toBeNull();
  });
});

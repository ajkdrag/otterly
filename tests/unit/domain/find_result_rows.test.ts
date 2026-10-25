import { describe, expect, it } from "vitest";
import {
  build_find_rows,
  resolve_selected_row,
  step_find_selection,
} from "$lib/features/search/domain/find_result_rows";
import type { VaultFindFile } from "$lib/features/search/types/vault_find";

function file(path: string, match_count = 1): VaultFindFile {
  return {
    path,
    content_hash: `hash:${path}`,
    matches: Array.from({ length: match_count }, (_, index) => ({
      index,
      line: index + 1,
      column: 0,
      length: 3,
      before: "",
      text: "foo",
      after: "",
      groups: [],
    })),
  };
}

function selection(path: string, index: number, request_key = "key") {
  return { request_key, path, index };
}

function row_keys(rows: { key: string }[]) {
  return rows.map((row) => row.key);
}

describe("build_find_rows", () => {
  it("lists a file row, then one row per match under it", () => {
    const { rows, match_rows } = build_find_rows([
      file("a.md", 2),
      file("b.md"),
    ]);

    expect(row_keys(rows)).toEqual([
      "file:a.md",
      "0:a.md",
      "1:a.md",
      "file:b.md",
      "0:b.md",
    ]);
    expect(rows.map((row) => row.row_index)).toEqual([0, 1, 2, 3, 4]);
    expect(match_rows.get("1:a.md")?.row_index).toBe(2);
    expect(match_rows.size).toBe(3);
  });
});

describe("resolve_selected_row", () => {
  const files = [file("a.md", 2), file("b.md", 2)];

  it("picks the remembered match, wherever its file sits in the list", () => {
    const row_list = build_find_rows(files);

    const row = resolve_selected_row(
      row_list,
      selection("b.md", 1),
      "key",
      false,
    );
    expect(row?.key).toBe("1:b.md");

    // A file streams in above it. The match stays selected.
    const later = build_find_rows([file("0.md"), ...files]);
    expect(
      resolve_selected_row(later, selection("b.md", 1), "key", true)?.key,
    ).toBe("1:b.md");
  });

  it("falls back to the first match without a selection", () => {
    const row = resolve_selected_row(
      build_find_rows(files),
      null,
      "key",
      false,
    );

    expect(row?.key).toBe("0:a.md");
  });

  it("falls back to the first match when the selection is for other results", () => {
    const row_list = build_find_rows(files);

    for (const is_searching of [false, true]) {
      const row = resolve_selected_row(
        row_list,
        selection("b.md", 1, "older key"),
        "key",
        is_searching,
      );
      expect(row?.key).toBe("0:a.md");
    }
  });

  it("falls back to the first match once the search is over without the remembered one", () => {
    const row = resolve_selected_row(
      build_find_rows(files),
      selection("gone.md", 0),
      "key",
      false,
    );

    expect(row?.key).toBe("0:a.md");
  });

  it("selects nothing while the remembered match has not streamed in", () => {
    const row = resolve_selected_row(
      build_find_rows(files),
      selection("z.md", 0),
      "key",
      true,
    );

    expect(row).toBeNull();
  });

  it("selects nothing when there are no matches", () => {
    expect(
      resolve_selected_row(build_find_rows([]), null, null, false),
    ).toBeNull();
  });
});

describe("step_find_selection", () => {
  const { rows, match_rows } = build_find_rows([file("a.md", 2), file("b.md")]);
  const first = match_rows.get("0:a.md");
  const second = match_rows.get("1:a.md");
  const third = match_rows.get("0:b.md");
  if (!first || !second || !third) throw new Error("fixture rows missing");

  it("skips the file rows going down and up", () => {
    expect(step_find_selection(rows, second, 1)?.key).toBe(third.key);
    expect(step_find_selection(rows, third, -1)?.key).toBe(second.key);
  });

  it("wraps around at both ends", () => {
    expect(step_find_selection(rows, third, 1)?.key).toBe(first.key);
    expect(step_find_selection(rows, first, -1)?.key).toBe(third.key);
  });

  it("stays on the only match", () => {
    const only = build_find_rows([file("a.md")]);
    const row = only.match_rows.get("0:a.md");
    if (!row) throw new Error("fixture row missing");

    expect(step_find_selection(only.rows, row, 1)?.key).toBe(row.key);
    expect(step_find_selection(only.rows, row, -1)?.key).toBe(row.key);
  });
});

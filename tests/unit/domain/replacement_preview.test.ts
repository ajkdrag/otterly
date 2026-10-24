import { describe, expect, it } from "vitest";
import { build_replacement_preview } from "$lib/features/search/domain/replacement_preview";
import type { VaultFindMatch } from "$lib/features/search/types/vault_find";

function match(text: string, groups: (string | null)[] = []): VaultFindMatch {
  return {
    index: 0,
    line: 1,
    column: 0,
    length: text.length,
    before: "",
    text,
    after: "",
    groups,
  };
}

describe("build_replacement_preview", () => {
  it("inserts the replacement as is in literal mode", () => {
    const found = match("price");
    expect(build_replacement_preview(found, "$1 $$", false, [])).toBe("$1 $$");
  });

  it("expands numbered and named groups in regex mode", () => {
    const found = match("2026-10", ["2026", "10"]);
    const names = ["year", null];
    expect(build_replacement_preview(found, "$2/${year}", true, names)).toBe(
      "10/2026",
    );
  });

  it("turns $$ into a dollar sign, and $0 into the whole match", () => {
    const found = match("abc", ["b"]);
    expect(build_replacement_preview(found, "$$ $0", true, [null])).toBe(
      "$ abc",
    );
  });

  it("expands an unknown group and a group that did not take part to nothing", () => {
    const found = match("ab", ["a", null]);
    expect(
      build_replacement_preview(found, "[$2][$3]", true, [null, null]),
    ).toBe("[][]");
  });
});

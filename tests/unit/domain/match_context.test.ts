import { describe, expect, it } from "vitest";
import { trim_context_before } from "$lib/features/search/domain/match_context";

const SPACE = " ";

describe("trim_context_before", () => {
  it("leaves a short context alone, including the ellipsis Rust added", () => {
    expect(trim_context_before("")).toEqual({ text: "", gap: "" });
    expect(trim_context_before("see tags ")).toEqual({
      text: "see tags",
      gap: SPACE,
    });
    expect(trim_context_before("…lta beta reading ")).toEqual({
      text: "…lta beta reading",
      gap: SPACE,
    });
  });

  it("keeps the last six words with a leading ellipsis", () => {
    expect(
      trim_context_before("a delta beta reading tags draft for you "),
    ).toEqual({ text: "…beta reading tags draft for you", gap: SPACE });
  });

  it("drops the partial word Rust cut at the start", () => {
    expect(
      trim_context_before("…lta beta reading tags draft for you "),
    ).toEqual({ text: "…beta reading tags draft for you", gap: SPACE });
  });

  it("returns the whole gap before the match, whatever it is made of", () => {
    expect(trim_context_before("tags \t ").gap).toBe(SPACE + SPACE + SPACE);
  });
});

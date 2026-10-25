import { describe, expect, it } from "vitest";
import { trim_context_before } from "$lib/features/search/domain/match_context";

describe("trim_context_before", () => {
  it("leaves a short context alone, including the ellipsis Rust added", () => {
    expect(trim_context_before("")).toBe("");
    expect(trim_context_before("see tags ")).toBe("see tags ");
    expect(trim_context_before("…lta beta reading ")).toBe(
      "…lta beta reading ",
    );
  });

  it("keeps the last three words and the gap before the match", () => {
    expect(trim_context_before("a delta beta reading tags draft ")).toBe(
      "…reading tags draft ",
    );
  });

  it("drops the partial word Rust cut at the start", () => {
    expect(trim_context_before("…lta beta reading tags ")).toBe(
      "…beta reading tags ",
    );
  });
});

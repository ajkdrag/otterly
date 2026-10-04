import { describe, it, expect } from "vitest";
import { search_within_text } from "$lib/features/search/domain/search_within_text";

describe("search_within_text", () => {
  it("returns empty array for empty text", () => {
    expect(search_within_text("", "query")).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    expect(search_within_text("some text", "")).toEqual([]);
  });

  it("finds single match", () => {
    const result = search_within_text("hello world", "world");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      line: 1,
      column: 7,
      length: 5,
      context: "hello world",
    });
  });

  it("finds multiple matches on same line", () => {
    const result = search_within_text("foo bar foo baz foo", "foo");
    expect(result).toHaveLength(3);
    expect(result[0]?.column).toBe(1);
    expect(result[1]?.column).toBe(9);
    expect(result[2]?.column).toBe(17);
    expect(result.every((m) => m.line === 1)).toBe(true);
  });

  it("finds matches across multiple lines", () => {
    const result = search_within_text("hello\nworld\nhello again", "hello");
    expect(result).toHaveLength(2);
    expect(result[0]?.line).toBe(1);
    expect(result[1]?.line).toBe(3);
  });

  it("matches case-insensitively", () => {
    const result = search_within_text("Hello HELLO hElLo", "hello");
    expect(result).toHaveLength(3);
    expect(result[0]?.column).toBe(1);
    expect(result[1]?.column).toBe(7);
    expect(result[2]?.column).toBe(13);
  });

  it("uses 1-based line and column numbers", () => {
    const result = search_within_text("abc\ndef", "def");
    expect(result).toHaveLength(1);
    expect(result[0]?.line).toBe(2);
    expect(result[0]?.column).toBe(1);
  });

  it("adds ellipsis when context is truncated", () => {
    const long_line = "a".repeat(50) + "MATCH" + "b".repeat(50);
    const result = search_within_text(long_line, "MATCH");
    expect(result).toHaveLength(1);
    expect(result[0]?.context.startsWith("...")).toBe(true);
    expect(result[0]?.context.endsWith("...")).toBe(true);
  });

  it("omits ellipsis when match is near start of line", () => {
    const line = "MATCH" + "b".repeat(50);
    const result = search_within_text(line, "MATCH");
    expect(result).toHaveLength(1);
    expect(result[0]?.context.startsWith("...")).toBe(false);
    expect(result[0]?.context.endsWith("...")).toBe(true);
  });

  it("omits ellipsis when match is near end of line", () => {
    const line = "a".repeat(50) + "MATCH";
    const result = search_within_text(line, "MATCH");
    expect(result).toHaveLength(1);
    expect(result[0]?.context.startsWith("...")).toBe(true);
    expect(result[0]?.context.endsWith("...")).toBe(false);
  });

  it("returns empty array when no match is found", () => {
    expect(search_within_text("hello world", "xyz")).toEqual([]);
  });
});

it("counts non-overlapping matches consistently with editor highlights", () => {
  expect(search_within_text("aaa", "aa")).toHaveLength(1);
});
it("keeps source offsets valid when earlier characters change length under lowercasing", () => {
  expect(search_within_text("İ needle", "needle")[0]?.column).toBe(3);
});
it("treats regex punctuation as literal text", () => {
  expect(search_within_text("before [a.*] after", "[a.*]")[0]?.column).toBe(8);
});

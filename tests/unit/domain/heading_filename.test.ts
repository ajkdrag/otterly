import { describe, expect, it } from "vitest";
import { heading_filename_from_markdown } from "$lib/features/note/domain/heading_filename";

describe("heading_filename_from_markdown", () => {
  it("lowercases the heading and keeps spaces by default", () => {
    expect(
      heading_filename_from_markdown("# Weekly Plan\nbody", "spaces"),
    ).toBe("weekly plan");
  });

  it("joins words with hyphens when asked", () => {
    expect(
      heading_filename_from_markdown("## Weekly   Plan  Notes", "hyphens"),
    ).toBe("weekly-plan-notes");
  });

  it("accepts heading levels 1 through 6 only", () => {
    expect(heading_filename_from_markdown("###### Deep", "spaces")).toBe(
      "deep",
    );
    expect(
      heading_filename_from_markdown("####### Too deep", "spaces"),
    ).toBeNull();
  });

  it("returns null unless the literal first line is a heading", () => {
    expect(heading_filename_from_markdown("\n# Title", "spaces")).toBeNull();
    expect(
      heading_filename_from_markdown("intro\n# Title", "spaces"),
    ).toBeNull();
    expect(heading_filename_from_markdown("#hashtag", "spaces")).toBeNull();
    expect(heading_filename_from_markdown("", "spaces")).toBeNull();
  });

  it("allows up to three leading spaces", () => {
    expect(heading_filename_from_markdown("   # Title", "spaces")).toBe(
      "title",
    );
    expect(heading_filename_from_markdown("    # Title", "spaces")).toBeNull();
  });

  it("returns null for a heading with no text", () => {
    expect(heading_filename_from_markdown("#", "spaces")).toBeNull();
    expect(heading_filename_from_markdown("# ", "spaces")).toBeNull();
    expect(heading_filename_from_markdown("# ###", "spaces")).toBeNull();
    expect(heading_filename_from_markdown("#   \nbody", "spaces")).toBeNull();
  });

  it("handles CRLF line endings", () => {
    expect(heading_filename_from_markdown("# Title\r\nbody", "spaces")).toBe(
      "title",
    );
  });

  it("drops inline markup the editor writes into headings", () => {
    expect(
      heading_filename_from_markdown(
        "# **Bold** [link](https://x.test) [[Target|Alias]] ~~old~~ ##",
        "spaces",
      ),
    ).toBe("bold link alias old");
    expect(heading_filename_from_markdown("# [[Some Note]]", "hyphens")).toBe(
      "some-note",
    );
  });

  it("keeps inline code literal", () => {
    expect(
      heading_filename_from_markdown("# Call `__init__` first", "spaces"),
    ).toBe("call __init__ first");
    expect(heading_filename_from_markdown("# Use `a*b` here", "hyphens")).toBe(
      "use-a*b-here",
    );
    expect(
      heading_filename_from_markdown("# Use `&#x20;` here", "spaces"),
    ).toBe("use &#x20; here");
  });

  it("drops links whose url contains parentheses", () => {
    expect(
      heading_filename_from_markdown(
        "# See [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) now",
        "spaces",
      ),
    ).toBe("see foo now");
    expect(
      heading_filename_from_markdown("# [**Bold** _text_](u)", "spaces"),
    ).toBe("bold text");
  });

  it("drops underscore emphasis but keeps snake_case", () => {
    expect(
      heading_filename_from_markdown("# _Soft_ __Hard__ snake_case", "spaces"),
    ).toBe("soft hard snake_case");
  });

  it("caps the filename at 80 characters, ending at a word boundary", () => {
    const filename = heading_filename_from_markdown(
      `# ${"word ".repeat(30)}`,
      "spaces",
    );

    expect(filename).toBe("word ".repeat(16).trim());
    expect(filename?.length).toBeLessThanOrEqual(80);
  });

  it("keeps a heading that ends exactly at the limit before a delimiter", () => {
    const eighty = `${"a".repeat(39)} ${"b".repeat(40)}`;

    expect(heading_filename_from_markdown(`# ${eighty} tail`, "spaces")).toBe(
      eighty,
    );
    expect(heading_filename_from_markdown(`# ${eighty}`, "spaces")).toBe(
      eighty,
    );
  });

  it("cuts a single word longer than the limit", () => {
    expect(
      heading_filename_from_markdown(`# ${"x".repeat(120)}`, "spaces"),
    ).toBe("x".repeat(80));
  });

  it("leaves no dangling delimiter after the cut", () => {
    const heading = `# ${"a".repeat(78)} - ${"b".repeat(10)}`;

    expect(heading_filename_from_markdown(heading, "hyphens")).toBe(
      "a".repeat(78),
    );
    expect(heading_filename_from_markdown(heading, "spaces")).toBe(
      "a".repeat(78),
    );
  });

  it("does not split an emoji when cutting a long word", () => {
    const filename = heading_filename_from_markdown(
      `# ${"a".repeat(79)}😀`,
      "spaces",
    );

    expect(filename).toBe("a".repeat(79));
  });

  it("reads the edge-space character references the serializer writes", () => {
    const serialized = "# &#x20;       The short version.   \n";

    expect(heading_filename_from_markdown(serialized, "hyphens")).toBe(
      "the-short-version",
    );
    expect(heading_filename_from_markdown(serialized, "spaces")).toBe(
      "the short version",
    );
    expect(heading_filename_from_markdown("# &#x9;Title", "spaces")).toBe(
      "title",
    );
  });

  it("drops terminal periods but keeps interior dots", () => {
    expect(heading_filename_from_markdown("# Release 1.0.", "spaces")).toBe(
      "release 1.0",
    );
    expect(heading_filename_from_markdown("# Wait... ", "hyphens")).toBe(
      "wait",
    );
    expect(heading_filename_from_markdown("# ...", "spaces")).toBeNull();
  });

  it("drops a period that the length cap leaves at the end", () => {
    const heading = `# ${"a".repeat(79)}. tail`;

    expect(heading_filename_from_markdown(heading, "spaces")).toBe(
      "a".repeat(79),
    );
  });

  it("trims edge punctuation but keeps letters and digits of any script", () => {
    expect(heading_filename_from_markdown("# Learning C#", "spaces")).toBe(
      "learning c",
    );
    expect(heading_filename_from_markdown("# (Draft!) ?", "spaces")).toBe(
      "draft",
    );
    expect(heading_filename_from_markdown("# Plan Q3", "hyphens")).toBe(
      "plan-q3",
    );
    expect(heading_filename_from_markdown("# 2024 Version 2", "spaces")).toBe(
      "2024 version 2",
    );
    expect(heading_filename_from_markdown("# «Über Café»。", "spaces")).toBe(
      "über café",
    );
    expect(heading_filename_from_markdown("# 😀 ...", "spaces")).toBeNull();
  });
});

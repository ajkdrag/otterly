import { describe, expect, it } from "vitest";
import { clean_legacy_markdown } from "$lib/features/note/domain/legacy_markdown_cleanup";

describe("clean_legacy_markdown", () => {
  it("keeps one blank line between blocks and preserves leading and trailing runs", () => {
    const source = "\n\n# Heading\n\n\nParagraph\n\n\nNext\n\n";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe("\n\n# Heading\n\nParagraph\n\nNext\n\n");
    expect(result.counts.blank_lines_removed).toBe(2);
  });

  it("compacts separators between simple sibling list items", () => {
    const source = "- one\n\n- two\n\n- [ ] three\n\n1. four\n\n2. five";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(
      "- one\n- two\n- [ ] three\n\n1. four\n2. five",
    );
    expect(result.counts.list_separators_removed).toBe(3);
  });

  it("preserves separators for multi-line or nested list items", () => {
    const source =
      "- first\n  continuation\n\n- second\n\n- parent\n  - child\n\n- sibling";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(source);
    expect(result.counts.list_separators_removed).toBe(0);
  });

  it("removes only standalone breaks and keeps inline and list breaks", () => {
    const source = "Before<br />after\n<br />\nMiddle\n- <br />\n- next";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(
      "Before<br />after\n\nMiddle\n- <br />\n- next",
    );
    expect(result.counts.standalone_breaks_removed).toBe(1);
  });

  it("leaves frontmatter and fenced code byte-for-byte intact", () => {
    const source =
      "---\ntitle: x\n\n\n<br />\n---\n\n\n```md\n\n\n<br />\n```\n\n\nBody";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(
      "---\ntitle: x\n\n\n<br />\n---\n\n```md\n\n\n<br />\n```\n\nBody",
    );
    expect(result.counts.standalone_breaks_removed).toBe(0);
  });

  it("preserves indented code blocks and their blank lines", () => {
    const source = "Text\n\n    <br />\n    \n\nEnd";
    expect(clean_legacy_markdown(source).markdown).toBe(
      "Text\n\n    <br />\n    \nEnd",
    );
  });

  it("preserves CRLF endings while compacting duplicate blank lines", () => {
    const source = "First\r\n\r\n\r\nSecond\r\n";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe("First\r\n\r\nSecond\r\n");
  });

  it("preserves breaks inside literal and multiline HTML blocks", () => {
    const source =
      "<pre>\n<br />\n</pre>\n\n<script>\n<br>\n</script>\n\n<!--\n<br />\n-->\n\n<div>\n<br />\n</div>\n\nSafe\n<br />";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(
      "<pre>\n<br />\n</pre>\n\n<script>\n<br>\n</script>\n\n<!--\n<br />\n-->\n\n<div>\n<br />\n</div>\n\nSafe\n",
    );
    expect(result.counts.standalone_breaks_removed).toBe(1);
  });

  it("preserves standalone-looking breaks nested in quotes or lists", () => {
    const source = "Before\n\n> <br />\n\n- item\n  <br>\n\n- next\n\nAfter";
    const result = clean_legacy_markdown(source);

    expect(result.markdown).toBe(source);
    expect(result.counts.standalone_breaks_removed).toBe(0);
  });

  it("can leave simple list separators intact when compaction is disabled", () => {
    const source = "- one\n\n- two";
    const result = clean_legacy_markdown(source, {
      compact_simple_lists: false,
    });

    expect(result.markdown).toBe(source);
    expect(result.counts.list_separators_removed).toBe(0);
  });
});

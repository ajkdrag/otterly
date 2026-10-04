/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { clipboard_html_to_markdown } from "$lib/features/editor/adapters/html_clipboard";

describe("HTML clipboard import", () => {
  it("converts only the pasted fragment to Markdown", () => {
    expect(
      clipboard_html_to_markdown(
        '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://example.com">link</a>.</p>',
        "Title Some bold and link.",
      ),
    ).toBe("## Title\n\nSome **bold** and [link](https://example.com).");
  });
  it("retains Markdown copied from an editor that also offers HTML", () => {
    const markdown = "## Source\r\n\r\n*  item";
    expect(
      clipboard_html_to_markdown("<pre>formatted clipboard</pre>", markdown),
    ).toBe(markdown);
  });
  it("imports GFM tables and removes executable markup", () => {
    const markdown = clipboard_html_to_markdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table><script>alert(1)</script>",
      "A B x y",
    );
    expect(markdown).toContain("| A | B |");
    expect(markdown).toContain("| x | y |");
    expect(markdown).not.toContain("alert");
  });
});

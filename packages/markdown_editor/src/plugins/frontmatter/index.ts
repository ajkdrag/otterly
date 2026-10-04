import type { Input } from "@lezer/common";
import type { BlockContext, MarkdownConfig } from "@lezer/markdown";
import type { MarkdownPlugin } from "../../core/plugin.js";

// YAML frontmatter: a "---" line at the very top, up to a closing "---" or
// "..." line. It stays literal source. An unclosed opening line is ordinary
// Markdown (a rule), so a metadata block being typed does not swallow the
// note below it.
export function frontmatter(): MarkdownPlugin {
  return {
    name: "frontmatter",
    syntax: frontmatter_syntax,
    constructs: [
      {
        kind: "line",
        name: "frontmatter",
        nodes: ["Frontmatter"],
        literal: true,
        decorate(node, render) {
          render.lines(node.from, node.to, "md-frontmatter");
        },
      },
    ],
    theme: {
      ".md-frontmatter": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "var(--muted, #f2f2f2)",
      },
    },
  };
}

const opening = /^﻿?---[ \t]*$/;
const closing = /^(?:---|\.\.\.)[ \t]*$/;
// A real frontmatter block is small. Bound the lookahead so an unclosed
// opening line at the top of a huge note stays cheap to reparse.
const lookahead_limit = 200_000;

const frontmatter_syntax: MarkdownConfig = {
  defineNodes: [
    { name: "Frontmatter", block: true },
    { name: "FrontmatterMark" },
  ],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || !opening.test(line.text)) return false;
        const end = closing_line_end(cx, line.text.length);
        if (end === null) return false;
        const marks = [cx.elt("FrontmatterMark", 0, line.text.length)];
        while (cx.nextLine()) {
          if (closing.test(line.text)) {
            marks.push(
              cx.elt(
                "FrontmatterMark",
                cx.lineStart,
                cx.lineStart + line.text.length,
              ),
            );
            break;
          }
        }
        cx.nextLine();
        cx.addElement(cx.elt("Frontmatter", 0, end, marks));
        return true;
      },
    },
  ],
};

// @lezer/markdown does not give block parsers its input, and peekLine only
// sees one line ahead. Frontmatter has to find its closing line before it
// claims any line, so read the input the context holds. The frontmatter tests
// cover this if the internal field changes.
function closing_line_end(
  cx: BlockContext,
  first_line_length: number,
): number | null {
  const input = (cx as BlockContext & { input?: Input }).input;
  if (!input) return null;
  const text = input.read(0, Math.min(input.length, lookahead_limit));
  let position = first_line_length + 1;
  while (position <= text.length) {
    const line_end = text.indexOf("\n", position);
    const end = line_end < 0 ? text.length : line_end;
    if (closing.test(text.slice(position, end))) return end;
    if (line_end < 0) return null;
    position = line_end + 1;
  }
  return null;
}

import type { BlockContext, Line, MarkdownConfig } from "@lezer/markdown";

// Math as TeX between dollar signs, the way Obsidian, Typora and Joplin read it.
//
//   $a^2 + b^2$        InlineMath, one line, inside a paragraph
//   $$a^2 + b^2$$      InlineMath with two dollars, or a MathBlock when it is the
//                      whole line
//   $$                 MathBlock: an opening line that is just "$$", the TeX,
//   a^2 + b^2          and a closing line that is just "$$"
//   $$
//
// Inline rules follow Pandoc, so prices stay text: "$5 and $10" is not math.
// The opening "$" needs a non-space after it, the closing "$" a non-space
// before it and no digit after it, and the TeX holds no other unescaped "$".
//
// A block never holds a blank line. An opening "$$" that finds a blank line
// (or the end of its container) before a closing line still becomes a
// MathBlock node, so the lines under it do not turn into a paragraph. The
// editor draws such a node as source. Without that rule a "$$" typed at the top
// of a note would swallow the whole note until a closing line appears.
//
// Lezer cannot look ahead past the next line, so we consume lines and let the
// construct's `complete` check whether a closing line came.

const dollar = 36;

export const math_syntax: MarkdownConfig = {
  defineNodes: [{ name: "MathBlock", block: true }, { name: "InlineMath" }],
  parseBlock: [
    {
      name: "MathBlock",
      parse: parse_math_block,
      // A "$$" line right under a paragraph line starts the block, the way a
      // fence does.
      endLeaf: (_cx, line) => math_opener(line) !== null,
    },
  ],
  parseInline: [
    {
      name: "InlineMath",
      parse(cx, next, pos) {
        if (next !== dollar) return -1;
        const end = inline_math_end(cx.text, pos - cx.offset);
        return end < 0
          ? -1
          : cx.addElement(cx.elt("InlineMath", pos, cx.offset + end));
      },
    },
  ],
};

type MathOpener = "single_line" | "multi_line";

// What a block starting at this line looks like, or null when it is not one.
function math_opener(line: Line): MathOpener | null {
  if (line.next !== dollar || line.indent - line.baseIndent >= 4) return null;
  const text = line.text.slice(line.pos).trimEnd();
  if (text === "$$") return "multi_line";
  return single_line_body(text) === null ? null : "single_line";
}

// "$$ a + b $$" as a whole line. The TeX holds no "$$" of its own, so
// "$$a$$ and $$b$$" stays a paragraph with two inline formulas.
function single_line_body(text: string): string | null {
  if (!text.startsWith("$$") || !text.endsWith("$$") || text.length < 5)
    return null;
  const body = text.slice(2, -2);
  return body.trim() === "" || body.includes("$$") ? null : body;
}

function parse_math_block(cx: BlockContext, line: Line): boolean {
  const opener = math_opener(line);
  if (opener === null) return false;
  const from = cx.lineStart + line.pos;
  if (opener === "single_line") {
    const to = cx.lineStart + line.text.trimEnd().length;
    cx.nextLine();
    cx.addElement(cx.elt("MathBlock", from, to));
    return true;
  }
  while (cx.nextLine() && line_depth(line) >= cx.depth) {
    if (line.skipSpace(line.pos) === line.text.length) break;
    if (line.text.slice(line.pos).trim() === "$$") {
      cx.nextLine();
      break;
    }
  }
  cx.addElement(cx.elt("MathBlock", from, cx.prevLineEnd()));
  return true;
}

// Lezer's own fenced code parser stops when a line falls out of the open
// quote or list item. The depth is on Line at runtime but not in its types.
function line_depth(line: Line): number {
  return (line as Line & { depth: number }).depth;
}

// The index just past the closing delimiter of the formula that opens at
// text[start], or -1.
export function inline_math_end(text: string, start: number): number {
  const display = text[start + 1] === "$";
  const delimiter = display ? 2 : 1;
  const body_start = start + delimiter;
  if (body_start >= text.length || is_space(text[body_start])) return -1;
  for (let index = body_start; index < text.length; index++) {
    const char = text[index];
    if (char === "\n") return -1;
    if (char === "\\") {
      index++;
      continue;
    }
    if (char !== "$") continue;
    if (is_space(text[index - 1])) return -1;
    if (display) return text[index + 1] === "$" ? index + 2 : -1;
    return is_digit(text[index + 1]) ? -1 : index + 1;
  }
  return -1;
}

export type MathSource = {
  // The TeX without its dollars or any container prefix.
  tex: string;
  // "$$" formulas, blocks included, use KaTeX's display style.
  display: boolean;
  // False for an opening "$$" line that no closing line followed.
  closed: boolean;
};

// Reads the source of a MathBlock or InlineMath node. One line holding more
// than "$$" is a whole formula, so it is closed.
export function parse_math_source(source: string): MathSource {
  const lines = source.split("\n").map(strip_container_prefix);
  if (lines.length === 1) {
    const text = (lines[0] ?? "").trim();
    if (text === "$$") return { tex: "", display: true, closed: false };
    const delimiter = text.startsWith("$$") ? 2 : 1;
    return {
      tex: text.slice(delimiter, -delimiter).trim(),
      display: delimiter === 2,
      closed: true,
    };
  }
  const closed = (lines[lines.length - 1] ?? "").trim() === "$$";
  return {
    tex: lines
      .slice(1, closed ? -1 : undefined)
      .join("\n")
      .trim(),
    display: true,
    closed,
  };
}

// Lines of a block inside a quote or list item still carry the container's
// prefix in the document. Only quote markers and indentation are stripped,
// which is all a TeX line can start with before its own text.
function strip_container_prefix(line: string): string {
  return line.replace(/^[\s>]+/, "");
}

function is_space(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n";
}

function is_digit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

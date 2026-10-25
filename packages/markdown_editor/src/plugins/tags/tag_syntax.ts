import type { SyntaxNode } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

// The editor's half of the tag grammar. The index has its own parser in
// src-tauri/src/features/search/tag_parser.rs. Both follow rules R1 to R6 in
// docs/markdown_editor_behavior_spec.md, section 26, and both run the cases in
// tests/fixtures/tag_cases.json, so a chip in a note is a tag the index counts.
//
// R1 mostly comes for free: escapes, entities, inline code, HTML, autolinks
// and wiki links are consumed by their own inline parsers before we see the
// `#`. Links are not, see inside_link.

export const hashtag_style = Tag.define();

export const tag_syntax: MarkdownConfig = {
  // A leaf, no HashtagMark child: render_static drops nodes named "...Mark",
  // and the `#` gets its own decoration anyway.
  defineNodes: [{ name: "Hashtag", style: hashtag_style }],
  parseInline: [
    {
      name: "Hashtag",
      parse(cx, next, pos) {
        if (next !== 35 /* # */) return -1;
        // comrak drops a byte order mark at the start of the note, so a tag
        // right after it starts the text.
        const text_start =
          cx.offset === 0 && cx.text.charCodeAt(0) === 0xfeff ? 1 : 0;
        const body = read_tag(cx.text, pos - cx.offset, text_start);
        if (body === null) return -1;
        return cx.addElement(cx.elt("Hashtag", pos, pos + 1 + body.length));
      },
    },
  ],
};

// R2. `text[idx]` is a `#`. It starts a tag at the start of the text, after
// whitespace, or after a run of `*`, `_`, `~` that is itself at the start or
// after whitespace: `**#bold**` and an unclosed `**#x` are tags, `foo**#x**`
// is not. Any other char stops the walk, so the backslash in `\*#x` and the
// backtick in `` `c`*#x* `` keep those plain text, like HIDDEN does in Rust.
export function starts_tag(text: string, idx: number, text_start = 0): boolean {
  let run_start = idx;
  while (run_start > text_start && is_delimiter(text.charCodeAt(run_start - 1)))
    run_start--;
  return run_start === text_start || is_whitespace(text[run_start - 1] ?? "");
}

// The body of the tag whose `#` is at `text[idx]`, or null when there is no
// tag there.
export function read_tag(
  text: string,
  idx: number,
  text_start = 0,
): string | null {
  if (!starts_tag(text, idx, text_start)) return null;
  tag_chars.lastIndex = idx + 1;
  const run = tag_chars.exec(text);
  return run ? valid_body(run[0]) : null;
}

// R3. Matches Rust's tag_body_len: Alphabetic, numbers (Nd, Nl, No), marks (Mn,
// Mc, Me), emoji (Extended_Pictographic and the skin tone modifiers), `_`, `-`
// and `/`. U+FE0F and the keycap U+20E3 are marks. A zero width joiner counts
// only when an emoji follows it, so a family emoji is one tag body and a
// dangling joiner is not in the tag. The `u` flag makes emoji and astral
// letters one char each. The pattern is a string so tag_completion builds its
// own regexes from it.
//
// @Robustness: The WebView's ICU and Rust's unicode_categories and
// icu_properties can disagree on marks and emoji added in recent Unicode
// versions. Not worth a table of our own.
export const tag_body_pattern = String.raw`(?:[\p{Alphabetic}\p{N}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}_\-/]|\u200D(?=\p{Extended_Pictographic}))`;
const tag_chars = new RegExp(`${tag_body_pattern}+`, "uy");

// R4 and R5. Trailing `_` and `/` go. A trailing `_` is often the closer of
// `_..._` emphasis, which comrak has resolved before Rust scans and Lezer
// resolves after we run, so dropping it always is the only rule both sides
// can compute. Then at least one letter, number or emoji, no empty `/`
// segment, and not numbers only (`#123`, `#١٢٣`, `#²`).
function valid_body(body: string): string | null {
  const trimmed = body.replace(/[_/]+$/, "");
  if (!/[\p{Alphabetic}\p{N}\p{Extended_Pictographic}]/u.test(trimmed))
    return null;
  if (trimmed.split("/").includes("")) return null;
  if (/^\p{N}+$/u.test(trimmed)) return null;
  return trimmed;
}

function is_delimiter(code: number): boolean {
  return code === 42 /* * */ || code === 95 /* _ */ || code === 126 /* ~ */;
}

// Rust's char::is_whitespace, spelled out. `\s` differs: it adds U+FEFF and
// misses U+0085.
const whitespace =
  /^[\t-\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/;

function is_whitespace(char: string): boolean {
  return whitespace.test(char);
}

// R1 for links. Lezer resolves `[..]` after parsing what is inside it, so a
// Hashtag can end up inside a Link. An image, or a link with a destination
// (`[a](url)`) or a reference label (`[a][ref]`), hides the tag. A bare
// `[text]` shortcut has only LinkMark children and does not: without a link
// definition comrak reads it as text too, and we cannot resolve definitions.
// Checks `node` itself and its ancestors.
export function inside_link(node: SyntaxNode): boolean {
  for (
    let current: SyntaxNode | null = node;
    current;
    current = current.parent
  ) {
    if (current.name === "Image") return true;
    if (
      current.name === "Link" &&
      (current.getChild("URL") !== null ||
        current.getChild("LinkLabel") !== null)
    )
      return true;
  }
  return false;
}

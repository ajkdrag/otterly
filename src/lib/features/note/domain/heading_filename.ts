import type { HeadingFilenameDelimiter } from "$lib/shared/types/editor_settings";

// 0 to 3 leading spaces (4 would be a code block). A bare "#" is an empty heading.
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]+(.*))?$/u;

// Basename length, without ".md". Only generated suggestions are capped.
// sanitize_note_name only shortens the name or adds "_" to names of 4 chars or
// less, so the final basename stays within this limit.
const MAX_FILENAME_LENGTH = 80;

// Only the literal first line counts. A leading blank line or any other first
// line returns null so the caller keeps its Untitled default.
export function heading_filename_from_markdown(
  markdown: string,
  delimiter: HeadingFilenameDelimiter,
): string | null {
  const first_line = markdown.split(/\r?\n/u, 1)[0] ?? "";
  const heading = ATX_HEADING_LINE.exec(first_line);
  if (!heading) return null;

  const word_delimiter = delimiter === "hyphens" ? "-" : " ";
  // The serializer only encodes the first character of heading text: a leading
  // space or tab becomes &#x20; or &#x9;. Undo that before trimming the edges.
  // Entities later in the text are literal and stay (for example inside code spans).
  const heading_text = (heading[1] ?? "").replace(/^&#x(?:20|9);/u, " ");
  // Closing hashes ("# Title ##", "# ###") are part of the heading line, not the title.
  const title = heading_text.replace(/(?:^|[ \t]+)#+[ \t]*$/u, "");
  const filename = trim_filename_edges(strip_inline_markup(title))
    .toLowerCase()
    .replace(/\s+/gu, word_delimiter);

  return (
    trim_filename_edges(cap_filename_length(filename, word_delimiter)) || null
  );
}

// Only letters and digits (any script) may start or end a suggestion. Interior
// punctuation stays ("release 1.0"). The cap can expose punctuation, so this
// runs again after it.
function trim_filename_edges(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// Prefer ending at a word boundary. A single word longer than the limit is cut.
function cap_filename_length(filename: string, word_delimiter: string): string {
  if (filename.length <= MAX_FILENAME_LENGTH) return filename;

  // Look one char past the limit so a delimiter right at the limit counts as a boundary.
  const boundary = filename
    .slice(0, MAX_FILENAME_LENGTH + 1)
    .lastIndexOf(word_delimiter);
  // A hard cut can split an emoji pair. trim_filename_edges drops the lone surrogate.
  return filename.slice(0, boundary > 0 ? boundary : MAX_FILENAME_LENGTH);
}

// Narrow cleanup of what milkdown writes into headings, not a markdown parser.
// Markup cleanup keeps the contents of code spans literal, and underscores
// inside a word stay (snake_case). The edge trim still applies afterwards, so
// "# `__init__`" alone becomes "init".
// @Incomplete: multi-backtick code spans, link titles, <url> destinations and
// URLs with more than one level of parentheses leave fragments.
const INLINE_MARKUP = new RegExp(
  [
    "`([^`]+)`",
    "\\[\\[(?:[^\\]|]*\\|)?([^\\]]*)\\]\\]",
    "!?\\[([^\\]]*)\\]\\((?:[^()\\s]|\\([^()\\s]*\\))*\\)",
    "\\*|~~",
    "(?<![\\p{L}\\p{N}_])_+|_+(?![\\p{L}\\p{N}_])",
  ].join("|"),
  "gu",
);

function strip_inline_markup(text: string): string {
  return text.replace(
    INLINE_MARKUP,
    (_match, code?: string, wiki_text?: string, link_text?: string) => {
      if (code !== undefined) return code;
      if (wiki_text !== undefined) return wiki_text;
      if (link_text !== undefined) return strip_inline_markup(link_text);
      return "";
    },
  );
}

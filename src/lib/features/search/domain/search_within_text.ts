import { find_matches_in_line, find_regexp } from "@otterly/markdown-editor";
import type { FindSpec, InFileMatch } from "$lib/shared/types/search";

const CONTEXT_CHARS = 30;

// Counts matches with the editor's own pattern and line loop, so the count
// cannot disagree with the highlights.
export function search_within_text(
  text: string,
  spec: FindSpec,
): InFileMatch[] {
  const pattern = find_regexp(spec);
  if (!pattern || !text) return [];

  const matches: InFileMatch[] = [];
  // CodeMirror also breaks lines at a lone \r and at \r\n.
  const lines = text.split(/\r\n?|\n/);

  for (let line_idx = 0; line_idx < lines.length; line_idx++) {
    const line = lines[line_idx] ?? "";
    for (const found of find_matches_in_line(line, pattern)) {
      const col = found.index;
      const length = found[0].length;

      const context_start = Math.max(0, col - CONTEXT_CHARS);
      const context_end = Math.min(line.length, col + length + CONTEXT_CHARS);
      let context = line.slice(context_start, context_end);
      if (context_start > 0) context = "..." + context;
      if (context_end < line.length) context = context + "...";

      matches.push({
        line: line_idx + 1,
        column: col + 1,
        length,
        context,
      });
    }
  }

  return matches;
}

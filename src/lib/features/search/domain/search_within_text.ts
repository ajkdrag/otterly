import type { InFileMatch } from "$lib/shared/types/search";

export function search_within_text(text: string, query: string): InFileMatch[] {
  if (!query || !text) return [];

  const matches: InFileMatch[] = [];
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(pattern, "gi");
  const lines = text.split("\n");

  for (let line_idx = 0; line_idx < lines.length; line_idx++) {
    const line = lines[line_idx] ?? "";
    for (const match of line.matchAll(expression)) {
      const col = match.index;

      const context_start = Math.max(0, col - 30);
      const context_end = Math.min(line.length, col + query.length + 30);
      let context = line.slice(context_start, context_end);
      if (context_start > 0) context = "..." + context;
      if (context_end < line.length) context = context + "...";

      matches.push({
        line: line_idx + 1,
        column: col + 1,
        length: query.length,
        context,
      });
    }
  }

  return matches;
}

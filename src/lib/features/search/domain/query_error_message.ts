// The regex crate reports a syntax error as a block: "regex parse error:", the
// pattern, a caret line, then "error: <reason>". The panel has room for one
// line, so we keep the reason. Other messages (like the size limit) have no
// "error:" line, and their first line already says everything.
export function summarize_query_error(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const reason = lines.findLast((line) => line.startsWith("error:"));
  const text = reason ? reason.slice("error:".length).trim() : (lines[0] ?? "");
  return `Invalid regex: ${text}`;
}

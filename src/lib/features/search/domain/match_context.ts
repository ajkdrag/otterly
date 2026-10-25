const CONTEXT_WORDS = 3;

// Rust sends up to 60 characters before a match. In a narrow sidebar that
// text would fill the row and push the match out of view, so the list keeps
// the last few words. Trailing whitespace stays, it is the gap before the match.
export function trim_context_before(before: string): string {
  const words = before.match(/\S+\s*/g) ?? [];
  if (words.length <= CONTEXT_WORDS) return before;
  return `…${words.slice(-CONTEXT_WORDS).join("")}`;
}

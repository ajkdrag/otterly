const CONTEXT_WORDS = 3;
const NO_BREAK_SPACE = " ";

// Rust sends up to 60 characters before a match. In a narrow sidebar that
// text would fill the row and push the match out of view, so the list keeps
// the last few words.
//
// The whitespace between those words and the match comes back as its own
// value. The words are drawn in a right-to-left box (so the ellipsis lands on
// their left), and that box drops its trailing space. The gap gets a box of its
// own, and no-break spaces survive any white-space rule.
export function trim_context_before(before: string): {
  text: string;
  gap: string;
} {
  const words_only = before.trimEnd();
  const gap = before.slice(words_only.length).replace(/\s/g, NO_BREAK_SPACE);
  const words = words_only.match(/\S+\s*/g) ?? [];
  if (words.length <= CONTEXT_WORDS) return { text: words_only, gap };
  return { text: `…${words.slice(-CONTEXT_WORDS).join("")}`, gap };
}

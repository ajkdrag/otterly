export type FindOption = "case_sensitive" | "whole_word" | "regex";

// Alt+C, Alt+W and Alt+R flip the find options. Match on event.code: Option+C
// types "ç" on macOS, so event.key says nothing about the letter.
export function find_option_for_shortcut(
  event: KeyboardEvent,
): FindOption | null {
  if (!event.altKey || event.metaKey || event.ctrlKey) return null;
  if (event.code === "KeyC") return "case_sensitive";
  if (event.code === "KeyW") return "whole_word";
  if (event.code === "KeyR") return "regex";
  return null;
}

import { tag_key } from "$lib/features/tags/domain/tag_key";

export type TextPart = { text: string; is_tag: boolean };

// Same chars as rule R3 (docs/markdown_editor_behavior_spec.md, section 26).
// We do not import the editor package here, so this is a copy.
const TAG_BODY = /[\p{Alphabetic}\p{N}\p{M}_\-/]+/uy;
const BEFORE_HASH = /[\p{Alphabetic}\p{N}\p{M}_\-/#]$/u;

// Splits a plain excerpt into text and `#tag` parts, for the tags in `tags`.
// A tag matches by key and as a whole tag: `#ab` is not `#a`. Excerpts are
// plain text from the index, so this only needs R3 and R4, not the full R2.
export function split_text_on_tag(
  text: string,
  tags: readonly string[],
): TextPart[] {
  const wanted_keys = new Set(tags.map(tag_key));
  const parts: TextPart[] = [];
  let copied_to = 0;
  let hash = text.indexOf("#");

  while (hash !== -1) {
    const tag_end = tag_end_at(text, hash, wanted_keys);
    if (tag_end === null) {
      hash = text.indexOf("#", hash + 1);
      continue;
    }
    if (hash > copied_to) {
      parts.push({ text: text.slice(copied_to, hash), is_tag: false });
    }
    parts.push({ text: text.slice(hash, tag_end), is_tag: true });
    copied_to = tag_end;
    hash = text.indexOf("#", tag_end);
  }

  if (copied_to < text.length) {
    parts.push({ text: text.slice(copied_to), is_tag: false });
  }
  return parts;
}

// Where the wanted tag at `text[hash]` ends, or null when there is none.
function tag_end_at(
  text: string,
  hash: number,
  wanted_keys: Set<string>,
): number | null {
  // `C#project`, `a#b` and `##x` are not tags. Slice two units so an astral
  // letter before the `#` is still one code point for the `u` regex.
  if (BEFORE_HASH.test(text.slice(Math.max(0, hash - 2), hash))) return null;

  TAG_BODY.lastIndex = hash + 1;
  const run = TAG_BODY.exec(text);
  if (run === null) return null;

  const body = run[0].replace(/[_/]+$/, "");
  return wanted_keys.has(tag_key(body)) ? hash + 1 + body.length : null;
}

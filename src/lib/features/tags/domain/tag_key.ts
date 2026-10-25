// Same identity as the index (rule R6): `#Work` and `#work` are one tag, and
// so are `café` typed precomposed and typed as `e` plus U+0301.
export function tag_key(tag: string): string {
  return tag.normalize("NFC").toLowerCase();
}

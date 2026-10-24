import { expand_replacement } from "@otterly/markdown-editor";
import type { VaultFindMatch } from "$lib/features/search/types/vault_find";

// The text a match turns into, for the strikethrough preview in the vault
// find list. Literal mode inserts the replacement as is. Regex mode expands
// $1, ${name}, $$ from the capture groups Rust sent, with the same function
// the in-file find bar uses, so the two read the template the same way.
export function build_replacement_preview(
  match: VaultFindMatch,
  replacement: string,
  regex: boolean,
  group_names: (string | null)[],
): string {
  if (!regex) return replacement;
  const groups = match.groups.map((group) => group ?? "");
  const named: Record<string, string> = {};
  group_names.forEach((name, idx) => {
    if (name) named[name] = groups[idx] ?? "";
  });
  const captures: RegExpMatchArray = Object.assign(
    [match.text, ...groups] as [string, ...string[]],
    { groups: named },
  );
  return expand_replacement(replacement, captures);
}

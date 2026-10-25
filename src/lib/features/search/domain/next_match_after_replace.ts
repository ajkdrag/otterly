import type { VaultFindFile } from "$lib/features/search/types/vault_find";
import { compare_paths } from "$lib/shared/utils/path";

export type ReplacedMatch = {
  path: string;
  line: number;
  column: number;
  // UTF-16 length of the text that went in, like the match columns.
  inserted_length: number;
};

// Where the selection goes after replacing one match: the first match that
// starts after the inserted text, else the first match of the next file, else
// nothing. `files` are the results after the replace, so the replaced file
// holds a fresh scan of what is left in it, or is gone.
//
// Skipping the inserted text matters for foo -> foobar. The fresh scan finds
// a new foo at the same column, and selecting it would make every Enter grow
// foobarbar.
export function next_match_after_replace(
  files: VaultFindFile[],
  replaced: ReplacedMatch,
): { path: string; index: number } | null {
  const inserted_end = replaced.column + replaced.inserted_length;
  for (const file of files) {
    const order = compare_paths(file.path, replaced.path);
    if (order < 0) continue;
    const next =
      order === 0
        ? file.matches.find(
            (match) =>
              match.line > replaced.line ||
              (match.line === replaced.line && match.column >= inserted_end),
          )
        : file.matches[0];
    if (next) return { path: file.path, index: next.index };
  }
  return null;
}

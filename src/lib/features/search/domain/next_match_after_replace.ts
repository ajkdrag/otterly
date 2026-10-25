import type { VaultFindFile } from "$lib/features/search/types/vault_find";
import { compare_paths } from "$lib/shared/utils/path";

export type ReplacedMatch = {
  path: string;
  line: number;
  column: number;
  // UTF-16 length of the text that went in, like the match columns.
  inserted_length: number;
};

type MatchPosition = { path: string; index: number };

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
): MatchPosition | null {
  const inserted_end = replaced.column + replaced.inserted_length;
  const replaced_file = files.find(
    (file) => compare_paths(file.path, replaced.path) === 0,
  );
  const next = replaced_file?.matches.find(
    (match) =>
      match.line > replaced.line ||
      (match.line === replaced.line && match.column >= inserted_end),
  );
  if (replaced_file && next) {
    return { path: replaced_file.path, index: next.index };
  }
  return first_match_after_file(files, replaced.path);
}

// After Replace in file the whole file was rewritten, so none of its fresh
// matches is "next" (foo -> foobar finds foo again). Move to the first match
// of the following file, else nothing.
export function first_match_after_file(
  files: VaultFindFile[],
  path: string,
): MatchPosition | null {
  for (const file of files) {
    const first_match = file.matches[0];
    if (compare_paths(file.path, path) > 0 && first_match) {
      return { path: file.path, index: first_match.index };
    }
  }
  return null;
}

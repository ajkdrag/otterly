import type { FindSpec } from "$lib/shared/types/search";
import type { TagMatch } from "$lib/features/tags";

// Shapes shared with the Rust vault find (features/search/vault_find.rs and
// VaultFindStartRequest in service.rs). Field names match the serde structs.
// VaultFindSelection, last in the file, is the one UI-only shape.

export type VaultFindRequest = FindSpec & {
  // Comma separated globs. "" means every file.
  include: string;
  exclude: string;
  // The omnibar's tag chips: only files of notes with all (or any) of these
  // tags. [] means every file.
  tags: string[];
  tag_match: TagMatch;
};

export type VaultFindMatch = {
  // Ordinal in the file's match list as Rust found it. Replace sends these
  // back, and the selection keys on them.
  index: number;
  // 1-based line. column and length are UTF-16 units in that line, the
  // same units the editor uses.
  line: number;
  column: number;
  length: number;
  before: string;
  text: string;
  after: string;
  // Capture groups 1..n, in regex mode only (empty otherwise). Group 0 is
  // `text`. null is a group that did not take part in the match. The
  // replacement preview expands $1, ${name} and so on from these.
  groups: (string | null)[];
};

export type VaultFindFile = {
  path: string;
  content_hash: string;
  matches: VaultFindMatch[];
};

export type VaultFindStats = {
  match_count: number;
  truncated: boolean;
  elapsed_ms: number;
};

export type VaultFindEvent =
  | {
      type: "files";
      files: VaultFindFile[];
      // Names of capture groups 1..n, aligned with VaultFindMatch.groups.
      group_names: (string | null)[];
    }
  | ({ type: "done" } & VaultFindStats);

export type VaultFindError = {
  kind: "invalid_query" | "invalid_glob" | "failed";
  // One line, ready to show.
  message: string;
  // The engine's full message when message is a summary of it.
  details?: string;
};

export type VaultFindStartResult =
  | { status: "started" }
  | { status: "invalid"; error: VaultFindError };

export type VaultReplaceFile = {
  path: string;
  content_hash: string;
  // Ordinals of the matches to replace (VaultFindMatch.index).
  match_indexes: number[];
};

export type VaultReplaceRequest = FindSpec & {
  replacement: string;
  files: VaultReplaceFile[];
};

export type VaultReplaceSkipReason =
  | "changed"
  | "missing"
  | "not_text"
  | "read_failed"
  | "write_failed"
  | "open_in_window";

export type VaultReplaceResponse = {
  replaced: {
    path: string;
    count: number;
    // A fresh scan of the written file. null when no match is left.
    remaining: VaultFindFile | null;
  }[];
  skipped: { path: string; reason: VaultReplaceSkipReason }[];
};

// The match Text mode has selected. A match ordinal, not a row number, so
// it stays on the same match while results stream in. Only valid while
// request_key is the key of the results on screen.
export type VaultFindSelection = {
  request_key: string;
  path: string;
  index: number;
};

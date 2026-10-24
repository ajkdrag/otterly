import type { FindSpec } from "$lib/shared/types/search";

// Shapes shared with the Rust vault find (features/search/vault_find.rs).
// Field names match the serde structs.

export type VaultFindRequest = FindSpec & {
  // Comma separated globs. "" means every file.
  include: string;
  exclude: string;
};

export type VaultFindMatch = {
  // Ordinal in the file's match list as Rust found it. Replace sends these
  // back, so it stays fixed when other matches are dismissed.
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
  message: string;
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

import type { FindSpec } from "$lib/shared/types/search";

// Shapes shared with the Rust vault find (features/search/vault_find.rs).
// Field names match the serde structs.

export type VaultFindRequest = FindSpec & {
  // Comma separated globs. "" means every file.
  include: string;
  exclude: string;
  // Non-null: each match carries its replaced text, for an exact preview.
  replacement: string | null;
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
  replacement: string | null;
};

export type VaultFindFile = {
  path: string;
  content_hash: string;
  matches: VaultFindMatch[];
};

export type VaultFindStats = {
  searched_files: number;
  skipped_files: number;
  match_count: number;
  truncated: boolean;
  elapsed_ms: number;
};

export type VaultFindEvent =
  | { type: "files"; files: VaultFindFile[] }
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
  // null replaces every match in the file.
  match_indexes: number[] | null;
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
  | "write_failed";

export type VaultReplaceResponse = {
  replaced: {
    path: string;
    count: number;
    // A fresh scan of the written file. null when no match is left.
    remaining: VaultFindFile | null;
  }[];
  skipped: { path: string; reason: VaultReplaceSkipReason }[];
};

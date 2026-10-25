import { vault_find_match_key } from "$lib/features/search/domain/vault_find_request";
import type {
  VaultFindFile,
  VaultFindMatch,
  VaultFindSelection,
} from "$lib/features/search/types/vault_find";

// The rows of the omnibar's Text mode list. row_index is the row's position
// in the list, for the virtualizer and the keyboard. UI shapes only, Rust
// never sees them.
export type VaultFindFileRow = {
  kind: "file";
  key: string;
  row_index: number;
  file: VaultFindFile;
};

export type VaultFindMatchRow = {
  kind: "match";
  key: string;
  row_index: number;
  file: VaultFindFile;
  match: VaultFindMatch;
};

export type VaultFindRow = VaultFindFileRow | VaultFindMatchRow;

export type VaultFindRowList = {
  rows: VaultFindRow[];
  // Match rows by key, so the selected match is found without scanning up to
  // 10,000 rows.
  match_rows: Map<string, VaultFindMatchRow>;
};

// A file row, then one row per match under it.
export function build_find_rows(files: VaultFindFile[]): VaultFindRowList {
  const rows: VaultFindRow[] = [];
  const match_rows = new Map<string, VaultFindMatchRow>();
  for (const file of files) {
    rows.push({
      kind: "file",
      key: `file:${file.path}`,
      row_index: rows.length,
      file,
    });
    for (const match of file.matches) {
      const row: VaultFindMatchRow = {
        kind: "match",
        key: vault_find_match_key(file.path, match.index),
        row_index: rows.length,
        file,
        match,
      };
      rows.push(row);
      match_rows.set(row.key, row);
    }
  }
  return { rows, match_rows };
}

// The selection is a match key, so it stays on its match while batches
// insert files above it. It falls back to the first match when it belongs to
// other results (a new pattern, say) or its match is gone.
//
// While the search still runs, a remembered match whose file has not streamed
// in yet selects nothing. The first match would take the arrow keys and Enter
// meanwhile, and Enter would open or replace the wrong one.
export function resolve_selected_row(
  row_list: VaultFindRowList,
  selection: VaultFindSelection | null,
  results_key: string | null,
  is_searching: boolean,
): VaultFindMatchRow | null {
  if (selection && selection.request_key === results_key) {
    const row = row_list.match_rows.get(
      vault_find_match_key(selection.path, selection.index),
    );
    if (row) return row;
    if (is_searching) return null;
  }
  return row_list.rows.find((row) => row.kind === "match") ?? null;
}

// The match one step up or down. Wraps around like the Notes list, and skips
// the file rows.
export function step_find_selection(
  rows: VaultFindRow[],
  from: VaultFindMatchRow,
  step: 1 | -1,
): VaultFindMatchRow | null {
  let index = from.row_index;
  for (let tries = 0; tries < rows.length; tries += 1) {
    index = (index + step + rows.length) % rows.length;
    const row = rows[index];
    if (row?.kind === "match") return row;
  }
  return null;
}

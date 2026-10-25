import type { SearchScope } from "$lib/shared/types/search";

export const SEARCH_BM25_WEIGHTS = {
  title: 10.0,
  name: 12.0,
  path: 5.0,
  body: 1.0,
} as const;

export const SUGGEST_BM25_WEIGHTS = {
  title: 15.0,
  name: 20.0,
  path: 5.0,
  body: 0.0,
} as const;

export const SEARCH_SNIPPET_SQL =
  "snippet(notes_fts, 3, '<b>', '</b>', '...', 30)";

export const SEARCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  name,
  path,
  body,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS outlinks (
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  PRIMARY KEY (source_path, target_path)
);

CREATE INDEX IF NOT EXISTS idx_outlinks_target ON outlinks(target_path);
`;

export const UPSERT_NOTE_SQL =
  "REPLACE INTO notes (path, title, mtime_ms, size_bytes) VALUES (?1, ?2, ?3, ?4)";
export const DELETE_NOTE_SQL = "DELETE FROM notes WHERE path = ?1";
export const DELETE_NOTE_FTS_SQL = "DELETE FROM notes_fts WHERE path = ?1";
export const INSERT_NOTE_FTS_SQL =
  "INSERT INTO notes_fts (title, name, path, body) VALUES (?1, ?2, ?3, ?4)";
export const DELETE_ALL_NOTES_SQL = "DELETE FROM notes";
export const DELETE_ALL_NOTES_FTS_SQL = "DELETE FROM notes_fts";
export const DELETE_ALL_OUTLINKS_SQL = "DELETE FROM outlinks";
export const SELECT_ALL_NOTES_SQL =
  "SELECT path, title, mtime_ms, size_bytes FROM notes";
export const DELETE_OUTLINKS_FOR_SOURCE_SQL =
  "DELETE FROM outlinks WHERE source_path = ?1";
export const INSERT_OUTLINK_SQL =
  "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)";

export const SEARCH_SQL = `SELECT n.path, n.title, n.mtime_ms, n.size_bytes,
  ${SEARCH_SNIPPET_SQL} as snippet,
  bm25(notes_fts, 10.0, 12.0, 5.0, 1.0) as rank
FROM notes_fts
JOIN notes n ON n.path = notes_fts.path
WHERE notes_fts MATCH ?1
ORDER BY rank
LIMIT ?2`;

export const SUGGEST_SQL = `SELECT n.path, n.title, n.mtime_ms, n.size_bytes,
  bm25(notes_fts, 15.0, 20.0, 5.0, 0.0) as rank
FROM notes_fts
JOIN notes n ON n.path = notes_fts.path
WHERE notes_fts MATCH ?1
ORDER BY rank
LIMIT ?2`;

export const PLANNED_SUGGEST_SQL = `SELECT o.target_path, COUNT(*) as ref_count
FROM outlinks o
LEFT JOIN notes n ON n.path = o.target_path
WHERE n.path IS NULL
  AND lower(o.target_path) LIKE ?1 ESCAPE '\\'
GROUP BY o.target_path
ORDER BY ref_count DESC, o.target_path ASC
LIMIT ?2`;

export function escape_fts_query(query: string): string {
  return query
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => `"${term.replaceAll('"', "")}"`)
    .join(" ");
}

export function escape_fts_prefix_query(query: string): string {
  return query
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) =>
      term
        .split("")
        .filter((char) => /[\p{L}\p{N}_-]/u.test(char))
        .join(""),
    )
    .filter((term) => term.length > 0)
    .map((term) => `"${term}"*`)
    .join(" ");
}

export function search_match_expression(
  query: string,
  scope: SearchScope,
): string {
  const escaped = escape_fts_query(query.trim());
  if (scope === "title") return `title : ${escaped}`;
  if (scope === "path") return `path : ${escaped}`;
  return escaped;
}

export function suggest_match_expression(query: string): string {
  const escaped = escape_fts_prefix_query(query.trim());
  if (escaped === "") return "";
  return `{title name path} : ${escaped}`;
}

export function planned_match_expression(query: string): string {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return "";
  const escaped = trimmed
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

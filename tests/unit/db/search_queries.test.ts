import { describe, expect, it } from "vitest";
import {
  SEARCH_BM25_WEIGHTS,
  PLANNED_SUGGEST_SQL,
  SEARCH_SNIPPET_SQL,
  SEARCH_SQL,
  SUGGEST_BM25_WEIGHTS,
  SUGGEST_SQL,
  escape_fts_prefix_query,
  escape_fts_query,
  planned_match_expression,
  search_match_expression,
  suggest_match_expression,
} from "$lib/features/search/db/search_queries";

describe("search_queries", () => {
  it("escapes search terms as quoted tokens", () => {
    expect(escape_fts_query("alpha beta")).toBe('"alpha" "beta"');
    expect(escape_fts_query('alpha "beta"')).toBe('"alpha" "beta"');
  });

  it("builds prefix queries with sanitization", () => {
    expect(escape_fts_prefix_query("alpha beta")).toBe('"alpha"* "beta"*');
    expect(escape_fts_prefix_query("a! b@")).toBe('"a"* "b"*');
    expect(escape_fts_prefix_query("!!!")).toBe("");
  });

  it("builds scope-aware MATCH expressions", () => {
    expect(search_match_expression("alpha", "all")).toBe('"alpha"');
    expect(search_match_expression("alpha", "title")).toBe('title : "alpha"');
    expect(search_match_expression("alpha", "path")).toBe('path : "alpha"');
  });

  it("builds wiki suggest expression on title/name/path columns", () => {
    expect(suggest_match_expression("wiki link")).toBe(
      '{title name path} : "wiki"* "link"*',
    );
  });

  it("returns empty string when suggest query has only special characters", () => {
    expect(suggest_match_expression("!!!")).toBe("");
    expect(suggest_match_expression("  ")).toBe("");
    expect(suggest_match_expression("@#$")).toBe("");
  });

  it("builds planned-link LIKE expression with escaping", () => {
    expect(planned_match_expression("Plan")).toBe("%plan%");
    expect(planned_match_expression("a%b_c")).toBe("%a\\%b\\_c%");
  });

  it("keeps SQL constants aligned with FTS parity settings", () => {
    expect(SEARCH_BM25_WEIGHTS).toEqual({
      title: 10,
      name: 12,
      path: 5,
      body: 1,
    });
    expect(SUGGEST_BM25_WEIGHTS).toEqual({
      title: 15,
      name: 20,
      path: 5,
      body: 0,
    });
    expect(SEARCH_SNIPPET_SQL).toContain("snippet(notes_fts, 3");
    expect(SEARCH_SQL).toContain("bm25(notes_fts, 10.0, 12.0, 5.0, 1.0)");
    expect(SUGGEST_SQL).toContain("bm25(notes_fts, 15.0, 20.0, 5.0, 0.0)");
    expect(PLANNED_SUGGEST_SQL).toContain("COUNT(*) as ref_count");
  });
});

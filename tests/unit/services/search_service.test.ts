import { describe, expect, it, vi } from "vitest";
import { SearchService } from "$lib/features/search/application/search_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";
import type {
  PlannedLinkSuggestion,
  WikiSuggestion,
} from "$lib/shared/types/search";
import { create_test_vault } from "../helpers/test_fixtures";

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function existing(path: string, score = 1): WikiSuggestion {
  return {
    kind: "existing",
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1)?.replace(".md", "") ?? "",
      title: path.split("/").at(-1)?.replace(".md", "") ?? "",
      mtime_ms: 0,
      size_bytes: 0,
    },
    score,
  };
}

function planned(
  target_path: string,
  ref_count: number,
): PlannedLinkSuggestion {
  return { target_path, ref_count };
}

describe("SearchService", () => {
  it("searches notes and returns results", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 1,
          snippet: "match",
        },
      ]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault = create_test_vault();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);

    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_notes("alpha");

    expect(search_port.search_notes).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.results.length).toBe(1);
    }
    expect(op_store.get("search.notes").status).toBe("success");
  });

  it("returns empty result and resets op for empty query", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    op_store.start("search.notes", 123);
    const result = await service.search_notes("  ");

    expect(result).toEqual({
      status: "empty",
      results: [],
    });
    expect(search_port.search_notes).not.toHaveBeenCalled();
    expect(op_store.get("search.notes").status).toBe("idle");
  });

  it("finds the editor width setting in settings search", () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const results = service.search_settings("width");

    expect(
      results.some(
        (result) =>
          result.kind === "setting" &&
          result.setting.key === "editor_max_width_ch" &&
          result.setting.category === "Layout",
      ),
    ).toBe(true);
  });

  it("finds palette commands by practical aliases", async () => {
    const service = new SearchService(
      {} as never,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const save_results = await service.search_omnibar(">save note");
    const find_results = await service.search_omnibar(">find in note");
    const theme_results = await service.search_omnibar(">dark mode");

    expect(save_results.items[0]).toMatchObject({
      kind: "command",
      command: { id: "save_note" },
    });
    expect(find_results.items[0]).toMatchObject({
      kind: "command",
      command: { id: "find_in_note" },
    });
    expect(theme_results.items[0]).toMatchObject({
      kind: "command",
      command: { id: "open_theme_settings" },
    });
  });

  it("finds settings through their everyday aliases", () => {
    const service = new SearchService(
      {} as never,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    expect(
      service
        .search_settings("version control")
        .some(
          (item) =>
            item.kind === "setting" &&
            item.setting.key === "git_autocommit_enabled",
        ),
    ).toBe(true);
    expect(
      service
        .search_settings("line width")
        .some(
          (item) =>
            item.kind === "setting" &&
            item.setting.key === "editor_max_width_ch",
        ),
    ).toBe(true);
  });

  it("returns stale for out-of-order wiki suggest responses", async () => {
    const first = create_deferred<WikiSuggestion[]>();
    const second = create_deferred<WikiSuggestion[]>();
    let call = 0;

    const search_port = {
      suggest_wiki_links: vi.fn().mockImplementation(() => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      }),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault = create_test_vault();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const p1 = service.suggest_wiki_links("alpha");
    const p2 = service.suggest_wiki_links("beta");

    second.resolve([existing("docs/beta.md")]);
    first.resolve([existing("docs/alpha.md")]);

    const r2 = await p2;
    expect(r2.status).toBe("success");

    const r1 = await p1;
    expect(r1).toEqual({ status: "stale", results: [] });
  });

  it("marks in-flight wiki suggest stale when query becomes empty", async () => {
    const deferred = create_deferred<WikiSuggestion[]>();
    const search_port = {
      suggest_wiki_links: vi.fn().mockReturnValue(deferred.promise),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault = create_test_vault();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const inflight = service.suggest_wiki_links("alpha");
    const empty = await service.suggest_wiki_links("   ");
    expect(empty).toEqual({ status: "empty", results: [] });

    deferred.resolve([existing("docs/alpha.md")]);
    const result = await inflight;
    expect(result).toEqual({ status: "stale", results: [] });
  });

  it("merges existing and planned wiki suggestions with reserve and dedupe", async () => {
    const search_port = {
      suggest_wiki_links: vi
        .fn()
        .mockResolvedValue([
          existing("docs/shared.md", 1),
          existing("docs/existing-1.md", 2),
          existing("docs/existing-2.md", 3),
          existing("docs/existing-3.md", 4),
          existing("docs/existing-4.md", 5),
          existing("docs/existing-5.md", 6),
          existing("docs/existing-6.md", 7),
          existing("docs/existing-7.md", 8),
          existing("docs/existing-8.md", 9),
          existing("docs/existing-9.md", 10),
          existing("docs/existing-10.md", 11),
          existing("docs/existing-11.md", 12),
        ]),
      suggest_planned_links: vi
        .fn()
        .mockResolvedValue([
          planned("docs/planned-low.md", 1),
          planned("docs/planned-high.md", 9),
          planned("docs/shared.md", 20),
          planned("docs/planned-mid.md", 3),
          planned("docs/planned-tail.md", 2),
        ]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.suggest_wiki_links("plan");
    expect(result.status).toBe("success");
    if (result.status !== "success") {
      throw new Error("expected success");
    }

    expect(result.results).toHaveLength(15);
    const planned_results = result.results.filter(
      (item) => item.kind === "planned",
    );
    expect(planned_results).toHaveLength(4);
    expect(planned_results.map((item) => item.target_path)).toEqual([
      "docs/planned-high.md",
      "docs/planned-mid.md",
      "docs/planned-tail.md",
      "docs/planned-low.md",
    ]);
    expect(result.results[0]).toMatchObject({
      kind: "existing",
      note: { path: as_note_path("docs/shared.md") },
    });
  });

  it("searches planned notes in omnibar domain", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi
        .fn()
        .mockResolvedValue([
          planned("docs/planned/a.md", 7),
          planned("docs/planned/b.md", 3),
        ]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_omnibar("#planned docs/planned");
    expect(result.domain).toBe("planned");
    expect(result.items).toEqual([
      {
        kind: "planned_note",
        target_path: "docs/planned/a.md",
        ref_count: 7,
        score: 7,
      },
      {
        kind: "planned_note",
        target_path: "docs/planned/b.md",
        ref_count: 3,
        score: 3,
      },
    ]);
  });

  it("blends file hits ahead of content hits in omnibar search", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("notes/meeting-notes.md"),
            path: as_note_path("notes/meeting-notes.md"),
            name: "meeting-notes",
            title: "Meeting Notes",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 0.8,
          snippet: "weekly meeting agenda",
        },
        {
          note: {
            id: as_note_path("notes/agenda.md"),
            path: as_note_path("notes/agenda.md"),
            name: "agenda",
            title: "Agenda",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 0.7,
          snippet: "meeting follow-up",
        },
      ]),
      suggest_files: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("notes/meeting-notes.md"),
            path: as_note_path("notes/meeting-notes.md"),
            name: "meeting-notes",
            title: "Meeting Notes",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 90,
        },
      ]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault = create_test_vault();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const result = await service.search_omnibar("meet");

    expect(result.domain).toBe("notes");
    expect(result.items).toMatchObject([
      {
        kind: "note",
        note: { path: as_note_path("notes/meeting-notes.md") },
        match_kind: "file",
        match_detail: "filename",
      },
      {
        kind: "note",
        note: { path: as_note_path("notes/agenda.md") },
        match_kind: "content",
        match_detail: "content",
      },
    ]);
  });

  it("uses file-only omnibar mode for @file queries", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("docs/meeting-notes.md"),
            path: as_note_path("docs/meeting-notes.md"),
            name: "meeting-notes",
            title: "Meeting Notes",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 95,
        },
      ]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault = create_test_vault();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const result = await service.search_omnibar("@file meet");

    expect(search_port.search_notes).not.toHaveBeenCalled();
    expect(search_port.suggest_files).toHaveBeenCalledWith(vault.id, "meet", 8);
    expect(result.items).toMatchObject([
      {
        kind: "note",
        match_kind: "file",
      },
    ]);
  });

  it("searches across available vaults and groups results by vault", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockImplementation((vault_id: string) => {
        if (vault_id === "vault-work") {
          return Promise.resolve([
            {
              note: {
                id: as_note_path("work/ml.md"),
                path: as_note_path("work/ml.md"),
                name: "ml",
                title: "Machine Learning",
                mtime_ms: 0,
                size_bytes: 0,
              },
              score: 0.9,
              snippet: "ml",
            },
          ]);
        }
        return Promise.resolve([
          {
            note: {
              id: as_note_path("research/ml.md"),
              path: as_note_path("research/ml.md"),
              name: "ml",
              title: "ML Notes",
              mtime_ms: 0,
              size_bytes: 0,
            },
            score: 0.8,
            snippet: "ml",
          },
        ]);
      }),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_recent_vaults([
      {
        id: as_vault_id("vault-work"),
        name: "Work",
        path: as_vault_path("/vault/work"),
        created_at: 1,
        is_available: true,
      },
      {
        id: as_vault_id("vault-research"),
        name: "Research",
        path: as_vault_path("/vault/research"),
        created_at: 1,
        is_available: true,
      },
      {
        id: as_vault_id("vault-offline"),
        name: "Offline",
        path: as_vault_path("/vault/offline"),
        created_at: 1,
        is_available: false,
      },
    ]);

    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_notes_all_vaults("machine learning");

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      throw new Error("expected success");
    }
    expect(result.groups.map((group) => group.vault_name)).toEqual([
      "Work",
      "Research",
    ]);
    expect(search_port.search_notes).toHaveBeenCalledTimes(2);
    expect(op_store.get("search.notes.all_vaults").status).toBe("success");
  });

  it("returns failed when all cross-vault searches fail", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockRejectedValue(new Error("index unavailable")),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_recent_vaults([
      {
        id: as_vault_id("vault-a"),
        name: "A",
        path: as_vault_path("/vault/a"),
        created_at: 1,
        is_available: true,
      },
    ]);

    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_notes_all_vaults("ml");

    expect(result.status).toBe("failed");
    expect(op_store.get("search.notes.all_vaults").status).toBe("error");
  });

  it("includes active vault even when not in recent list", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_files: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault({
      id: as_vault_id("vault-active"),
      name: "Active",
      path: as_vault_path("/vault/active"),
      created_at: 1,
      is_available: true,
    });
    vault_store.set_recent_vaults([]);

    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    await service.search_notes_all_vaults("ml");

    expect(search_port.search_notes).toHaveBeenCalledWith(
      as_vault_id("vault-active"),
      {
        raw: "ml",
        text: "ml",
        scope: "all",
        domain: "notes",
        target: "all",
      },
      8,
    );
  });
});

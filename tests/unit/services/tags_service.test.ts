import { describe, expect, it, vi } from "vitest";
import { TagsService } from "$lib/features/tags/application/tags_service";
import { TagsStore } from "$lib/features/tags/state/tags_store.svelte";
import type { TagsPort } from "$lib/features/tags/ports";
import type {
  TagCount,
  TaggedNote,
  TagNotePage,
} from "$lib/features/tags/types/tag";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function tagged(path: string): TaggedNote {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path.replace(".md", ""),
      mtime_ms: 0,
      size_bytes: 0,
    },
    snippet: null,
    match_detail: null,
  };
}

function page(paths: string[], total = paths.length): TagNotePage {
  return { notes: paths.map(tagged), total, truncated: total > paths.length };
}

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(port: Partial<TagsPort>) {
  const tags_port: TagsPort = {
    list_tags: vi.fn().mockResolvedValue([]),
    suggest_tags: vi.fn().mockResolvedValue([]),
    search_tagged_notes: vi.fn().mockResolvedValue(page([])),
    extract_note_tags: vi.fn().mockResolvedValue([]),
    ...port,
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const tags_store = new TagsStore();
  const service = new TagsService(tags_port, vault_store, tags_store);
  return { service, tags_store };
}

describe("TagsService", () => {
  it("drills into one tag with the newest notes first, bounded, and keeps the total", async () => {
    const search_tagged_notes = vi.fn().mockResolvedValue(page(["a.md"], 900));
    const { service, tags_store } = setup({ search_tagged_notes });

    await service.select_tag("work");

    expect(search_tagged_notes).toHaveBeenCalledWith(expect.anything(), {
      tags: ["work"],
      match: "all",
      text: "",
      limit: 500,
    });
    expect(tags_store.tagged_notes_total).toBe(900);
    expect(tags_store.tagged_notes_status).toBe("ready");
  });

  it("drops a slow select_tag response once a newer tag was selected", async () => {
    const slow = create_deferred<TagNotePage>();
    const fast = create_deferred<TagNotePage>();
    const { service, tags_store } = setup({
      search_tagged_notes: vi
        .fn()
        .mockReturnValueOnce(slow.promise)
        .mockReturnValueOnce(fast.promise),
    });

    const first = service.select_tag("old");
    const second = service.select_tag("new");
    fast.resolve(page(["new.md"]));
    await second;
    slow.resolve(page(["old.md"]));
    await first;

    expect(tags_store.selected_tag).toBe("new");
    expect(tags_store.tagged_notes.map((entry) => entry.note.path)).toEqual([
      "new.md",
    ]);
  });

  it("reports a failed tagged search without touching the store", async () => {
    const { service, tags_store } = setup({
      search_tagged_notes: vi.fn().mockRejectedValue(new Error("db locked")),
    });

    const result = await service.search_tagged_notes({
      tags: ["work"],
      match: "any",
      text: "plan",
      limit: 50,
    });

    expect(result).toEqual({ status: "failed", error: "db locked" });
    expect(tags_store.tagged_notes_status).toBe("idle");
  });

  it("gives no suggestions when the index fails", async () => {
    const { service } = setup({
      suggest_tags: vi.fn().mockRejectedValue(new Error("db locked")),
    });

    expect(await service.suggest_tags("wo", [], 20)).toEqual([]);
  });

  it("drops an in-flight tag list after clear, like on a vault switch", async () => {
    const pending = create_deferred<TagCount[]>();
    const { service, tags_store } = setup({
      list_tags: vi.fn().mockReturnValue(pending.promise),
    });

    const load = service.load_tags();
    service.clear();
    pending.resolve([{ tag: "stale", count: 1 }]);
    await load;

    expect(tags_store.tags).toEqual([]);
    expect(tags_store.tags_status).toBe("idle");
  });

  it("keeps the current list visible while it reloads", async () => {
    const reload = create_deferred<TagCount[]>();
    const { service, tags_store } = setup({
      list_tags: vi
        .fn()
        .mockResolvedValueOnce([{ tag: "work", count: 2 }])
        .mockReturnValueOnce(reload.promise),
    });

    await service.load_tags();
    const reloading = service.load_tags();

    expect(tags_store.tags_status).toBe("ready");
    expect(tags_store.tags).toEqual([{ tag: "work", count: 2 }]);

    reload.resolve([{ tag: "work", count: 3 }]);
    await reloading;
    expect(tags_store.tags).toEqual([{ tag: "work", count: 3 }]);
  });
});

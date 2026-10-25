import { describe, expect, it, vi } from "vitest";
import { VaultFindService } from "$lib/features/search/application/vault_find_service";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { VaultFindPort } from "$lib/features/search/ports";
import type {
  VaultFindEvent,
  VaultFindFile,
  VaultFindRequest,
} from "$lib/features/search/types/vault_find";
import { create_test_vault } from "../helpers/test_fixtures";

function request(text: string): VaultFindRequest {
  return {
    text,
    regex: false,
    case_sensitive: false,
    whole_word: false,
    include: "",
    exclude: "",
    tags: [],
    tag_match: "all",
  };
}

function file(path: string, match_count = 1): VaultFindFile {
  return {
    path,
    content_hash: `hash:${path}`,
    matches: Array.from({ length: match_count }, (_, index) => ({
      index,
      line: index + 1,
      column: 0,
      length: 3,
      before: "",
      text: "foo",
      after: "",
      groups: [],
    })),
  };
}

const done: VaultFindEvent = {
  type: "done",
  match_count: 3,
  truncated: false,
  elapsed_ms: 5,
};

function create_harness() {
  // Each start_find call keeps its event callback, so a test can play events
  // of an old run after a new one started.
  const emitters: ((event: VaultFindEvent) => void)[] = [];
  const port = {
    start_find: vi.fn<VaultFindPort["start_find"]>(
      (_vault_id, _request, on_event) => {
        emitters.push(on_event);
        return Promise.resolve({ status: "started" as const });
      },
    ),
    cancel_find: vi.fn<VaultFindPort["cancel_find"]>(() => Promise.resolve()),
    replace: vi.fn<VaultFindPort["replace"]>(),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const search_store = new SearchStore();
  const op_store = new OpStore();
  const suppress_file_write = vi.fn();
  const service = new VaultFindService(
    port,
    vault_store,
    search_store,
    op_store,
    () => 1,
    suppress_file_write,
  );
  return {
    service,
    port,
    emitters,
    results: search_store.vault_find,
    op_store,
    suppress_file_write,
  };
}

describe("VaultFindService", () => {
  it("merges streamed batches sorted by path and finishes with stats", async () => {
    const { service, emitters, results } = create_harness();
    await service.search(request("foo"));

    emitters[0]?.({
      type: "files",
      files: [file("b.md"), file("D/x.md")],
      group_names: [],
    });
    emitters[0]?.({
      type: "files",
      files: [file("a.md"), file("c.md")],
      group_names: [],
    });
    emitters[0]?.(done);

    expect(results.files.map((f) => f.path)).toEqual([
      "a.md",
      "b.md",
      "c.md",
      "D/x.md",
    ]);
    expect(results.status).toBe("done");
    expect(results.stats?.match_count).toBe(3);
    expect(results.was_stopped).toBe(false);
    expect(results.request?.text).toBe("foo");
  });

  it("drops events of a search that a newer one replaced", async () => {
    const { service, emitters, results } = create_harness();
    await service.search(request("old"));
    await service.search(request("new"));

    emitters[0]?.({ type: "files", files: [file("old.md")], group_names: [] });
    emitters[0]?.(done);
    emitters[1]?.({ type: "files", files: [file("new.md")], group_names: [] });

    expect(results.files.map((f) => f.path)).toEqual(["new.md"]);
    expect(results.status).toBe("searching");
  });

  it("drops events after a cancel and keeps what was found so far", async () => {
    const { service, port, emitters, results } = create_harness();
    await service.search(request("foo"));
    emitters[0]?.({ type: "files", files: [file("a.md")], group_names: [] });

    service.cancel();
    emitters[0]?.({ type: "files", files: [file("b.md")], group_names: [] });
    emitters[0]?.(done);

    expect(port.cancel_find).toHaveBeenCalled();
    expect(results.files.map((f) => f.path)).toEqual(["a.md"]);
    expect(results.status).toBe("done");
    expect(results.stats).toBeNull();
    expect(results.was_stopped).toBe(true);
    expect(results.can_replace_all).toBe(false);
  });

  it("shows an invalid query as an error state", async () => {
    const { service, port, results } = create_harness();
    port.start_find.mockResolvedValueOnce({
      status: "invalid",
      error: { kind: "invalid_query", message: "unclosed group" },
    });

    await service.search({ ...request("(foo"), regex: true });

    expect(results.status).toBe("error");
    expect(results.error).toEqual({
      kind: "invalid_query",
      message: "unclosed group",
    });
  });

  it("shows a failed search as a one-line error and keeps the engine message as details", async () => {
    const { service, port, results } = create_harness();
    port.start_find.mockRejectedValueOnce(new Error("search worker is gone"));

    await service.search(request("foo"));

    expect(results.status).toBe("error");
    expect(results.error?.kind).toBe("failed");
    expect(results.error?.details).toBe("search worker is gone");
  });

  it("replace leaves the results alone when a newer search started meanwhile", async () => {
    const { service, port, emitters, results } = create_harness();
    await service.search(request("foo"));
    emitters[0]?.({
      type: "files",
      files: [file("a.md")],
      group_names: [],
    });
    emitters[0]?.(done);
    let finish_replace: (value: never) => void = () => {};
    port.replace.mockReturnValue(
      new Promise((resolve) => {
        finish_replace = resolve as (value: never) => void;
      }),
    );

    const replacing = service.replace({
      text: "foo",
      regex: false,
      case_sensitive: false,
      whole_word: false,
      replacement: "bar",
      files: [{ path: "a.md", content_hash: "hash:a.md", match_indexes: [0] }],
    });
    await service.search(request("foo"));
    emitters[1]?.({
      type: "files",
      files: [file("a.md", 2)],
      group_names: [],
    });
    finish_replace({
      replaced: [{ path: "a.md", count: 1, remaining: null }],
      skipped: [],
    } as never);
    await replacing;

    expect(results.files.map((f) => f.matches.length)).toEqual([2]);
  });

  it("replace suppresses the watcher and swaps each file for what is left", async () => {
    const { service, port, emitters, results, op_store, suppress_file_write } =
      create_harness();
    await service.search(request("foo"));
    emitters[0]?.({
      type: "files",
      files: [file("a.md", 2), file("b.md")],
      group_names: [],
    });
    emitters[0]?.(done);
    const remaining = { ...file("a.md"), content_hash: "hash:after" };
    port.replace.mockResolvedValue({
      replaced: [
        { path: "a.md", count: 1, remaining },
        { path: "b.md", count: 1, remaining: null },
      ],
      skipped: [],
    });

    const result = await service.replace({
      text: "foo",
      regex: false,
      case_sensitive: false,
      whole_word: false,
      replacement: "bar",
      files: [
        { path: "a.md", content_hash: "hash:a.md", match_indexes: [1] },
        { path: "b.md", content_hash: "hash:b.md", match_indexes: [0] },
      ],
    });

    expect(result.status).toBe("replaced");
    expect(suppress_file_write).toHaveBeenCalledWith("a.md");
    expect(suppress_file_write).toHaveBeenCalledWith("b.md");
    expect(results.files).toEqual([remaining]);
    expect(op_store.get("vault_find.replace").status).toBe("success");
  });
});

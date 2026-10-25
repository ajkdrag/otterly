/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_vault_find_reactor } from "$lib/reactors/vault_find.reactor.svelte";
import { create_test_vault } from "../helpers/test_fixtures";

// Vitest resolves Svelte's public entry to the server build, but .svelte.ts
// stores use the client runtime. Use its dependency tracking for these effects.
vi.mock("svelte", async () => {
  const public_api = await vi.importActual<typeof import("svelte")>("svelte");
  const client = await vi.importActual<{
    untrack: (typeof import("svelte"))["untrack"];
  }>("svelte/internal/client");
  return { ...public_api, untrack: client.untrack };
});

const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

async function create_reactor() {
  const ui = new UIStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const service = { search: vi.fn(() => Promise.resolve()), clear: vi.fn() };
  cleanups.push(create_vault_find_reactor(ui, vault_store, service));
  await tick();
  return { ui, service };
}

async function open_omnibar(ui: UIStore, mode: "notes" | "find") {
  ui.omnibar = { ...ui.omnibar, open: true, mode };
  await tick();
}

async function type_pattern(ui: UIStore, query: string) {
  ui.vault_find.query = query;
  await tick();
}

describe("vault find reactor", () => {
  it("stays idle while the omnibar is closed or in Notes mode", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, "foo");
    await open_omnibar(ui, "notes");
    await type_pattern(ui, "bar");
    await vi.advanceTimersByTimeAsync(500);

    expect(service.search).not.toHaveBeenCalled();
    expect(service.clear).not.toHaveBeenCalled();
  });

  it("searches at once when Text mode opens with a pattern", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, "foo");

    await open_omnibar(ui, "find");

    expect(service.search).toHaveBeenCalledOnce();
    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "foo" }),
    );
  });

  it("searches once, with the last request, after typing stops", async () => {
    const { ui, service } = await create_reactor();
    await open_omnibar(ui, "find");

    for (const query of ["f", "fo", "foo"]) {
      await type_pattern(ui, query);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(service.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(service.search).toHaveBeenCalledOnce();
    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "foo" }),
    );
  });

  it("puts the omnibar's tag chips in the request", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, "foo");
    await open_omnibar(ui, "find");
    service.search.mockClear();

    ui.omnibar = { ...ui.omnibar, tags: ["a", "b"], tag_match: "any" };
    await tick();
    await vi.advanceTimersByTimeAsync(200);

    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "foo",
        tags: ["a", "b"],
        tag_match: "any",
      }),
    );
  });

  it("clears right away on an empty pattern and drops the pending search", async () => {
    const { ui, service } = await create_reactor();
    await open_omnibar(ui, "find");
    await type_pattern(ui, "foo");

    await type_pattern(ui, "");
    await vi.advanceTimersByTimeAsync(500);

    expect(service.clear).toHaveBeenCalled();
    expect(service.search).not.toHaveBeenCalled();
  });

  it("clears on close and does not run the search it was waiting on", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, "foo");
    await open_omnibar(ui, "find");
    await type_pattern(ui, "foobar");
    service.search.mockClear();

    ui.omnibar = { ...ui.omnibar, open: false, mode: "notes" };
    await tick();
    await vi.advanceTimersByTimeAsync(500);

    expect(service.clear).toHaveBeenCalledOnce();
    expect(service.search).not.toHaveBeenCalled();
  });

  it("does not search again when only the replacement or the selection changes", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, "foo");
    await open_omnibar(ui, "find");
    service.search.mockClear();

    ui.vault_find.replacement = "bar";
    ui.vault_find.selected_match = { request_key: "k", path: "a.md", index: 1 };
    ui.omnibar = { ...ui.omnibar, selected_index: 3 };
    await tick();
    await vi.advanceTimersByTimeAsync(500);

    expect(service.search).not.toHaveBeenCalled();
  });

  it("searches a whitespace-only pattern as typed", async () => {
    const { ui, service } = await create_reactor();
    await type_pattern(ui, " ");

    await open_omnibar(ui, "find");

    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: " " }),
    );
  });
});

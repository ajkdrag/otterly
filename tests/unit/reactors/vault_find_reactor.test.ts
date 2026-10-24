/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_vault_find_reactor } from "$lib/reactors/vault_find.reactor.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_vault_id } from "$lib/shared/types/ids";

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
  service.clear.mockClear();
  return { ui, vault_store, service };
}

describe("vault find reactor", () => {
  it("searches once, with the last request, after typing stops", async () => {
    const { ui, service } = await create_reactor();

    for (const query of ["f", "fo", "foo"]) {
      ui.vault_find.query = query;
      await tick();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(service.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(service.search).toHaveBeenCalledOnce();
    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "foo" }),
    );
  });

  it("clears right away on an empty query and drops the pending search", async () => {
    const { ui, service } = await create_reactor();
    ui.vault_find.query = "foo";
    await tick();

    ui.vault_find.query = "";
    await tick();
    await vi.advanceTimersByTimeAsync(500);

    expect(service.clear).toHaveBeenCalledOnce();
    expect(service.search).not.toHaveBeenCalled();
  });

  it("searches a whitespace-only query as typed", async () => {
    const { ui, service } = await create_reactor();

    ui.vault_find.query = " ";
    await tick();
    await vi.advanceTimersByTimeAsync(200);

    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: " " }),
    );
  });

  it("does not search again for an edit that leaves the request alone", async () => {
    const { ui, service } = await create_reactor();
    ui.vault_find.query = "foo";
    await tick();
    await vi.advanceTimersByTimeAsync(200);
    service.search.mockClear();

    // The replacement only counts while the replace row is open.
    ui.vault_find.replacement = "bar";
    ui.vault_find.focus_nonce += 1;
    await tick();
    await vi.advanceTimersByTimeAsync(500);

    expect(service.search).not.toHaveBeenCalled();
  });

  it("stops the old vault's walk at once when another vault opens, then searches the new one", async () => {
    const { ui, vault_store, service } = await create_reactor();
    ui.vault_find.query = "foo";
    await tick();
    await vi.advanceTimersByTimeAsync(200);
    service.search.mockClear();

    vault_store.set_vault(create_test_vault({ id: as_vault_id("other") }));
    await tick();

    expect(service.clear).toHaveBeenCalledOnce();
    expect(service.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(service.search).toHaveBeenCalledOnce();
  });
});

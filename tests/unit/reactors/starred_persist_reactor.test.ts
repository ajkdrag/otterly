/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { create_starred_persist_reactor } from "$lib/reactors/starred_persist.reactor.svelte";
import { NotesStore } from "$lib/features/note";
import { VaultStore } from "$lib/features/vault";
import type { VaultService } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

async function open_vault_with_starred(loaded_paths: string[]) {
  vi.useFakeTimers();
  const notes = new NotesStore();
  const vault = new VaultStore();
  const save_starred_paths = vi.fn().mockResolvedValue(undefined);
  cleanups.push(
    create_starred_persist_reactor(notes, vault, {
      save_starred_paths,
    } as unknown as VaultService),
  );
  await tick();

  const test_vault = create_test_vault();
  vault.set_vault(test_vault);
  notes.set_starred_paths(loaded_paths);
  await tick();
  return { notes, test_vault, save_starred_paths };
}

describe("starred persist reactor", () => {
  it("does not save the list it just loaded", async () => {
    const { save_starred_paths } = await open_vault_with_starred(["a.md"]);

    vi.advanceTimersByTime(1000);

    expect(save_starred_paths).not.toHaveBeenCalled();
  });

  it("saves a toggle as a change from the loaded list", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred(["a.md"]);

    notes.toggle_star_path("b.md");
    await tick();
    vi.advanceTimersByTime(400);

    expect(save_starred_paths).toHaveBeenCalledTimes(1);
    expect(save_starred_paths).toHaveBeenCalledWith(
      test_vault.id,
      ["a.md"],
      ["a.md", "b.md"],
    );
  });

  it("saves nothing when a star is toggled on and off again", async () => {
    const { notes, save_starred_paths } = await open_vault_with_starred([]);

    notes.toggle_star_path("a.md");
    await tick();
    notes.toggle_star_path("a.md");
    await tick();
    vi.advanceTimersByTime(1000);

    expect(save_starred_paths).not.toHaveBeenCalled();
  });

  it("compares the next change with the last saved list", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);

    notes.toggle_star_path("a.md");
    await tick();
    vi.advanceTimersByTime(400);
    notes.toggle_star_path("b.md");
    await tick();
    vi.advanceTimersByTime(400);

    expect(save_starred_paths).toHaveBeenLastCalledWith(
      test_vault.id,
      ["a.md"],
      ["a.md", "b.md"],
    );
  });

  it("saves a pending change when the reactor stops", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);

    notes.toggle_star_path("a.md");
    await tick();
    for (const cleanup of cleanups.splice(0)) cleanup();

    expect(save_starred_paths).toHaveBeenCalledWith(
      test_vault.id,
      [],
      ["a.md"],
    );
  });
});

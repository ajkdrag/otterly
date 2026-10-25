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

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function open_vault_with_starred(loaded_paths: string[]) {
  vi.useFakeTimers();
  const notes = new NotesStore();
  const vault = new VaultStore();
  const save_starred_paths = vi.fn().mockResolvedValue(true);
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

    await vi.advanceTimersByTimeAsync(1000);

    expect(save_starred_paths).not.toHaveBeenCalled();
  });

  it("saves a toggle as a change from the loaded list", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred(["a.md"]);

    notes.toggle_star_path("b.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);

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
    await vi.advanceTimersByTimeAsync(1000);

    expect(save_starred_paths).not.toHaveBeenCalled();
  });

  it("compares the next change with the last saved list", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);

    notes.toggle_star_path("a.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    notes.toggle_star_path("b.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);

    expect(save_starred_paths).toHaveBeenLastCalledWith(
      test_vault.id,
      ["a.md"],
      ["a.md", "b.md"],
    );
  });

  it("saves the change again with the next one after a failed save", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);
    save_starred_paths.mockResolvedValueOnce(false);

    notes.toggle_star_path("a.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    notes.toggle_star_path("b.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);

    expect(save_starred_paths).toHaveBeenLastCalledWith(
      test_vault.id,
      [],
      ["a.md", "b.md"],
    );
  });

  it("starts a save only after the one before it finished", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);
    const first_save = create_deferred<boolean>();
    save_starred_paths.mockReturnValueOnce(first_save.promise);

    notes.toggle_star_path("a.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    notes.toggle_star_path("b.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(save_starred_paths).toHaveBeenCalledTimes(1);

    first_save.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(save_starred_paths).toHaveBeenCalledTimes(2);
    expect(save_starred_paths).toHaveBeenLastCalledWith(
      test_vault.id,
      ["a.md"],
      ["a.md", "b.md"],
    );
  });

  it("saves an unstar that undoes a star whose save is still running", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);
    const first_save = create_deferred<boolean>();
    save_starred_paths.mockReturnValueOnce(first_save.promise);

    notes.toggle_star_path("a.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    notes.toggle_star_path("a.md");
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    first_save.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(save_starred_paths).toHaveBeenLastCalledWith(
      test_vault.id,
      ["a.md"],
      [],
    );
  });

  it("saves a pending change when the reactor stops", async () => {
    const { notes, test_vault, save_starred_paths } =
      await open_vault_with_starred([]);

    notes.toggle_star_path("a.md");
    await tick();
    for (const cleanup of cleanups.splice(0)) cleanup();
    await vi.advanceTimersByTimeAsync(0);

    expect(save_starred_paths).toHaveBeenCalledWith(
      test_vault.id,
      [],
      ["a.md"],
    );
  });
});

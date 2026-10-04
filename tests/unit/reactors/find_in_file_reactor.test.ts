/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { EditorService } from "$lib/features/editor";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { search_within_text } from "$lib/features/search/domain/search_within_text";
import { create_find_in_file_reactor } from "$lib/reactors/find_in_file.reactor.svelte";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";
import { as_markdown_text } from "$lib/shared/types/ids";

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
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
async function create_find() {
  const ui = new UIStore();
  const editor = new EditorStore();
  const search = new SearchStore();
  const update_find_state = vi.fn();
  const search_within_file = vi.fn(search_within_text);
  const note = create_open_note_state(
    create_test_note("first", "First"),
    "needle needle",
  );
  editor.set_open_note(note);
  ui.find_in_file = { open: true, query: "needle", selected_match_index: 0 };
  cleanups.push(
    create_find_in_file_reactor(
      ui,
      editor,
      search,
      { update_find_state } as unknown as EditorService,
      { search_within_file },
    ),
  );
  await tick();
  return { ui, editor, search, update_find_state, search_within_file, note };
}
describe("find in file reactor", () => {
  it("refreshes counts and highlights when switching buffers with an unchanged query", async () => {
    const { ui, editor, search, update_find_state } = await create_find();
    expect(search.in_file_matches).toHaveLength(2);
    ui.find_in_file = { ...ui.find_in_file, selected_match_index: 1 };
    await tick();
    editor.set_open_note(
      create_open_note_state(create_test_note("second", "Second"), "unrelated"),
    );
    await tick();
    expect(search.in_file_matches).toEqual([]);
    expect(ui.find_in_file.selected_match_index).toBe(0);
    expect(update_find_state).toHaveBeenLastCalledWith("needle", 0);
  });
  it("refreshes edits and clamps the selected result without rescanning on next match", async () => {
    const { ui, editor, search, search_within_file, note } =
      await create_find();
    search_within_file.mockClear();
    ui.find_in_file = { ...ui.find_in_file, selected_match_index: 1 };
    await tick();
    expect(search_within_file).not.toHaveBeenCalled();
    editor.set_markdown(note.meta.id, as_markdown_text("needle"));
    await tick();
    expect(search.in_file_matches).toHaveLength(1);
    expect(ui.find_in_file.selected_match_index).toBe(0);
  });
  it("restores results when reopening a retained query and clears them when closed", async () => {
    const { ui, search, update_find_state } = await create_find();
    ui.find_in_file.open = false;
    await tick();
    expect(search.in_file_matches).toEqual([]);
    expect(update_find_state).toHaveBeenLastCalledWith("", 0);
    ui.find_in_file.open = true;
    await tick();
    expect(search.in_file_matches).toHaveLength(2);
    expect(update_find_state).toHaveBeenLastCalledWith("needle", 0);
  });
});

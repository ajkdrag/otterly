import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { register_find_in_file_actions } from "$lib/features/search/application/find_in_file_actions";

function create_find_actions_harness() {
  const registry = new ActionRegistry();
  const stores = { ui: new UIStore(), search: new SearchStore() };
  const editor = {
    focus: vi.fn(),
    replace_find_match: vi.fn<(replacement: string) => number | null>(),
    replace_all_find_matches: vi.fn<(replacement: string) => number>(),
  };

  register_find_in_file_actions({
    registry,
    stores,
    services: { editor },
  });

  return { registry, stores, editor, focus: editor.focus };
}

describe("register_find_in_file_actions", () => {
  it("clears find state but keeps the options when closing", async () => {
    const { registry, stores, focus } = create_find_actions_harness();
    stores.ui.find_in_file = {
      open: true,
      query: "needle",
      selected_match_index: 2,
      replace_open: true,
      replacement: "thread",
      regex: true,
      case_sensitive: true,
      whole_word: false,
    };
    stores.search.set_in_file_matches([
      { line: 2, column: 3, length: 6, context: "needle" },
    ]);

    await registry.execute(ACTION_IDS.find_in_file_close);

    expect(stores.ui.find_in_file).toEqual({
      open: false,
      query: "",
      selected_match_index: 0,
      replace_open: false,
      replacement: "",
      regex: true,
      case_sensitive: true,
      whole_word: false,
    });
    expect(stores.search.in_file_matches).toEqual([]);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("clears matches and focuses the editor when toggling closed, preserving the query", async () => {
    const { registry, stores, focus } = create_find_actions_harness();
    stores.ui.find_in_file.open = true;
    stores.ui.find_in_file.query = "needle";
    stores.ui.find_in_file.selected_match_index = 2;
    stores.search.set_in_file_matches([
      { line: 2, column: 3, length: 6, context: "needle" },
    ]);

    await registry.execute(ACTION_IDS.find_in_file_toggle);

    expect(stores.ui.find_in_file).toMatchObject({
      open: false,
      query: "needle",
      selected_match_index: 2,
    });
    expect(stores.search.in_file_matches).toEqual([]);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not focus the editor when opening", async () => {
    const { registry, stores, focus } = create_find_actions_harness();

    await registry.execute(ACTION_IDS.find_in_file_open);

    expect(stores.ui.find_in_file.open).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it("opens the bar with the replace row, then toggles just the row", async () => {
    const { registry, stores } = create_find_actions_harness();

    await registry.execute(ACTION_IDS.find_in_file_toggle_replace);
    expect(stores.ui.find_in_file).toMatchObject({
      open: true,
      replace_open: true,
    });

    await registry.execute(ACTION_IDS.find_in_file_toggle_replace);
    expect(stores.ui.find_in_file).toMatchObject({
      open: true,
      replace_open: false,
    });
  });

  it("changes one option at a time and goes back to the first match", async () => {
    const { registry, stores } = create_find_actions_harness();
    stores.ui.find_in_file.selected_match_index = 3;
    stores.ui.find_in_file.case_sensitive = true;

    await registry.execute(ACTION_IDS.find_in_file_set_options, {
      regex: true,
    });

    expect(stores.ui.find_in_file).toMatchObject({
      regex: true,
      case_sensitive: true,
      whole_word: false,
      selected_match_index: 0,
    });
  });

  it("replaces the selected match and follows the editor to the next one", async () => {
    const { registry, stores, editor } = create_find_actions_harness();
    stores.ui.find_in_file.replacement = "thread";
    editor.replace_find_match.mockReturnValue(4);

    await registry.execute(ACTION_IDS.find_in_file_replace);

    expect(editor.replace_find_match).toHaveBeenCalledWith("thread");
    expect(stores.ui.find_in_file.selected_match_index).toBe(4);
  });

  it("keeps the selection when there was nothing to replace", async () => {
    const { registry, stores, editor } = create_find_actions_harness();
    stores.ui.find_in_file.selected_match_index = 2;
    editor.replace_find_match.mockReturnValue(null);
    editor.replace_all_find_matches.mockReturnValue(0);

    await registry.execute(ACTION_IDS.find_in_file_replace);
    await registry.execute(ACTION_IDS.find_in_file_replace_all);

    expect(stores.ui.find_in_file.selected_match_index).toBe(2);
  });

  it("replaces all matches and selects the first one again", async () => {
    const { registry, stores, editor } = create_find_actions_harness();
    stores.ui.find_in_file.replacement = "thread";
    stores.ui.find_in_file.selected_match_index = 5;
    editor.replace_all_find_matches.mockReturnValue(7);

    await registry.execute(ACTION_IDS.find_in_file_replace_all);

    expect(editor.replace_all_find_matches).toHaveBeenCalledWith("thread");
    expect(stores.ui.find_in_file.selected_match_index).toBe(0);
  });
});

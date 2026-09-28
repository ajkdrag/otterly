import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { register_find_in_file_actions } from "$lib/features/search/application/find_in_file_actions";

function create_find_actions_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
  };
  const focus = vi.fn();

  register_find_in_file_actions({
    registry,
    stores,
    services: {
      editor: { focus },
      search: { search_within_file: vi.fn().mockReturnValue([]) },
    } as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, focus };
}

describe("register_find_in_file_actions", () => {
  it("clears find state and focuses the editor when closing", async () => {
    const { registry, stores, focus } = create_find_actions_harness();
    stores.ui.find_in_file = {
      open: true,
      query: "needle",
      selected_match_index: 2,
    };
    stores.search.set_in_file_matches([
      { line: 2, column: 3, length: 6, context: "needle" },
    ]);

    await registry.execute(ACTION_IDS.find_in_file_close);

    expect(stores.ui.find_in_file).toEqual({
      open: false,
      query: "",
      selected_match_index: 0,
    });
    expect(stores.search.in_file_matches).toEqual([]);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("clears matches and focuses the editor when toggling closed, preserving the query", async () => {
    const { registry, stores, focus } = create_find_actions_harness();
    stores.ui.find_in_file = {
      open: true,
      query: "needle",
      selected_match_index: 2,
    };
    stores.search.set_in_file_matches([
      { line: 2, column: 3, length: 6, context: "needle" },
    ]);

    await registry.execute(ACTION_IDS.find_in_file_toggle);

    expect(stores.ui.find_in_file).toEqual({
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
});

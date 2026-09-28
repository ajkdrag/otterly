import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_settings_actions } from "$lib/features/settings";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";

function create_harness() {
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
  const save_editor_zoom = vi.fn().mockResolvedValue(undefined);

  register_settings_actions({
    registry,
    stores,
    services: { settings: { save_editor_zoom } } as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, save_editor_zoom };
}

describe("register_settings_actions: editor zoom", () => {
  it("zooms in and persists the new zoom", async () => {
    const { registry, stores, save_editor_zoom } = create_harness();

    await registry.execute(ACTION_IDS.editor_zoom_in);

    expect(stores.ui.editor_settings.editor_zoom).toBe(1.1);
    expect(save_editor_zoom).toHaveBeenCalledWith(1.1);
  });

  it("zooms out and persists the new zoom", async () => {
    const { registry, stores, save_editor_zoom } = create_harness();

    await registry.execute(ACTION_IDS.editor_zoom_out);

    expect(stores.ui.editor_settings.editor_zoom).toBe(0.9);
    expect(save_editor_zoom).toHaveBeenCalledWith(0.9);
  });

  it("resets zoom to 100%", async () => {
    const { registry, stores, save_editor_zoom } = create_harness();
    await registry.execute(ACTION_IDS.editor_zoom_in);
    await registry.execute(ACTION_IDS.editor_zoom_in);

    await registry.execute(ACTION_IDS.editor_zoom_reset);

    expect(stores.ui.editor_settings.editor_zoom).toBe(1);
    expect(save_editor_zoom).toHaveBeenLastCalledWith(1);
  });
});

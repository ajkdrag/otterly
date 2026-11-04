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
  const save_line_numbers_enabled = vi.fn().mockResolvedValue(undefined);

  register_settings_actions({
    registry,
    stores,
    services: {
      settings: {
        save_editor_zoom,
        save_line_numbers_enabled,
        reset_load_operation: () => {},
        reset_save_operation: () => {},
      },
      hotkey: { merge_config: (defaults: unknown) => defaults },
    } as never,
    default_mount_config: {
      reset_app_state: true,
    },
  });

  return { registry, stores, save_editor_zoom, save_line_numbers_enabled };
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

describe("register_settings_actions: line numbers", () => {
  it("turns line numbers on and off, saving each change", async () => {
    const { registry, stores, save_line_numbers_enabled } = create_harness();

    await registry.execute(ACTION_IDS.editor_toggle_line_numbers);
    expect(stores.ui.editor_settings.line_numbers_enabled).toBe(true);
    expect(save_line_numbers_enabled).toHaveBeenLastCalledWith(true);

    await registry.execute(ACTION_IDS.editor_toggle_line_numbers);
    expect(stores.ui.editor_settings.line_numbers_enabled).toBe(false);
    expect(save_line_numbers_enabled).toHaveBeenLastCalledWith(false);
  });
});

describe("register_settings_actions: saving right away with the Settings dialog open", () => {
  it.each([
    [ACTION_IDS.editor_toggle_line_numbers, { line_numbers_enabled: true }],
    [ACTION_IDS.editor_zoom_in, { editor_zoom: 1.1 }],
  ])("%s survives closing the dialog", async (action_id, expected) => {
    const { registry, stores } = create_harness();
    registry.register({
      id: ACTION_IDS.theme_revert,
      label: "Revert Theme",
      execute: () => {},
    });
    stores.ui.settings_dialog = {
      ...stores.ui.settings_dialog,
      open: true,
      current_settings: { ...stores.ui.editor_settings },
      persisted_settings: { ...stores.ui.editor_settings },
    };

    await registry.execute(action_id);
    await registry.execute(ACTION_IDS.settings_close);

    expect(stores.ui.editor_settings).toMatchObject(expected);
  });
});

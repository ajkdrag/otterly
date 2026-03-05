import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_vault_actions } from "$lib/features/vault/application/vault_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

function create_vault_actions_harness() {
  const registry = new ActionRegistry();
  const execute_open_dashboard = vi.fn();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    outline: new OutlineStore(),
  };

  const services = {
    vault: {
      choose_vault_path: vi.fn(),
      change_vault_by_path: vi.fn(),
      change_vault_by_id: vi.fn().mockResolvedValue({
        status: "failed",
        error: "switch blocked",
      }),
      select_pinned_vault_by_slot: vi.fn(),
      remove_vault_from_registry: vi.fn(),
      toggle_vault_pin: vi.fn(),
      rebuild_index: vi.fn(),
      sync_index: vi.fn().mockResolvedValue({ status: "success" }),
      reset_change_operation: vi.fn(),
      apply_opened_vault: vi.fn().mockResolvedValue(undefined),
    },
    note: {
      save_note: vi.fn().mockResolvedValue({
        status: "saved",
        saved_path: "docs/current.md",
      }),
      write_note_content: vi.fn().mockResolvedValue(undefined),
      create_new_note: vi.fn(),
    },
    folder: {},
    settings: {},
    search: {},
    editor: {},
    clipboard: {},
    shell: {},
    git: {
      get_git_info_for_path: vi.fn().mockResolvedValue(null),
    },
    tab: {
      load_tabs: vi.fn().mockResolvedValue(null),
      restore_tabs: vi.fn().mockResolvedValue(undefined),
      save_tabs: vi.fn().mockResolvedValue(undefined),
    },
  };

  register_vault_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  registry.register({
    id: ACTION_IDS.ui_open_vault_dashboard,
    label: "Open Vault Dashboard",
    execute: execute_open_dashboard,
  });

  registry.register({
    id: ACTION_IDS.folder_refresh_tree,
    label: "Refresh Folder Tree",
    execute: async () => {},
  });

  registry.register({
    id: ACTION_IDS.git_check_repo,
    label: "Check Git Repo",
    execute: async () => {},
  });

  return { registry, stores, services, execute_open_dashboard };
}

describe("register_vault_actions", () => {
  it("prompts before switching when current note has unsaved changes", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.editor.set_open_note(create_open_note_state(note));
    stores.editor.set_dirty(note.id, true);

    const target_vault_id = as_vault_id("vault-next");
    stores.ui.change_vault.open = true;
    await registry.execute(ACTION_IDS.vault_select, target_vault_id);

    expect(stores.ui.change_vault.confirm_discard_open).toBe(true);
    expect(stores.ui.change_vault.open).toBe(false);
    expect(services.vault.change_vault_by_id).not.toHaveBeenCalled();

    await registry.execute(ACTION_IDS.vault_confirm_discard_change);

    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      target_vault_id,
    );
  });

  it("cancels pending vault switch when discard confirm is dismissed", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.editor.set_open_note(create_open_note_state(note));
    stores.editor.set_dirty(note.id, true);

    stores.ui.change_vault.open = true;
    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));
    expect(stores.ui.change_vault.confirm_discard_open).toBe(true);

    await registry.execute(ACTION_IDS.vault_cancel_discard_change);
    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
    expect(stores.ui.change_vault.open).toBe(true);

    await registry.execute(ACTION_IDS.vault_confirm_discard_change);
    expect(services.vault.change_vault_by_id).not.toHaveBeenCalled();
  });

  it("saves before switching when save-and-switch is confirmed", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.editor.set_open_note(create_open_note_state(note));
    stores.editor.set_dirty(note.id, true);

    const target_vault_id = as_vault_id("vault-next");
    await registry.execute(ACTION_IDS.vault_select, target_vault_id);
    await registry.execute(ACTION_IDS.vault_confirm_save_change);

    expect(services.note.save_note).toHaveBeenCalledWith(null, true);
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      target_vault_id,
    );
    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
  });

  it("keeps confirm dialog open with error when save fails", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.editor.set_open_note(create_open_note_state(note));
    stores.editor.set_dirty(note.id, true);
    services.note.save_note = vi.fn().mockResolvedValue({
      status: "failed",
      error: "disk full",
    });

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));
    await registry.execute(ACTION_IDS.vault_confirm_save_change);

    expect(services.vault.change_vault_by_id).not.toHaveBeenCalled();
    expect(stores.ui.change_vault.confirm_discard_open).toBe(true);
    expect(stores.ui.change_vault.error).toBe("disk full");
    expect(stores.ui.change_vault.is_loading).toBe(false);
  });

  it("keeps confirm dialog open with error when background tab save fails", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const active_note = create_test_note("docs/active", "Active");
    const dirty_note = create_test_note("docs/dirty", "Dirty");

    stores.editor.set_open_note(create_open_note_state(active_note));
    stores.editor.set_dirty(active_note.id, true);
    stores.tab.open_tab(active_note.path, active_note.title);
    const dirty_tab = stores.tab.open_tab(dirty_note.path, dirty_note.title);
    stores.tab.set_cached_note(
      dirty_tab.id,
      create_open_note_state(dirty_note),
    );
    stores.tab.set_dirty(dirty_tab.id, true);
    stores.tab.activate_tab(active_note.path);
    services.note.write_note_content = vi
      .fn()
      .mockRejectedValue(new Error("disk full"));

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));
    await registry.execute(ACTION_IDS.vault_confirm_save_change);

    expect(services.vault.change_vault_by_id).not.toHaveBeenCalled();
    expect(stores.ui.change_vault.confirm_discard_open).toBe(true);
    expect(stores.ui.change_vault.error).toBe(
      "Could not save all open tabs before switching vault.",
    );
    expect(stores.ui.change_vault.is_loading).toBe(false);
  });

  it("marks selected vault unavailable when open fails with missing path", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const target_vault_id = as_vault_id("vault-missing");
    stores.vault.set_recent_vaults([
      {
        id: target_vault_id,
        name: "Missing Vault",
        path: as_vault_path("/vault/missing"),
        created_at: 1,
        is_available: true,
      },
    ]);

    services.vault.change_vault_by_id = vi.fn().mockResolvedValue({
      status: "failed",
      error:
        "A requested file or directory could not be found at the time an operation was processed.",
    });

    await registry.execute(ACTION_IDS.vault_select, target_vault_id);

    expect(stores.vault.recent_vaults[0]?.is_available).toBe(false);
  });

  it("opens vault dashboard after successful switch when enabled", async () => {
    const { registry, stores, services, execute_open_dashboard } =
      create_vault_actions_harness();

    services.vault.change_vault_by_id = vi.fn().mockResolvedValue({
      status: "opened",
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: true,
      },
      opened_from_vault_switch: true,
    });

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(execute_open_dashboard).toHaveBeenCalledTimes(1);
  });

  it("does not open vault dashboard after successful switch when disabled", async () => {
    const { registry, stores, services, execute_open_dashboard } =
      create_vault_actions_harness();

    services.vault.change_vault_by_id = vi.fn().mockResolvedValue({
      status: "opened",
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: false,
      },
      opened_from_vault_switch: true,
    });

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(execute_open_dashboard).not.toHaveBeenCalled();
  });

  describe("vault_sync_index", () => {
    it("calls sync_index on the vault service", async () => {
      const { registry, stores, services } = create_vault_actions_harness();
      stores.vault.set_vault({
        id: as_vault_id("v1"),
        name: "Test",
        path: as_vault_path("/test"),
        created_at: 1,
      });

      await registry.execute(ACTION_IDS.vault_sync_index);

      expect(services.vault.sync_index).toHaveBeenCalledTimes(1);
    });

    it("skips execution when no vault is open", async () => {
      const { registry, services } = create_vault_actions_harness();

      await registry.execute(ACTION_IDS.vault_sync_index);

      expect(services.vault.sync_index).not.toHaveBeenCalled();
    });

    it("is listed as available when a vault is open", () => {
      const { registry, stores } = create_vault_actions_harness();
      stores.vault.set_vault({
        id: as_vault_id("v1"),
        name: "Test",
        path: as_vault_path("/test"),
        created_at: 1,
      });

      const available = registry.get_available();
      const sync_action = available.find(
        (a) => a.id === ACTION_IDS.vault_sync_index,
      );
      expect(sync_action).toBeDefined();
    });

    it("is not listed as available when no vault is open", () => {
      const { registry } = create_vault_actions_harness();

      const available = registry.get_available();
      const sync_action = available.find(
        (a) => a.id === ACTION_IDS.vault_sync_index,
      );
      expect(sync_action).toBeUndefined();
    });

    it("reports failure from sync_index without throwing", async () => {
      const { registry, stores, services } = create_vault_actions_harness();
      stores.vault.set_vault({
        id: as_vault_id("v1"),
        name: "Test",
        path: as_vault_path("/test"),
        created_at: 1,
      });
      services.vault.sync_index = vi
        .fn()
        .mockResolvedValue({ status: "failed", error: "network error" });

      await registry.execute(ACTION_IDS.vault_sync_index);

      expect(services.vault.sync_index).toHaveBeenCalledTimes(1);
    });
  });

  describe("vault.open_switcher", () => {
    it("toggles vault_switcher_open state", () => {
      const { registry, stores } = create_vault_actions_harness();
      expect(stores.ui.vault_switcher_open).toBe(false);

      void registry.execute(ACTION_IDS.vault_open_switcher);

      expect(stores.ui.vault_switcher_open).toBe(true);

      void registry.execute(ACTION_IDS.vault_open_switcher);

      expect(stores.ui.vault_switcher_open).toBe(false);
    });
  });

  describe("vault.fetch_git_info_for_list", () => {
    it("fetches git info for each recent vault and caches it", async () => {
      const { registry, stores, services } = create_vault_actions_harness();
      const vault_a = {
        id: as_vault_id("a"),
        name: "A",
        path: as_vault_path("/a"),
        created_at: 1,
      };
      const vault_b = {
        id: as_vault_id("b"),
        name: "B",
        path: as_vault_path("/b"),
        created_at: 2,
      };
      stores.vault.set_recent_vaults([vault_a, vault_b]);

      services.git.get_git_info_for_path = vi
        .fn()
        .mockImplementation((path: string) => {
          if (path === "/a")
            return Promise.resolve({ branch: "main", is_dirty: false });
          return Promise.resolve(null);
        });

      await registry.execute(ACTION_IDS.vault_fetch_git_info_for_list);

      expect(stores.vault.get_vault_git_info(as_vault_id("a"))).toEqual({
        branch: "main",
        is_dirty: false,
      });
      expect(stores.vault.get_vault_git_info(as_vault_id("b"))).toBeUndefined();
    });

    it("skips vaults already in the cache", async () => {
      const { registry, stores, services } = create_vault_actions_harness();
      const vault_a = {
        id: as_vault_id("a"),
        name: "A",
        path: as_vault_path("/a"),
        created_at: 1,
      };
      stores.vault.set_recent_vaults([vault_a]);
      stores.vault.set_vault_git_info(as_vault_id("a"), {
        branch: "cached",
        is_dirty: false,
      });

      await registry.execute(ACTION_IDS.vault_fetch_git_info_for_list);

      expect(services.git.get_git_info_for_path).not.toHaveBeenCalled();
      expect(stores.vault.get_vault_git_info(as_vault_id("a"))?.branch).toBe(
        "cached",
      );
    });
  });
});

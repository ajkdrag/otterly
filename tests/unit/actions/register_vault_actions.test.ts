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
import { UserStore } from "$lib/features/user";
import {
  as_markdown_text,
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

function create_draft_open_note(
  path = "draft:1:Untitled-1",
  title = "Untitled-1",
) {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: title,
      title,
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text("draft"),
    buffer_id: `untitled:${title}`,
    is_dirty: true,
  };
}

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
    user: new UserStore(),
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
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "docs",
      }),
      write_note_content: vi.fn().mockResolvedValue(undefined),
      create_new_note: vi.fn(),
    },
    folder: {},
    settings: {},
    search: {},
    editor: {
      is_mounted: vi.fn().mockReturnValue(false),
      open_buffer: vi.fn(),
      set_scroll_top: vi.fn(),
      restore_view_state: vi.fn(),
      set_code_block_heights: vi.fn(),
      restore_cursor: vi.fn(),
    },
    clipboard: {},
    shell: {},
    session: {
      load_latest_session: vi.fn().mockResolvedValue(null),
      restore_latest_session: vi.fn().mockResolvedValue(undefined),
      save_latest_session: vi.fn().mockResolvedValue(undefined),
    },
    tab: {
      mark_conflict: vi.fn(),
      sync_dirty_state: vi.fn(),
      clear_conflict: vi.fn(),
      has_conflict: vi.fn().mockReturnValue(false),
      invalidate_cache: vi.fn(),
      remove_tab: vi.fn(),
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
    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.tab.set_dirty(note.path, true);

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
    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.tab.set_dirty(note.path, true);

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
    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.tab.set_dirty(note.path, true);

    const target_vault_id = as_vault_id("vault-next");
    await registry.execute(ACTION_IDS.vault_select, target_vault_id);
    await registry.execute(ACTION_IDS.vault_confirm_save_change);

    expect(services.note.save_note).toHaveBeenCalledWith(null, true);
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      target_vault_id,
    );
    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
  });

  it("persists the current session before switching vaults", async () => {
    const { registry, services } = create_vault_actions_harness();
    const target_vault_id = as_vault_id("vault-next");

    services.session.save_latest_session.mockImplementation(() => {
      expect(services.vault.change_vault_by_id).not.toHaveBeenCalled();
      return Promise.resolve();
    });

    await registry.execute(ACTION_IDS.vault_select, target_vault_id);

    expect(services.session.save_latest_session).toHaveBeenCalledTimes(1);
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      target_vault_id,
    );
  });

  it("does not prompt when only the editor buffer is marked dirty", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.editor.set_dirty(note.id, true);

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      as_vault_id("vault-next"),
    );
  });

  it("does not prompt when only a background draft tab is dirty", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    const draft_note = create_draft_open_note();

    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.tab.open_tab(draft_note.meta.path, draft_note.meta.title);
    stores.tab.set_dirty(draft_note.meta.path, true);
    stores.tab.set_cached_note(draft_note.meta.path, draft_note);
    stores.tab.activate_tab(note.path);

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(stores.ui.change_vault.confirm_discard_open).toBe(false);
    expect(stores.ui.change_vault.unsaved_note_label).toBeNull();
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      as_vault_id("vault-next"),
    );
  });

  it("labels the actual saved tab that blocks vault switch", async () => {
    const { registry, stores } = create_vault_actions_harness();
    const active_draft = create_draft_open_note();
    const dirty_note = create_test_note("docs/dirty", "Dirty Note");

    stores.tab.open_tab(active_draft.meta.path, active_draft.meta.title);
    stores.editor.set_open_note(active_draft);
    stores.tab.set_dirty(active_draft.meta.path, true);
    stores.tab.set_cached_note(active_draft.meta.path, active_draft);
    stores.tab.open_tab(dirty_note.path, dirty_note.title);
    stores.tab.set_dirty(dirty_note.path, true);
    stores.tab.set_cached_note(
      dirty_note.path,
      create_open_note_state(dirty_note),
    );
    stores.tab.activate_tab(active_draft.meta.path);

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(stores.ui.change_vault.confirm_discard_open).toBe(true);
    expect(stores.ui.change_vault.unsaved_note_label).toBe("Dirty Note");
  });

  it("keeps confirm dialog open with error when save fails", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const note = create_test_note("docs/current", "Current");
    stores.tab.open_tab(note.path, note.title);
    stores.editor.set_open_note(create_open_note_state(note));
    stores.tab.set_dirty(note.path, true);
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
    stores.tab.open_tab(active_note.path, active_note.title);
    stores.tab.set_dirty(active_note.path, true);
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

  it("saves background file-backed tabs without trying to save the active draft", async () => {
    const { registry, stores, services } = create_vault_actions_harness();
    const active_draft = create_draft_open_note();
    const dirty_note = create_test_note("docs/dirty", "Dirty");

    stores.tab.open_tab(active_draft.meta.path, active_draft.meta.title);
    stores.editor.set_open_note(active_draft);
    stores.tab.set_dirty(active_draft.meta.path, true);
    stores.tab.set_cached_note(active_draft.meta.path, active_draft);
    stores.tab.open_tab(dirty_note.path, dirty_note.title);
    stores.tab.set_dirty(dirty_note.path, true);
    stores.tab.set_cached_note(
      dirty_note.path,
      create_open_note_state(dirty_note),
    );
    stores.tab.activate_tab(active_draft.meta.path);

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));
    await registry.execute(ACTION_IDS.vault_confirm_save_change);

    expect(services.note.save_note).not.toHaveBeenCalled();
    expect(services.note.write_note_content).toHaveBeenCalledWith(
      dirty_note.path,
      as_markdown_text("content"),
    );
    expect(services.vault.change_vault_by_id).toHaveBeenCalledWith(
      as_vault_id("vault-next"),
    );
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

  it("hydrates the latest session after a successful vault open", async () => {
    const { registry, stores, services } = create_vault_actions_harness();

    services.vault.change_vault_by_id = vi.fn().mockResolvedValue({
      status: "opened",
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: false,
      },
      opened_from_vault_switch: true,
    });
    services.session.load_latest_session.mockResolvedValue({
      tabs: [
        {
          note_path: "docs/alpha.md",
          title: "alpha",
          is_pinned: false,
          is_dirty: false,
          scroll_top: 0,
          cursor: null,
          code_block_heights: [],
          cached_note: null,
        },
      ],
      active_tab_path: "docs/alpha.md",
    });
    services.session.restore_latest_session.mockImplementation(() => {
      stores.tab.open_tab("docs/alpha.md" as never, "alpha");
      return Promise.resolve(undefined);
    });

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(services.session.load_latest_session).toHaveBeenCalledTimes(1);
    expect(services.session.restore_latest_session).toHaveBeenCalledTimes(1);
    expect(services.note.create_new_note).not.toHaveBeenCalled();
  });

  it("falls back to a fresh untitled note when no session exists", async () => {
    const { registry, stores, services } = create_vault_actions_harness();

    services.vault.change_vault_by_id = vi.fn().mockResolvedValue({
      status: "opened",
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: false,
      },
      opened_from_vault_switch: true,
    });
    services.session.load_latest_session.mockResolvedValue(null);

    await registry.execute(ACTION_IDS.vault_select, as_vault_id("vault-next"));

    expect(services.note.create_new_note).toHaveBeenCalledTimes(1);
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
});

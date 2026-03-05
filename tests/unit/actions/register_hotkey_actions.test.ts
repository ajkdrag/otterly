import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_hotkey_actions } from "$lib/features/hotkey/application/hotkey_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import type { HotkeyBinding, HotkeyOverride } from "$lib/features/hotkey";

function merge_config_impl(
  defaults: HotkeyBinding[],
  overrides: HotkeyOverride[],
) {
  const override_map = new Map<string, HotkeyOverride>();
  for (const o of overrides) override_map.set(o.action_id, o);

  const bindings = defaults.map((b) => {
    const override = override_map.get(b.action_id);
    if (override) return { ...b, key: override.key };
    return b;
  });
  return { bindings };
}

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
    outline: new OutlineStore(),
  };

  const services = {
    hotkey: {
      load_hotkey_overrides: vi.fn().mockResolvedValue([]),
      save_hotkey_overrides: vi.fn().mockResolvedValue(undefined),
      merge_config: vi.fn(merge_config_impl),
      detect_conflict: vi.fn().mockReturnValue(null),
    },
  };

  const initial_config = merge_config_impl(DEFAULT_HOTKEYS, []);
  stores.ui.set_hotkeys_config(initial_config);

  stores.ui.settings_dialog = {
    ...stores.ui.settings_dialog,
    open: true,
    hotkey_draft_overrides: [],
    hotkey_draft_config: initial_config,
  };

  register_hotkey_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services };
}

describe("register_hotkey_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hotkey_open_editor", () => {
    it("opens recorder with action context", async () => {
      const { registry, stores } = create_harness();
      const payload = {
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        label: "Save Note",
      };

      await registry.execute(ACTION_IDS.hotkey_open_editor, payload);

      expect(stores.ui.hotkey_recorder.open).toBe(true);
      expect(stores.ui.hotkey_recorder.action_id).toBe("note.request_save");
      expect(stores.ui.hotkey_recorder.current_key).toBe("CmdOrCtrl+S");
      expect(stores.ui.hotkey_recorder.pending_key).toBe("CmdOrCtrl+S");
      expect(stores.ui.hotkey_recorder.conflict).toBeNull();
      expect(stores.ui.hotkey_recorder.error).toBeNull();
    });

    it("opens recorder for unbound shortcut", async () => {
      const { registry, stores } = create_harness();
      const payload = {
        action_id: "ui.toggle_sidebar",
        current_key: null,
        label: "Toggle Sidebar",
      };

      await registry.execute(ACTION_IDS.hotkey_open_editor, payload);

      expect(stores.ui.hotkey_recorder.open).toBe(true);
      expect(stores.ui.hotkey_recorder.action_id).toBe("ui.toggle_sidebar");
      expect(stores.ui.hotkey_recorder.current_key).toBeNull();
      expect(stores.ui.hotkey_recorder.pending_key).toBeNull();
    });
  });

  describe("hotkey_close_editor", () => {
    it("resets recorder state to closed", async () => {
      const { registry, stores } = create_harness();
      stores.ui.hotkey_recorder = {
        open: true,
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        pending_key: "CmdOrCtrl+Shift+S",
        conflict: null,
        error: null,
      };

      await registry.execute(ACTION_IDS.hotkey_close_editor);

      expect(stores.ui.hotkey_recorder.open).toBe(false);
      expect(stores.ui.hotkey_recorder.action_id).toBeNull();
      expect(stores.ui.hotkey_recorder.current_key).toBeNull();
      expect(stores.ui.hotkey_recorder.pending_key).toBeNull();
      expect(stores.ui.hotkey_recorder.conflict).toBeNull();
      expect(stores.ui.hotkey_recorder.error).toBeNull();
    });
  });

  describe("hotkey_set_binding", () => {
    it("sets new binding in draft overrides", async () => {
      const { registry, stores } = create_harness();

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+Shift+S",
        phase: "bubble",
      });

      expect(stores.ui.settings_dialog.hotkey_draft_overrides).toContainEqual({
        action_id: "note.request_save",
        key: "CmdOrCtrl+Shift+S",
      });
      expect(stores.ui.hotkey_recorder.open).toBe(false);
    });

    it("does not persist to storage directly", async () => {
      const { registry, services } = create_harness();

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+Shift+S",
        phase: "bubble",
      });

      expect(services.hotkey.save_hotkey_overrides).not.toHaveBeenCalled();
    });

    it("updates existing draft override", async () => {
      const { registry, stores } = create_harness();
      stores.ui.settings_dialog.hotkey_draft_overrides = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+Alt+S",
        phase: "bubble",
      });

      const overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
      expect(overrides).toHaveLength(1);
      expect(overrides[0]).toEqual({
        action_id: "note.request_save",
        key: "CmdOrCtrl+Alt+S",
      });
    });

    it("rejects invalid hotkey and sets error", async () => {
      const { registry, stores } = create_harness();
      stores.ui.hotkey_recorder = {
        open: true,
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        pending_key: null,
        conflict: null,
        error: null,
      };

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "B",
        phase: "bubble",
      });

      expect(stores.ui.hotkey_recorder.error).toBeTruthy();
      expect(stores.ui.hotkey_recorder.error).toContain("modifier");
      expect(stores.ui.hotkey_recorder.conflict).toBeNull();
      expect(stores.ui.hotkey_recorder.open).toBe(true);
    });

    it("rejects reserved system key", async () => {
      const { registry, stores } = create_harness();
      stores.ui.hotkey_recorder = {
        open: true,
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        pending_key: null,
        conflict: null,
        error: null,
      };

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+Q",
        phase: "capture",
      });

      expect(stores.ui.hotkey_recorder.error).toBe(
        "This hotkey is reserved by the system",
      );
      expect(stores.ui.hotkey_recorder.conflict).toBeNull();
      expect(stores.ui.hotkey_recorder.open).toBe(true);
    });

    it("sets conflict state when conflict detected", async () => {
      const { registry, stores, services } = create_harness();
      services.hotkey.detect_conflict.mockReturnValue({
        existing_action_id: "ui.toggle_sidebar",
        existing_label: "Toggle Sidebar",
      });

      stores.ui.hotkey_recorder = {
        open: true,
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        pending_key: null,
        conflict: null,
        error: null,
      };

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+B",
        phase: "capture",
      });

      expect(stores.ui.hotkey_recorder.conflict).toEqual({
        existing_action_id: "ui.toggle_sidebar",
        existing_label: "Toggle Sidebar",
      });
      expect(stores.ui.hotkey_recorder.pending_key).toBe("CmdOrCtrl+B");
      expect(stores.ui.hotkey_recorder.error).toBeNull();
      expect(stores.ui.hotkey_recorder.open).toBe(true);
    });

    it("applies binding with force=true and unbinds conflicting action", async () => {
      const { registry, stores, services } = create_harness();
      services.hotkey.detect_conflict.mockReturnValue({
        existing_action_id: "ui.toggle_sidebar",
        existing_label: "Toggle Sidebar",
      });

      stores.ui.hotkey_recorder = {
        open: true,
        action_id: "note.request_save",
        current_key: "CmdOrCtrl+S",
        pending_key: null,
        conflict: null,
        error: null,
      };

      await registry.execute(ACTION_IDS.hotkey_set_binding, {
        action_id: "note.request_save",
        key: "CmdOrCtrl+B",
        phase: "capture",
        force: true,
      });

      const overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
      expect(overrides).toContainEqual({
        action_id: "note.request_save",
        key: "CmdOrCtrl+B",
      });
      expect(overrides).toContainEqual({
        action_id: "ui.toggle_sidebar",
        key: null,
      });
      expect(stores.ui.hotkey_recorder.open).toBe(false);
    });
  });

  describe("hotkey_clear_binding", () => {
    it("clears binding by setting key to null in draft", async () => {
      const { registry, stores } = create_harness();

      await registry.execute(
        ACTION_IDS.hotkey_clear_binding,
        "ui.toggle_sidebar",
      );

      expect(stores.ui.settings_dialog.hotkey_draft_overrides).toContainEqual({
        action_id: "ui.toggle_sidebar",
        key: null,
      });
    });

    it("does not persist to storage directly", async () => {
      const { registry, services } = create_harness();

      await registry.execute(
        ACTION_IDS.hotkey_clear_binding,
        "ui.toggle_sidebar",
      );

      expect(services.hotkey.save_hotkey_overrides).not.toHaveBeenCalled();
    });

    it("updates draft config after clearing", async () => {
      const { registry, services } = create_harness();

      await registry.execute(
        ACTION_IDS.hotkey_clear_binding,
        "ui.toggle_sidebar",
      );

      expect(services.hotkey.merge_config).toHaveBeenCalled();
    });
  });

  describe("hotkey_reset_all", () => {
    it("clears all draft overrides", async () => {
      const { registry, stores } = create_harness();
      stores.ui.settings_dialog.hotkey_draft_overrides = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
        { action_id: "tab.close", key: "CmdOrCtrl+Shift+W" },
      ];

      await registry.execute(ACTION_IDS.hotkey_reset_all);

      expect(stores.ui.settings_dialog.hotkey_draft_overrides).toEqual([]);
    });

    it("rebuilds draft config with defaults only", async () => {
      const { registry, services } = create_harness();

      await registry.execute(ACTION_IDS.hotkey_reset_all);

      expect(services.hotkey.merge_config).toHaveBeenCalledWith(
        DEFAULT_HOTKEYS,
        [],
      );
    });
  });

  describe("hotkey_reset_single", () => {
    it("removes single override from draft by action_id", async () => {
      const { registry, stores } = create_harness();
      stores.ui.settings_dialog.hotkey_draft_overrides = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
        { action_id: "tab.close", key: "CmdOrCtrl+Shift+W" },
      ];

      await registry.execute(
        ACTION_IDS.hotkey_reset_single,
        "note.request_save",
      );

      const overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
      expect(overrides).toHaveLength(1);
      expect(overrides[0]).toEqual({
        action_id: "tab.close",
        key: "CmdOrCtrl+Shift+W",
      });
    });

    it("leaves overrides unchanged when action_id not found", async () => {
      const { registry, stores } = create_harness();
      stores.ui.settings_dialog.hotkey_draft_overrides = [
        { action_id: "tab.close", key: "CmdOrCtrl+Shift+W" },
      ];

      await registry.execute(
        ACTION_IDS.hotkey_reset_single,
        "note.request_save",
      );

      const overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
      expect(overrides).toHaveLength(1);
      expect(overrides[0]).toEqual({
        action_id: "tab.close",
        key: "CmdOrCtrl+Shift+W",
      });
    });

    it("updates draft config after reset", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.settings_dialog.hotkey_draft_overrides = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];

      await registry.execute(
        ACTION_IDS.hotkey_reset_single,
        "note.request_save",
      );

      expect(services.hotkey.merge_config).toHaveBeenCalled();
    });
  });
});

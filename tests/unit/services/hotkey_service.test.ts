import { describe, expect, it, vi, beforeEach } from "vitest";
import { HotkeyService } from "$lib/features/hotkey/application/hotkey_service";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import type { SettingsPort } from "$lib/features/settings/ports";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { HotkeyOverride, HotkeyBinding } from "$lib/features/hotkey";

function create_mock_settings_port(): SettingsPort {
  const store = new Map<string, unknown>();
  return {
    get_setting: vi.fn((key: string) =>
      Promise.resolve(store.get(key) ?? null),
    ),
    set_setting: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as SettingsPort;
}

function create_mock_op_store(): OpStore {
  return {} as OpStore;
}

describe("HotkeyService", () => {
  let service: HotkeyService;
  let settings_port: SettingsPort;

  beforeEach(() => {
    settings_port = create_mock_settings_port();
    service = new HotkeyService(settings_port, create_mock_op_store(), () =>
      Date.now(),
    );
  });

  describe("load_hotkey_overrides", () => {
    it("returns empty array when no overrides stored", async () => {
      const overrides = await service.load_hotkey_overrides();
      expect(overrides).toEqual([]);
    });

    it("returns stored overrides", async () => {
      const saved: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];
      await settings_port.set_setting("hotkey_overrides", saved);

      const overrides = await service.load_hotkey_overrides();
      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.action_id).toBe("note.request_save");
      expect(overrides[0]?.key).toBe("CmdOrCtrl+Shift+S");
    });

    it("filters out invalid override entries", async () => {
      await settings_port.set_setting("hotkey_overrides", [
        { action_id: "valid", key: "CmdOrCtrl+S" },
        { invalid: true },
        null,
        "string",
        { action_id: 123, key: "bad" },
      ]);

      const overrides = await service.load_hotkey_overrides();
      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.action_id).toBe("valid");
    });

    it("accepts null key (cleared binding)", async () => {
      await settings_port.set_setting("hotkey_overrides", [
        { action_id: "ui.toggle_sidebar", key: null },
      ]);

      const overrides = await service.load_hotkey_overrides();
      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.key).toBeNull();
    });

    it("returns empty array on port error", async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { get_setting } = settings_port;
      vi.mocked(get_setting).mockRejectedValueOnce(new Error("storage error"));
      const overrides = await service.load_hotkey_overrides();
      expect(overrides).toEqual([]);
    });
  });

  describe("save_hotkey_overrides", () => {
    it("persists overrides via settings port", async () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];
      await service.save_hotkey_overrides(overrides);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { set_setting } = settings_port;
      expect(vi.mocked(set_setting)).toHaveBeenCalledWith(
        "hotkey_overrides",
        overrides,
      );
    });

    it("does not throw on port error", async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { set_setting } = settings_port;
      vi.mocked(set_setting).mockRejectedValueOnce(new Error("write error"));
      await expect(service.save_hotkey_overrides([])).resolves.toBeUndefined();
    });
  });

  describe("merge_config", () => {
    it("returns defaults when no overrides", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      expect(config.bindings).toEqual(DEFAULT_HOTKEYS);
    });

    it("applies key override", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      const save_binding = config.bindings.find(
        (b) => b.action_id === "note.request_save",
      );
      expect(save_binding?.key).toBe("CmdOrCtrl+Shift+S");
    });

    it("keeps binding with null key when override key is null (cleared)", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "ui.toggle_sidebar", key: null },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      const sidebar = config.bindings.find(
        (b) => b.action_id === "ui.toggle_sidebar",
      );
      expect(sidebar).toBeDefined();
      expect(sidebar?.key).toBeNull();
    });

    it("preserves non-overridden bindings", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      const sidebar = config.bindings.find(
        (b) => b.action_id === "ui.toggle_sidebar",
      );
      expect(sidebar?.key).toBe("CmdOrCtrl+Shift+B");
    });

    it("ignores overrides for unknown action_ids (deprecated shortcuts)", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "legacy.removed_command", key: "CmdOrCtrl+L" },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      expect(config.bindings.length).toBe(DEFAULT_HOTKEYS.length);
    });

    it("handles multiple overrides", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
        { action_id: "tab.close", key: "CmdOrCtrl+Shift+W" },
        { action_id: "ui.toggle_sidebar", key: null },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      expect(
        config.bindings.find((b) => b.action_id === "note.request_save")?.key,
      ).toBe("CmdOrCtrl+Shift+S");
      expect(
        config.bindings.find((b) => b.action_id === "tab.close")?.key,
      ).toBe("CmdOrCtrl+Shift+W");
      expect(
        config.bindings.find((b) => b.action_id === "ui.toggle_sidebar")?.key,
      ).toBeNull();
    });

    it("new default shortcuts appear with defaults (app update scenario)", () => {
      const extended_defaults: HotkeyBinding[] = [
        ...DEFAULT_HOTKEYS,
        {
          action_id: "note.export_pdf",
          key: "CmdOrCtrl+Shift+E",
          phase: "capture",
          label: "Export as PDF",
          description: "Export the current note as PDF",
          category: "general",
        },
      ];

      const existing_overrides: HotkeyOverride[] = [
        { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
      ];

      const config = service.merge_config(
        extended_defaults,
        existing_overrides,
      );

      expect(
        config.bindings.find((b) => b.action_id === "note.export_pdf")?.key,
      ).toBe("CmdOrCtrl+Shift+E");

      expect(
        config.bindings.find((b) => b.action_id === "note.request_save")?.key,
      ).toBe("CmdOrCtrl+Shift+S");
    });
  });

  describe("override isolation", () => {
    it("override for one action_id does not affect other action_ids", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "omnibar.open", key: "CmdOrCtrl+Shift+O" },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      const open_notes = config.bindings.find(
        (b) => b.action_id === "omnibar.open",
      );
      const search_all = config.bindings.find(
        (b) => b.action_id === "omnibar.open_all_vaults",
      );

      expect(open_notes?.key).toBe("CmdOrCtrl+Shift+O");
      expect(search_all?.key).toBe("CmdOrCtrl+Alt+Shift+F");
    });

    it("each binding has a unique action_id in merged config", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      const ids = config.bindings.map((b) => b.action_id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("detect_conflict", () => {
    it("returns null when no conflict", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      const conflict = service.detect_conflict(
        "CmdOrCtrl+Shift+Y",
        "capture",
        "note.request_save",
        config,
      );
      expect(conflict).toBeNull();
    });

    it("detects conflict with existing binding", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      const conflict = service.detect_conflict(
        "CmdOrCtrl+Shift+B",
        "capture",
        "note.request_save",
        config,
      );
      expect(conflict).not.toBeNull();
      expect(conflict?.existing_action_id).toBe("ui.toggle_sidebar");
      expect(conflict?.existing_label).toBe("Toggle Sidebar");
    });

    it("excludes the current action from conflict check", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      const conflict = service.detect_conflict(
        "CmdOrCtrl+S",
        "bubble",
        "note.request_save",
        config,
      );
      expect(conflict).toBeNull();
    });

    it("only conflicts within same phase", () => {
      const config = service.merge_config(DEFAULT_HOTKEYS, []);
      const conflict = service.detect_conflict(
        "CmdOrCtrl+B",
        "bubble",
        "note.request_save",
        config,
      );
      expect(conflict).toBeNull();
    });

    it("detects conflict after override", () => {
      const overrides: HotkeyOverride[] = [
        { action_id: "tab.close", key: "CmdOrCtrl+S" },
      ];
      const config = service.merge_config(DEFAULT_HOTKEYS, overrides);

      const conflict = service.detect_conflict(
        "CmdOrCtrl+S",
        "capture",
        "note.request_save",
        config,
      );
      expect(conflict?.existing_action_id).toBe("tab.close");
    });
  });
});

describe("HotkeyService — global persistence", () => {
  it("shortcuts persist across vault switches (global, not per-vault)", async () => {
    const settings_port = create_mock_settings_port();
    const service = new HotkeyService(
      settings_port,
      create_mock_op_store(),
      () => Date.now(),
    );

    const overrides: HotkeyOverride[] = [
      { action_id: "note.request_save", key: "CmdOrCtrl+Shift+S" },
    ];
    await service.save_hotkey_overrides(overrides);

    const loaded = await service.load_hotkey_overrides();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe("CmdOrCtrl+Shift+S");

    const config_vault_a = service.merge_config(DEFAULT_HOTKEYS, loaded);
    const config_vault_b = service.merge_config(DEFAULT_HOTKEYS, loaded);

    const save_a = config_vault_a.bindings.find(
      (b) => b.action_id === "note.request_save",
    );
    const save_b = config_vault_b.bindings.find(
      (b) => b.action_id === "note.request_save",
    );
    expect(save_a?.key).toBe(save_b?.key);
  });
});

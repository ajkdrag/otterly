import { describe, expect, it, vi } from "vitest";
import { use_keyboard_shortcuts } from "$lib/hooks/use_keyboard_shortcuts.svelte";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { HotkeyConfig } from "$lib/features/hotkey";

function create_mock_registry() {
  const execute_fn = vi.fn();
  return {
    registry: { execute: execute_fn } as unknown as ActionRegistry,
    execute: execute_fn,
  };
}

const default_config: HotkeyConfig = {
  bindings: DEFAULT_HOTKEYS,
};

describe("use_keyboard_shortcuts", () => {
  it("executes action on registered hotkey", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "p",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).toHaveBeenCalled();
  });

  it("does not execute when disabled", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => false,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "p",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute when blocked", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => true,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "p",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).not.toHaveBeenCalled();
  });

  it("closes vault switcher on mod+w when open", () => {
    const { registry, execute } = create_mock_registry();
    const on_close_vault_switcher = vi.fn();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => true,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher,
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "w",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(on_close_vault_switcher).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("switches to tab on number slot when tabs exist", () => {
    const { registry } = create_mock_registry();
    const on_switch_to_tab = vi.fn();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => true,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab,
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "1",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(on_switch_to_tab).toHaveBeenCalledWith(0);
  });

  it("selects pinned vault on number slot when no tabs", () => {
    const { registry } = create_mock_registry();
    const on_select_pinned_vault = vi.fn();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault,
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "1",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(on_select_pinned_vault).toHaveBeenCalledWith(0);
  });

  it("handles bubble phase hotkeys", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown({
      metaKey: true,
      ctrlKey: false,
      key: "s",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).toHaveBeenCalled();
  });

  it("does not execute bubble phase when blocked", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => true,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown({
      metaKey: true,
      ctrlKey: false,
      key: "s",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).not.toHaveBeenCalled();
  });

  it("uses custom hotkey config when provided", () => {
    const { registry, execute } = create_mock_registry();
    const custom_config: HotkeyConfig = {
      bindings: [
        {
          action_id: "test.action",
          key: "CmdOrCtrl+Y",
          phase: "capture",
          label: "Test Action",
          description: "Test",
          category: "general",
        },
      ],
    };

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => custom_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "y",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).toHaveBeenCalledWith("test.action");
  });

  it("ignores number slots with modifiers other than cmdorctrl", () => {
    const { registry } = create_mock_registry();
    const on_switch_to_tab = vi.fn();
    const on_select_pinned_vault = vi.fn();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => true,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault,
      on_switch_to_tab,
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "1",
      altKey: true,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(on_switch_to_tab).not.toHaveBeenCalled();
    expect(on_select_pinned_vault).not.toHaveBeenCalled();
  });

  it("only selects pinned vault for slots 0-4", () => {
    const { registry } = create_mock_registry();
    const on_select_pinned_vault = vi.fn();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault,
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "6",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(on_select_pinned_vault).not.toHaveBeenCalled();
  });

  it("executes omnibar actions even when blocked if omnibar is open", () => {
    const { registry, execute } = create_mock_registry();

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => true,
      is_omnibar_topmost: () => true,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "p",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).toHaveBeenCalled();
  });

  it("fires customized shortcut (rebound from default)", () => {
    const { registry, execute } = create_mock_registry();
    const customized_config: HotkeyConfig = {
      bindings: DEFAULT_HOTKEYS.map((b) =>
        b.action_id === "note.request_save"
          ? { ...b, key: "CmdOrCtrl+Shift+S" }
          : b,
      ),
    };

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => customized_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown({
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: "s",
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).toHaveBeenCalledWith("note.request_save");
  });

  it("does not fire original shortcut after rebinding", () => {
    const { registry, execute } = create_mock_registry();
    const customized_config: HotkeyConfig = {
      bindings: DEFAULT_HOTKEYS.map((b) =>
        b.action_id === "note.request_save"
          ? { ...b, key: "CmdOrCtrl+Shift+S" }
          : b,
      ),
    };

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => customized_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown({
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      key: "s",
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).not.toHaveBeenCalled();
  });

  it("does not fire cleared shortcut", () => {
    const { registry, execute } = create_mock_registry();
    const cleared_config: HotkeyConfig = {
      bindings: DEFAULT_HOTKEYS.filter(
        (b) => b.action_id !== "ui.toggle_sidebar",
      ),
    };

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => cleared_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      key: "b",
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(execute).not.toHaveBeenCalled();
  });

  it("fires multiple customized shortcuts independently", () => {
    const { registry, execute } = create_mock_registry();
    const multi_custom_config: HotkeyConfig = {
      bindings: DEFAULT_HOTKEYS.map((b) => {
        if (b.action_id === "note.request_save") {
          return { ...b, key: "CmdOrCtrl+Shift+S" };
        }
        if (b.action_id === "tab.close") {
          return { ...b, key: "CmdOrCtrl+Shift+W" };
        }
        if (b.action_id === "ui.toggle_sidebar") {
          return { ...b, key: "CmdOrCtrl+Shift+B" };
        }
        return b;
      }),
    };

    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => multi_custom_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => false,
      action_registry: registry,
      on_close_vault_switcher: vi.fn(),
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab: vi.fn(),
    });

    shortcuts.handle_keydown({
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: "s",
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(execute).toHaveBeenCalledWith("note.request_save");

    execute.mockClear();
    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: "w",
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(execute).toHaveBeenCalledWith("tab.close");

    execute.mockClear();
    shortcuts.handle_keydown_capture({
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      key: "b",
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(execute).toHaveBeenCalledWith("ui.toggle_sidebar");
  });
});

describe("use_keyboard_shortcuts picker and dialog policy", () => {
  type Overrides = Partial<Parameters<typeof use_keyboard_shortcuts>[0]>;

  function build(overrides: Overrides = {}) {
    const { registry, execute } = create_mock_registry();
    const on_switch_to_tab = vi.fn();
    const on_close_vault_switcher = vi.fn();
    const shortcuts = use_keyboard_shortcuts({
      hotkeys_config: () => default_config,
      is_enabled: () => true,
      is_blocked: () => false,
      is_omnibar_topmost: () => false,
      is_vault_switcher_open: () => false,
      is_hotkey_recorder_open: () => false,
      has_tabs: () => true,
      action_registry: registry,
      on_close_vault_switcher,
      on_select_pinned_vault: vi.fn(),
      on_switch_to_tab,
      ...overrides,
    });
    return { shortcuts, execute, on_switch_to_tab, on_close_vault_switcher };
  }

  function press(key: string, overrides: Partial<KeyboardEvent> = {}) {
    const prevent_default = vi.fn();
    const stop_propagation = vi.fn();
    const event = {
      key,
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      preventDefault: prevent_default,
      stopPropagation: stop_propagation,
      ...overrides,
    } as unknown as KeyboardEvent;
    const was_touched = () =>
      prevent_default.mock.calls.length + stop_propagation.mock.calls.length >
      0;
    return { event, was_touched };
  }

  function binding(
    action_id: string,
    key: string,
    phase: "capture" | "bubble" = "capture",
  ): HotkeyConfig["bindings"][number] {
    return {
      action_id,
      key,
      phase,
      label: action_id,
      description: action_id,
      category: "general",
    };
  }

  const open_omnibar = {
    is_omnibar_topmost: () => true,
    is_blocked: () => true,
  };
  const open_vault_switcher = {
    is_vault_switcher_open: () => true,
    is_blocked: () => true,
  };

  it.each([
    ["omnibar", open_omnibar],
    ["vault switcher", open_vault_switcher],
  ])("leaves Cmd+J and Cmd+K to the %s", (_name, picker) => {
    const { shortcuts, execute } = build(picker);

    for (const key of ["j", "k"]) {
      const { event, was_touched } = press(key);
      shortcuts.handle_keydown_capture(event);
      shortcuts.handle_keydown(event);
      expect(was_touched()).toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("reserves Ctrl+J and Ctrl+K even when capture or bubble actions are rebound to them", () => {
    const rebound: HotkeyConfig = {
      bindings: [
        binding("a.capture", "CmdOrCtrl+J"),
        binding("a.bubble", "CmdOrCtrl+K", "bubble"),
      ],
    };
    const { shortcuts, execute } = build({
      hotkeys_config: () => rebound,
      is_omnibar_topmost: () => true,
    });

    const down = press("j", { metaKey: false, ctrlKey: true });
    shortcuts.handle_keydown_capture(down.event);
    const up = press("k", { metaKey: false, ctrlKey: true });
    shortcuts.handle_keydown(up.event);

    expect(execute).not.toHaveBeenCalled();
    expect(down.was_touched()).toBe(false);
    expect(up.was_touched()).toBe(false);
  });

  it("does not reserve Alt combos for the picker", () => {
    const { shortcuts, execute } = build({
      hotkeys_config: () => ({
        bindings: [binding("a.alt_j", "CmdOrCtrl+Alt+J")],
      }),
      is_omnibar_topmost: () => true,
    });

    shortcuts.handle_keydown_capture(press("j", { altKey: true }).event);

    expect(execute).toHaveBeenCalledWith("a.alt_j");
  });

  it("still switches tabs with Cmd+J and Cmd+K outside pickers", () => {
    const { shortcuts, execute } = build();

    shortcuts.handle_keydown_capture(press("j").event);
    shortcuts.handle_keydown_capture(press("k").event);

    expect(execute).toHaveBeenNthCalledWith(1, "tab.next");
    expect(execute).toHaveBeenNthCalledWith(2, "tab.prev");
  });

  it("does not run tab actions behind the omnibar", () => {
    const { shortcuts, execute, on_switch_to_tab } = build(open_omnibar);

    shortcuts.handle_keydown_capture(press("w").event);
    shortcuts.handle_keydown_capture(press("1").event);

    expect(execute).not.toHaveBeenCalled();
    expect(on_switch_to_tab).not.toHaveBeenCalled();
  });

  it.each(["p", "o"])(
    "runs palette key %s while the omnibar is open",
    (key) => {
      const { shortcuts, execute } = build(open_omnibar);

      shortcuts.handle_keydown_capture(press(key).event);

      expect(execute).toHaveBeenCalledTimes(1);
    },
  );

  it("runs the all-vaults scope shortcut while the omnibar is open", () => {
    const { shortcuts, execute } = build(open_omnibar);

    shortcuts.handle_keydown_capture(press("f", { shiftKey: true }).event);

    expect(execute).toHaveBeenCalledWith("omnibar.open_all_vaults");
  });

  it("does not run palette keys when another dialog is in front of the omnibar", () => {
    const { shortcuts, execute } = build({
      is_blocked: () => true,
      is_omnibar_topmost: () => false,
    });

    shortcuts.handle_keydown_capture(press("p").event);

    expect(execute).not.toHaveBeenCalled();
  });

  it("does not switch tabs behind any open dialog", () => {
    const { shortcuts, execute, on_switch_to_tab } = build({
      is_blocked: () => true,
    });

    for (const key of ["j", "k", "`", "2"]) {
      shortcuts.handle_keydown_capture(press(key).event);
    }

    expect(execute).not.toHaveBeenCalled();
    expect(on_switch_to_tab).not.toHaveBeenCalled();
  });

  it("does not touch keys while the hotkey recorder is open", () => {
    const { shortcuts, execute, on_close_vault_switcher } = build({
      is_hotkey_recorder_open: () => true,
      is_vault_switcher_open: () => true,
      is_blocked: () => true,
    });

    for (const key of ["p", "w", "j", "1"]) {
      const { event, was_touched } = press(key);
      shortcuts.handle_keydown_capture(event);
      shortcuts.handle_keydown(event);
      expect(was_touched()).toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
    expect(on_close_vault_switcher).not.toHaveBeenCalled();
  });

  it("ignores keys during IME composition", () => {
    const { shortcuts, execute, on_switch_to_tab } = build(open_omnibar);

    for (const key of ["j", "p", "1"]) {
      shortcuts.handle_keydown_capture(press(key, { isComposing: true }).event);
    }

    expect(execute).not.toHaveBeenCalled();
    expect(on_switch_to_tab).not.toHaveBeenCalled();
  });
});

import type { HotkeyConfig } from "$lib/features/hotkey";
import type { ActionRegistry } from "$lib/app";
import { normalize_event_to_key } from "$lib/features/hotkey";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { picker_shortcut_step } from "$lib/shared/utils/picker_navigation";

export type KeyboardShortcuts = {
  handle_keydown_capture: (event: KeyboardEvent) => void;
  handle_keydown: (event: KeyboardEvent) => void;
};

// The only actions that still run while the omnibar blocks everything else.
const PALETTE_ACTIONS_WHILE_OMNIBAR_OPEN = new Set<string>([
  ACTION_IDS.omnibar_toggle,
  ACTION_IDS.omnibar_open,
  ACTION_IDS.omnibar_open_all_vaults,
]);

export function use_keyboard_shortcuts(input: {
  hotkeys_config: () => HotkeyConfig;
  is_enabled: () => boolean;
  is_blocked: () => boolean;
  // True only while the omnibar is the foreground dialog.
  is_omnibar_topmost: () => boolean;
  is_vault_switcher_open: () => boolean;
  is_hotkey_recorder_open: () => boolean;
  is_vim_enabled: () => boolean;
  has_tabs: () => boolean;
  action_registry: ActionRegistry;
  on_close_vault_switcher: () => void;
  on_select_pinned_vault: (slot: number) => void;
  on_switch_to_tab: (index: number) => void;
}): KeyboardShortcuts {
  const {
    hotkeys_config,
    is_enabled,
    is_blocked,
    is_omnibar_topmost,
    is_vault_switcher_open,
    is_hotkey_recorder_open,
    is_vim_enabled,
    has_tabs,
    action_registry,
    on_close_vault_switcher,
    on_select_pinned_vault,
    on_switch_to_tab,
  } = input;

  const build_key_maps = () => {
    const config = hotkeys_config();
    const capture_map = new Map<string, string>();
    const bubble_map = new Map<string, string>();

    for (const binding of config.bindings) {
      if (binding.key === null) continue;
      const target_map = binding.phase === "capture" ? capture_map : bubble_map;
      target_map.set(binding.key, binding.action_id);
    }

    return { capture_map, bubble_map };
  };

  const is_mod_combo = (event: KeyboardEvent, key: string): boolean => {
    if (!(event.metaKey || event.ctrlKey)) return false;
    return event.key.toLowerCase() === key;
  };

  const tab_number_slot = (event: KeyboardEvent): number | null => {
    if (!(event.metaKey || event.ctrlKey)) return null;
    if (event.altKey || event.shiftKey) return null;
    if (event.key < "1" || event.key > "9") return null;
    return Number(event.key) - 1;
  };

  // On macOS the app's hotkeys are Cmd keys, but normalize_event_to_key also
  // reads Ctrl as CmdOrCtrl. Ctrl+F, Ctrl+O, Ctrl+W and the like are Vim keys
  // inside the Vim editor, so Ctrl goes to Vim there. On Windows and Linux
  // CmdOrCtrl is Ctrl, so the app hotkey wins.
  const is_ctrl_key_for_vim = (event: KeyboardEvent): boolean => {
    if (!event.ctrlKey || event.metaKey) return false;
    if (typeof navigator === "undefined" || !navigator.platform.includes("Mac"))
      return false;
    return is_inside_vim_editor(event);
  };

  const is_inside_vim_editor = (event: KeyboardEvent): boolean =>
    (event.target as Element | null)?.closest?.(".md-vim") != null;

  // Ctrl-[ is Esc in Vim. Outside the editor (the omnibar, a dialog, the find
  // bar) nothing handles it, so we turn it into the Escape those widgets
  // already listen for. bits-ui and the find bar only check event.key. Inside
  // the Vim editor, Vim takes Ctrl-[ itself.
  const is_vim_escape_outside_editor = (event: KeyboardEvent): boolean =>
    is_vim_enabled() &&
    event.key === "[" &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    !is_inside_vim_editor(event);

  // The recorder reads raw keys itself, IME composition owns its keys, and
  // the Vim editor owns Ctrl keys on macOS.
  const is_left_to_focused_widget = (event: KeyboardEvent): boolean =>
    is_hotkey_recorder_open() ||
    event.isComposing ||
    is_ctrl_key_for_vim(event);

  // Ctrl/Cmd+J/K belong to the picker's own handler, whatever they are bound to.
  const is_picker_navigation = (event: KeyboardEvent): boolean =>
    (is_omnibar_topmost() || is_vault_switcher_open()) &&
    picker_shortcut_step(event) !== null;

  const is_palette_action_in_omnibar = (action_id: string): boolean =>
    is_omnibar_topmost() && PALETTE_ACTIONS_WHILE_OMNIBAR_OPEN.has(action_id);

  const handle_keydown_capture = (event: KeyboardEvent) => {
    if (is_left_to_focused_widget(event)) return;

    if (is_vim_escape_outside_editor(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.target?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      return;
    }

    if (is_mod_combo(event, "w") && is_vault_switcher_open()) {
      event.preventDefault();
      event.stopPropagation();
      on_close_vault_switcher();
      return;
    }

    if (is_picker_navigation(event)) return;

    const slot = tab_number_slot(event);
    if (slot !== null) {
      if (!is_enabled()) return;
      event.preventDefault();
      event.stopPropagation();
      if (is_blocked()) return;
      if (has_tabs()) {
        on_switch_to_tab(slot);
      } else if (slot < 5) {
        on_select_pinned_vault(slot);
      }
      return;
    }

    if (!is_enabled()) return;

    const { capture_map } = build_key_maps();
    const key = normalize_event_to_key(event);
    const action_id = capture_map.get(key);

    if (action_id) {
      event.preventDefault();
      event.stopPropagation();

      if (is_blocked() && !is_palette_action_in_omnibar(action_id)) return;

      void action_registry.execute(action_id);
    }
  };

  const handle_keydown = (event: KeyboardEvent) => {
    if (is_left_to_focused_widget(event)) return;
    if (is_picker_navigation(event)) return;
    if (!is_enabled()) return;

    const { bubble_map } = build_key_maps();
    const key = normalize_event_to_key(event);
    const action_id = bubble_map.get(key);

    if (action_id) {
      event.preventDefault();
      event.stopPropagation();

      if (is_blocked()) return;

      void action_registry.execute(action_id);
    }
  };

  return {
    handle_keydown_capture,
    handle_keydown,
  };
}

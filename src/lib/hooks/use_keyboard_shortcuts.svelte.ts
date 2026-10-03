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

  // The recorder reads raw keys itself, and IME composition owns its keys.
  const is_left_to_focused_widget = (event: KeyboardEvent): boolean =>
    is_hotkey_recorder_open() || event.isComposing;

  // Ctrl/Cmd+J/K belong to the picker's own handler, whatever they are bound to.
  const is_picker_navigation = (event: KeyboardEvent): boolean =>
    (is_omnibar_topmost() || is_vault_switcher_open()) &&
    picker_shortcut_step(event) !== null;

  const is_palette_action_in_omnibar = (action_id: string): boolean =>
    is_omnibar_topmost() && PALETTE_ACTIONS_WHILE_OMNIBAR_OPEN.has(action_id);

  const handle_keydown_capture = (event: KeyboardEvent) => {
    if (is_left_to_focused_widget(event)) return;

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

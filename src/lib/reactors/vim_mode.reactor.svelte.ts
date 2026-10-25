import { untrack } from "svelte";
import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry, UIStore } from "$lib/app";

// EditorService in the main window, DocumentService in a document window.
type VimModeTarget = { set_vim_enabled: (enabled: boolean) => void };

// VimService.
type VimServiceTarget = {
  set_press_and_hold: (enabled: boolean) => Promise<void>;
  sync_clipboard: () => Promise<void>;
};

// Calls the callback each time the window gains focus, and returns the
// function that stops it.
type SubscribeToWindowFocus = (on_focus: () => void) => () => void;

// Pushes the Vim mode setting into the editor. While it is on, loads the
// vimrc now and again each time the window gains focus. That is how an edit
// saved in the vimrc's own window reaches this one. A focus also pulls text
// copied in another app into the register that set clipboard=unnamed puts.
//
// Also turns the macOS accent menu for held keys off while Vim mode and
// "Repeat held keys" are both on, so holding l keeps moving right.
export function create_vim_mode_reactor(
  ui_store: UIStore,
  target: VimModeTarget,
  vim_service: VimServiceTarget,
  action_registry: ActionRegistry,
  subscribe_to_window_focus: SubscribeToWindowFocus,
): () => void {
  const load_vimrc = () => {
    void action_registry.execute(ACTION_IDS.vim_load_vimrc, { force: false });
  };
  return $effect.root(() => {
    // Saving settings replaces the whole object. Only these flags matter
    // here, so a zoom change does not reload the vimrc.
    const enabled = $derived(ui_store.editor_settings.vim_mode_enabled);
    const repeat_held_keys = $derived(
      ui_store.editor_settings.vim_repeat_held_keys,
    );
    $effect(() => {
      const vim_enabled = enabled;
      // The editor and the action read stores of their own. Those reads must
      // not re-run this effect.
      untrack(() => {
        target.set_vim_enabled(vim_enabled);
        if (vim_enabled) load_vimrc();
      });
      if (!vim_enabled) return;
      return subscribe_to_window_focus(() => {
        load_vimrc();
        void vim_service.sync_clipboard();
      });
    });
    $effect(() => {
      const accent_menu = !(enabled && repeat_held_keys);
      untrack(() => {
        void vim_service.set_press_and_hold(accent_menu);
      });
    });
  });
}

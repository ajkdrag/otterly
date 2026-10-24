import { untrack } from "svelte";
import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry, UIStore } from "$lib/app";

// EditorService in the main window, DocumentService in a document window.
type VimModeTarget = { set_vim_enabled: (enabled: boolean) => void };

// Pushes the Vim mode setting into the editor. While it is on, loads the
// vimrc now and again each time the window gains focus. That is how an edit
// saved in the vimrc's own window reaches this one.
export function create_vim_mode_reactor(
  ui_store: UIStore,
  target: VimModeTarget,
  action_registry: ActionRegistry,
): () => void {
  const load_vimrc = () => {
    void action_registry.execute(ACTION_IDS.vim_load_vimrc, { force: false });
  };
  return $effect.root(() => {
    // Saving settings replaces the whole object. Only this flag matters here,
    // so a zoom change does not reload the vimrc.
    const enabled = $derived(ui_store.editor_settings.vim_mode_enabled);
    $effect(() => {
      const vim_enabled = enabled;
      // The editor and the action read stores of their own. Those reads must
      // not re-run this effect.
      untrack(() => {
        target.set_vim_enabled(vim_enabled);
        if (vim_enabled) load_vimrc();
      });
      if (!vim_enabled) return;
      window.addEventListener("focus", load_vimrc);
      return () => {
        window.removeEventListener("focus", load_vimrc);
      };
    });
  });
}

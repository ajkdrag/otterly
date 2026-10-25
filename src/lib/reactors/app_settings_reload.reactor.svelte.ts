import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry } from "$lib/app";

// Calls the callback each time the window gains focus, and returns the
// function that stops it.
type SubscribeToWindowFocus = (on_focus: () => void) => () => void;

// Every window keeps its own copy of the app-wide settings. Reading them again
// on focus is how a theme or hotkey change made in another window gets here.
export function create_app_settings_reload_reactor(
  action_registry: ActionRegistry,
  subscribe_to_window_focus: SubscribeToWindowFocus,
): () => void {
  return subscribe_to_window_focus(() => {
    void action_registry.execute(ACTION_IDS.app_reload_app_settings);
  });
}

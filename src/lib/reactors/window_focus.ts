import { getCurrentWindow } from "@tauri-apps/api/window";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("window_focus");

// Calls on_focus each time this window gains focus, and returns the function
// that stops it. This is Tauri's focus event. I did not verify that the DOM
// "focus" event fires when you come back from another window of the app, so
// we do not rely on it.
export function subscribe_to_window_focus(on_focus: () => void): () => void {
  let stop_listening: (() => void) | null = null;
  let unsubscribed = false;
  void getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (focused) on_focus();
    })
    .then((unlisten) => {
      // Tauri registers the listener asynchronously, so we may be unsubscribed
      // before it exists.
      if (unsubscribed) unlisten();
      else stop_listening = unlisten;
    })
    .catch((error: unknown) => {
      // Without the listener the vimrc never reloads on focus. Say so.
      log.error("Could not watch window focus", { error });
    });
  return () => {
    unsubscribed = true;
    stop_listening?.();
  };
}

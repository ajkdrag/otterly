import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry, UIStore } from "$lib/app";
import type { TabStore } from "$lib/features/tab";
import { detect_platform } from "$lib/shared/utils/detect_platform";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function should_intercept_close_request(input: {
  tab_count: number;
  is_quitting: boolean;
}): boolean {
  return input.tab_count > 0 && !input.is_quitting;
}

export function create_app_close_request_reactor(
  tab_store: TabStore,
  ui_store: UIStore,
  action_registry: ActionRegistry,
): () => void {
  if (!detect_platform().is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;

  void getCurrentWindow()
    .onCloseRequested((event) => {
      if (
        !should_intercept_close_request({
          tab_count: tab_store.tabs.length,
          is_quitting: ui_store.quit_confirm.is_quitting,
        })
      ) {
        return;
      }

      event.preventDefault();
      void action_registry.execute(ACTION_IDS.app_request_quit);
    })
    .then((next_unlisten) => {
      unlisten = next_unlisten;
    });

  return () => {
    unlisten?.();
  };
}

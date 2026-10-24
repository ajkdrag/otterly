import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry } from "$lib/app";
import type { ProfileService } from "$lib/features/profile";
import { detect_platform } from "$lib/shared/utils/detect_platform";

// The Dock's "New Profile…" tells a running main window to show the profiles
// dialog. A window that did not exist yet picks the request up in app.mounted.
export function create_profile_dialog_request_reactor(
  profile_service: ProfileService,
  action_registry: ActionRegistry,
): () => void {
  if (!detect_platform().is_tauri) {
    return () => {};
  }

  return profile_service.subscribe_dialog_requests(() => {
    void action_registry.execute(ACTION_IDS.profile_check_dialog_request);
  });
}

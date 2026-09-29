import { ACTION_IDS } from "$lib/app";
import type { ActionRegistry } from "$lib/app";
import { detect_platform } from "$lib/shared/utils/detect_platform";

// Wait a bit after launch so the check does not compete with startup work.
const FIRST_CHECK_DELAY_MS = 10_000;
// People leave the app open for days, so we check again every few hours.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function create_update_check_reactor(
  action_registry: ActionRegistry,
): () => void {
  // Dev builds are not installed bundles, so there is nothing to update.
  if (!detect_platform().is_tauri || import.meta.env.DEV) {
    return () => {};
  }

  const check_for_updates = () =>
    void action_registry.execute(
      ACTION_IDS.app_check_for_updates_in_background,
    );
  const first_check = setTimeout(check_for_updates, FIRST_CHECK_DELAY_MS);
  const later_checks = setInterval(check_for_updates, CHECK_INTERVAL_MS);

  return () => {
    clearTimeout(first_check);
    clearInterval(later_checks);
  };
}

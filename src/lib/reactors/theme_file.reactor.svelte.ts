import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { ThemeService } from "$lib/features/theme";

// Reloads the theme file after each save. The Rust watcher debounces, so a
// burst of saves from an editor or an agent arrives as one event.
// load_themes() reads the file at startup, so there is no initial reload here.
export function create_theme_file_reactor(
  theme_service: ThemeService,
  action_registry: ActionRegistry,
): () => void {
  return $effect.root(() => {
    return theme_service.watch_theme_file(() => {
      void action_registry.execute(ACTION_IDS.theme_reload_file);
    });
  });
}

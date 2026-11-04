import type { UIStore } from "$lib/app";
import { apply_editor_line_numbers } from "$lib/shared/utils/apply_editor_line_numbers";

export function create_editor_line_numbers_reactor(
  ui_store: UIStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_editor_line_numbers(ui_store.editor_settings.line_numbers_enabled);
    });
  });
}

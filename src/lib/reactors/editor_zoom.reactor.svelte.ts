import type { UIStore } from "$lib/app";
import { apply_editor_zoom } from "$lib/shared/utils/apply_editor_zoom";

export function create_editor_zoom_reactor(ui_store: UIStore): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_editor_zoom(ui_store.editor_settings.editor_zoom);
    });
  });
}

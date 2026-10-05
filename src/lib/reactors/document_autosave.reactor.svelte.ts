import type { ActionRegistry, UIStore } from "$lib/app";
import type { DocumentStore } from "$lib/features/document";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

// Same rule as notes: save once you stop typing for the autosave delay. A
// conflict waits for your choice in the banner instead.
export function create_document_autosave_reactor(
  document_store: DocumentStore,
  ui_store: UIStore,
  action_registry: ActionRegistry,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const settings = ui_store.editor_settings;
      void document_store.edit_revision;
      if (!settings.autosave_enabled) return;
      if (!document_store.is_dirty || document_store.has_conflict) return;
      const handle = setTimeout(() => {
        void action_registry.execute(ACTION_IDS.note_request_save);
      }, settings.autosave_delay_ms);
      return () => {
        clearTimeout(handle);
      };
    });
  });
}

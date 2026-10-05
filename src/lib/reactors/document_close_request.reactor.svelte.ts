import type { ActionRegistry, UIStore } from "$lib/app";
import type { DocumentStore } from "$lib/features/document";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function create_document_close_request_reactor(
  document_store: DocumentStore,
  ui_store: UIStore,
  action_registry: ActionRegistry,
): () => void {
  let unlisten: (() => void) | null = null;
  void getCurrentWindow()
    .onCloseRequested((event) => {
      if (
        !document_store.is_dirty ||
        ui_store.document_close_confirm.is_closing
      )
        return;
      event.preventDefault();
      void action_registry.execute(ACTION_IDS.document_request_close);
    })
    .then((next_unlisten) => {
      unlisten = next_unlisten;
    });
  return () => {
    unlisten?.();
  };
}

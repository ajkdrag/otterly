import type { DocumentService, DocumentStore } from "$lib/features/document";
import { subscribe_to_window_focus } from "$lib/reactors/window_focus";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Keeps the window title on the file name, and checks the file on disk each
// time the window gains focus.
export function create_document_window_reactor(
  document_store: DocumentStore,
  document_service: DocumentService,
): () => void {
  const window = getCurrentWindow();
  const stop_listening = subscribe_to_window_focus(() => {
    void document_service.check_disk_changes();
  });
  const cleanup_title = $effect.root(() => {
    $effect(() => {
      const name = document_store.file?.name ?? "Otterly";
      void window.setTitle(document_store.is_dirty ? `∘ ${name}` : name);
    });
  });
  return () => {
    stop_listening();
    cleanup_title();
  };
}

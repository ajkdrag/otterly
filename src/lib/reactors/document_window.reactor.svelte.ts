import type { DocumentService, DocumentStore } from "$lib/features/document";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Keeps the window title on the file name, and checks the file on disk each
// time the window gains focus.
export function create_document_window_reactor(
  document_store: DocumentStore,
  document_service: DocumentService,
): () => void {
  const window = getCurrentWindow();
  let unlisten: (() => void) | null = null;
  void window
    .onFocusChanged(({ payload: focused }) => {
      if (focused) void document_service.check_disk_changes();
    })
    .then((next_unlisten) => {
      unlisten = next_unlisten;
    });
  const cleanup_title = $effect.root(() => {
    $effect(() => {
      const name = document_store.file?.name ?? "otterly";
      void window.setTitle(document_store.is_dirty ? `∘ ${name}` : name);
    });
  });
  return () => {
    unlisten?.();
    cleanup_title();
  };
}

import type { DocumentPort } from "$lib/features/document/ports";
import type { DocumentFile } from "$lib/features/document/types/document";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_document_tauri_adapter(): DocumentPort {
  return {
    read_document: () => tauri_invoke<DocumentFile>("read_document"),
    write_document: (text, expected_mtime_ms) =>
      tauri_invoke<number>("write_document", {
        text,
        expectedMtimeMs: expected_mtime_ms,
      }),
  };
}

// Images in a document load from its folder through the asset protocol. The
// backend maps the window label back to the file.
export function document_asset_url(
  window_label: string,
  relative_path: string,
): string {
  const encoded = relative_path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `otterly-asset://document/${window_label}/${encoded}`;
}

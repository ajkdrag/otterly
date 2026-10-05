import { getCurrentWindow } from "@tauri-apps/api/window";
import { is_tauri } from "$lib/shared/utils/detect_platform";

// The backend labels a window that shows one file "document-<hash>". Every
// other window is the vault app.
const DOCUMENT_WINDOW_PREFIX = "document-";

export function current_document_window_label(): string | null {
  if (!is_tauri) return null;
  const label = getCurrentWindow().label;
  return label.startsWith(DOCUMENT_WINDOW_PREFIX) ? label : null;
}

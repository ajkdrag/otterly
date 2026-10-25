import { readText } from "@tauri-apps/plugin-clipboard-manager";
import type { ClipboardPort } from "$lib/features/clipboard/ports";

export function create_clipboard_tauri_adapter(): ClipboardPort {
  return {
    async write_text(text) {
      await navigator.clipboard.writeText(text);
    },
    read_text: () => readText(),
  };
}

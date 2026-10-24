import type {
  ThemeFilePort,
  ThemeFileSnapshot,
} from "$lib/features/theme/ports";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Calls invoke, not tauri_invoke. tauri_invoke wraps errors as "tauri invoke
// failed: <command>: ...", and the backend's messages here (like "A theme file
// already exists") are shown to people as they are. Rust rejects with that
// string.
export function create_theme_file_tauri_adapter(): ThemeFilePort {
  return {
    read_theme_file: () => invoke<ThemeFileSnapshot>("read_theme_file"),
    create_theme_file: (text) => invoke<string>("create_theme_file", { text }),
    write_theme_schema: (text) =>
      invoke<undefined>("write_theme_schema", { text }),
    open_theme_file: () => invoke<undefined>("open_theme_file"),
    reveal_theme_file: () => invoke<undefined>("reveal_theme_file"),
    watch_theme_file: () => invoke<undefined>("watch_theme_file"),
    subscribe_theme_file_changes: subscribe_theme_file_changes,
  };
}

// listen() resolves later, so an unsubscribe can arrive before it does.
function subscribe_theme_file_changes(callback: () => void): () => void {
  let unlisten: (() => void) | null = null;
  let is_disposed = false;

  void listen("theme_file_changed", () => {
    if (!is_disposed) callback();
  }).then((unlisten_fn) => {
    if (is_disposed) {
      unlisten_fn();
      return;
    }
    unlisten = unlisten_fn;
  });

  return () => {
    is_disposed = true;
    unlisten?.();
    unlisten = null;
  };
}

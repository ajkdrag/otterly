import type {
  ThemeFilePort,
  ThemeFileSnapshot,
} from "$lib/features/theme/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { error_message } from "$lib/shared/utils/error_message";
import { listen } from "@tauri-apps/api/event";

export function create_theme_file_tauri_adapter(): ThemeFilePort {
  return {
    read_theme_file: () =>
      invoke_theme_command<ThemeFileSnapshot>("read_theme_file"),
    create_theme_file: (text) =>
      invoke_theme_command<string>("create_theme_file", { text }),
    write_theme_schema: (text) =>
      invoke_theme_command<undefined>("write_theme_schema", { text }),
    open_theme_file: () => invoke_theme_command<undefined>("open_theme_file"),
    reveal_theme_file: () =>
      invoke_theme_command<undefined>("reveal_theme_file"),
    watch_theme_file: () => invoke_theme_command<undefined>("watch_theme_file"),
    subscribe_theme_file_changes: subscribe_theme_file_changes,
  };
}

// tauri_invoke wraps errors as "tauri invoke failed: <command>: <message>".
// Theme file errors are shown to people as is, so keep the backend's message.
async function invoke_theme_command<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await tauri_invoke<T>(command, args);
  } catch (error) {
    const prefix = `tauri invoke failed: ${command}: `;
    throw new Error(error_message(error).replace(prefix, ""));
  }
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

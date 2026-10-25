import { is_missing_file_os_error } from "$lib/shared/utils/fs_errors";

// Rust refuses to open a vault that another window has, and brings that
// window to the front. tauri_invoke puts "tauri invoke failed: <command>: "
// in front of the code, so we match the end.
const VAULT_OPEN_IN_OTHER_WINDOW = "vault_open_in_other_window";

export function is_vault_open_in_other_window_error(message: string): boolean {
  return message.endsWith(VAULT_OPEN_IN_OTHER_WINDOW);
}

export function is_unavailable_vault_error(message: string): boolean {
  return (
    message.toLowerCase().includes("vault unavailable") ||
    is_missing_file_os_error(message)
  );
}

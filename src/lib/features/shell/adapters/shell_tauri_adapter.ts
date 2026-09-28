import type { ShellPort } from "$lib/features/shell/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { openUrl } from "@tauri-apps/plugin-opener";

export function create_shell_tauri_adapter(): ShellPort {
  return {
    async open_url(url) {
      await openUrl(url);
    },
    async reveal_in_file_manager(vault_id, path) {
      await tauri_invoke<void>("reveal_in_file_manager", {
        vaultId: vault_id,
        path,
      });
    },
    async open_in_default_app(vault_id, path) {
      await tauri_invoke<void>("open_in_default_app", {
        vaultId: vault_id,
        path,
      });
    },
  };
}

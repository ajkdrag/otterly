import {
  create_assets_tauri_adapter,
  create_notes_tauri_adapter,
} from "$lib/features/note";
import { create_session_tauri_adapter } from "$lib/features/session";
import {
  create_vault_tauri_adapter,
  create_vault_settings_tauri_adapter,
} from "$lib/features/vault";
import { create_settings_tauri_adapter } from "$lib/features/settings";
import {
  create_search_tauri_adapter,
  create_workspace_index_tauri_adapter,
} from "$lib/features/search";
import { create_milkdown_editor_port } from "$lib/features/editor";
import { create_clipboard_tauri_adapter } from "$lib/features/clipboard";
import { create_shell_tauri_adapter } from "$lib/features/shell";
import { create_git_tauri_adapter } from "$lib/features/git";
import { create_watcher_tauri_adapter } from "$lib/features/watcher";
import type { Ports } from "$lib/app/di/app_ports";

export function create_prod_ports(): Ports {
  const assets = create_assets_tauri_adapter();
  const vault = create_vault_tauri_adapter();
  const notes = create_notes_tauri_adapter();
  const index = create_workspace_index_tauri_adapter();
  const search = create_search_tauri_adapter();
  const settings = create_settings_tauri_adapter();
  const vault_settings = create_vault_settings_tauri_adapter();
  const session = create_session_tauri_adapter();
  const clipboard = create_clipboard_tauri_adapter();
  const shell = create_shell_tauri_adapter();
  const git = create_git_tauri_adapter();
  const watcher = create_watcher_tauri_adapter();

  return {
    vault,
    notes,
    index,
    search,
    settings,
    vault_settings,
    session,
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
    }),
    clipboard,
    shell,
    git,
    watcher,
  };
}

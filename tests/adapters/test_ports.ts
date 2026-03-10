import { create_test_assets_adapter } from "./test_assets_adapter";
import { create_test_notes_adapter } from "./test_notes_adapter";
import { create_test_vault_adapter } from "./test_vault_adapter";
import { create_test_workspace_index_adapter } from "./test_workspace_index_adapter";
import { create_test_settings_adapter } from "./test_settings_adapter";
import { create_test_session_adapter } from "./test_session_adapter";
import { create_test_vault_settings_adapter } from "./test_vault_settings_adapter";
import { create_test_search_adapter } from "./test_search_adapter";
import type { Ports } from "$lib/app/di/app_ports";
import { create_milkdown_editor_port } from "$lib/features/editor";
import { create_test_clipboard_adapter } from "./test_clipboard_adapter";
import { create_test_shell_adapter } from "./test_shell_adapter";
import { create_test_git_adapter } from "./test_git_adapter";
import { create_test_watcher_adapter } from "./test_watcher_adapter";

export function create_test_ports(): Ports {
  const assets = create_test_assets_adapter();

  return {
    vault: create_test_vault_adapter(),
    notes: create_test_notes_adapter(),
    index: create_test_workspace_index_adapter(),
    search: create_test_search_adapter(),
    settings: create_test_settings_adapter(),
    vault_settings: create_test_vault_settings_adapter(),
    session: create_test_session_adapter(),
    assets,
    editor: create_milkdown_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
    }),
    clipboard: create_test_clipboard_adapter(),
    shell: create_test_shell_adapter(),
    git: create_test_git_adapter(),
    watcher: create_test_watcher_adapter(),
  };
}

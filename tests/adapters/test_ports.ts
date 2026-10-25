import { create_test_assets_adapter } from "./test_assets_adapter";
import { create_test_notes_adapter } from "./test_notes_adapter";
import { create_test_vault_adapter } from "./test_vault_adapter";
import { create_test_workspace_index_adapter } from "./test_workspace_index_adapter";
import { create_test_settings_adapter } from "./test_settings_adapter";
import { create_test_session_adapter } from "./test_session_adapter";
import { create_test_vault_settings_adapter } from "./test_vault_settings_adapter";
import { create_test_search_adapter } from "./test_search_adapter";
import { create_test_vault_find_adapter } from "./test_vault_find_adapter";
import type { Ports } from "$lib/app/di/app_ports";
import { create_codemirror_editor_port } from "$lib/features/editor";
import { create_test_clipboard_adapter } from "./test_clipboard_adapter";
import { create_test_shell_adapter } from "./test_shell_adapter";
import { create_test_git_adapter } from "./test_git_adapter";
import { create_test_watcher_adapter } from "./test_watcher_adapter";
import { create_test_updater_adapter } from "./test_updater_adapter";
import { create_test_theme_file_adapter } from "./test_theme_file_adapter";
import { create_test_tags_adapter } from "./test_tags_adapter";
import { create_test_vimrc_adapter } from "./test_vimrc_adapter";
import { create_test_vim_engine_adapter } from "./test_vim_engine_adapter";
import { create_test_press_and_hold_adapter } from "./test_press_and_hold_adapter";

export function create_test_ports(): Ports {
  const assets = create_test_assets_adapter();
  const clipboard = create_test_clipboard_adapter();

  return {
    vault: create_test_vault_adapter(),
    notes: create_test_notes_adapter(),
    index: create_test_workspace_index_adapter(),
    search: create_test_search_adapter(),
    vault_find: create_test_vault_find_adapter(),
    settings: create_test_settings_adapter(),
    vault_settings: create_test_vault_settings_adapter(),
    session: create_test_session_adapter(),
    assets,
    editor: create_codemirror_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
      copy_text: (text) => clipboard.write_text(text),
      read_clipboard_text: () => clipboard.read_text(),
    }),
    clipboard,
    shell: create_test_shell_adapter(),
    git: create_test_git_adapter(),
    watcher: create_test_watcher_adapter(),
    updater: create_test_updater_adapter(),
    theme_file: create_test_theme_file_adapter(),
    tags: create_test_tags_adapter(),
    vimrc: create_test_vimrc_adapter(),
    vim_engine: create_test_vim_engine_adapter(),
    press_and_hold: create_test_press_and_hold_adapter(),
  };
}

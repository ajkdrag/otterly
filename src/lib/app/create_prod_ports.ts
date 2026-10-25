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
  create_vault_find_tauri_adapter,
  create_workspace_index_tauri_adapter,
} from "$lib/features/search";
import { create_codemirror_editor_port } from "$lib/features/editor";
import { create_clipboard_tauri_adapter } from "$lib/features/clipboard";
import { create_shell_tauri_adapter } from "$lib/features/shell";
import { create_git_tauri_adapter } from "$lib/features/git";
import { create_watcher_tauri_adapter } from "$lib/features/watcher";
import { create_updater_tauri_adapter } from "$lib/features/updater";
import { create_theme_file_tauri_adapter } from "$lib/features/theme";
import { create_tags_tauri_adapter } from "$lib/features/tags";
import {
  create_press_and_hold_tauri_adapter,
  create_vim_engine_adapter,
  create_vimrc_tauri_adapter,
} from "$lib/features/vim";
import {
  create_document_tauri_adapter,
  document_asset_url,
} from "$lib/features/document";
import type { Ports } from "$lib/app/di/app_ports";
import type { DocumentWindowPorts } from "$lib/app/di/create_document_window_context";

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
  const updater = create_updater_tauri_adapter();
  const tags = create_tags_tauri_adapter();
  const vimrc = create_vimrc_tauri_adapter();
  const vim_engine = create_vim_engine_adapter();

  return {
    vault,
    notes,
    index,
    search,
    vault_find: create_vault_find_tauri_adapter(),
    settings,
    vault_settings,
    session,
    assets,
    editor: create_codemirror_editor_port({
      resolve_asset_url_for_vault: (vault_id, asset_path) =>
        assets.resolve_asset_url(vault_id, asset_path),
      copy_text: (text) => clipboard.write_text(text),
      read_clipboard_text: () => clipboard.read_text(),
    }),
    clipboard,
    shell,
    git,
    watcher,
    updater,
    theme_file: create_theme_file_tauri_adapter(),
    tags,
    vimrc,
    vim_engine,
    press_and_hold: create_press_and_hold_tauri_adapter(),
  };
}

export function create_document_window_ports(
  window_label: string,
): DocumentWindowPorts {
  const clipboard = create_clipboard_tauri_adapter();
  return {
    settings: create_settings_tauri_adapter(),
    vault_settings: create_vault_settings_tauri_adapter(),
    shell: create_shell_tauri_adapter(),
    clipboard,
    document: create_document_tauri_adapter(),
    theme_file: create_theme_file_tauri_adapter(),
    vimrc: create_vimrc_tauri_adapter(),
    vim_engine: create_vim_engine_adapter(),
    press_and_hold: create_press_and_hold_tauri_adapter(),
    editor: create_codemirror_editor_port({
      // Document buffers have no vault, so this never runs.
      resolve_asset_url_for_vault: () => "",
      copy_text: (text) => clipboard.write_text(text),
      read_clipboard_text: () => clipboard.read_text(),
      resolve_document_asset_url: (relative_path) =>
        document_asset_url(window_label, relative_path),
    }),
  };
}

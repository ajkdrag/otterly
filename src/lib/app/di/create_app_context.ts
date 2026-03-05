import type { Ports } from "$lib/app/di/app_ports";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { register_actions } from "$lib/app/action_registry/register_actions";
import type { AppMountConfig } from "$lib/features/vault";
import { VaultService } from "$lib/features/vault";
import { NoteService } from "$lib/features/note";
import { FolderService } from "$lib/features/folder";
import { SettingsService } from "$lib/features/settings";
import { SearchService } from "$lib/features/search";
import { EditorService } from "$lib/features/editor";
import { ClipboardService } from "$lib/features/clipboard";
import { ShellService } from "$lib/features/shell";
import { TabService } from "$lib/features/tab";
import { GitService } from "$lib/features/git";
import { HotkeyService } from "$lib/features/hotkey";
import { ThemeService } from "$lib/features/theme";
import { LinkRepairService, LinksService } from "$lib/features/links";
import {
  SplitViewService,
  register_split_view_actions,
} from "$lib/features/split_view";
import { mount_reactors } from "$lib/reactors";

export type AppContext = ReturnType<typeof create_app_context>;

export function create_app_context(input: {
  ports: Ports;
  now_ms?: () => number;
  default_mount_config: AppMountConfig;
}) {
  const now_ms = input.now_ms ?? (() => Date.now());
  const stores = create_app_stores();
  const action_registry = new ActionRegistry();

  const search_service = new SearchService(
    input.ports.search,
    stores.vault,
    stores.op,
    now_ms,
  );

  const editor_service = new EditorService(
    input.ports.editor,
    stores.vault,
    stores.editor,
    stores.op,
    {
      on_internal_link_click: (raw_path, base_note_path) =>
        void action_registry.execute(ACTION_IDS.note_open_wiki_link, {
          raw_path,
          base_note_path,
        }),
      on_external_link_click: (url) =>
        void action_registry.execute(ACTION_IDS.shell_open_url, url),
      on_image_paste_requested: (note_id, note_path, image) =>
        void action_registry.execute(ACTION_IDS.note_request_image_paste, {
          note_id,
          note_path,
          image,
        }),
    },
    search_service,
    stores.outline,
  );

  const settings_service = new SettingsService(
    input.ports.vault_settings,
    input.ports.settings,
    stores.vault,
    stores.op,
    now_ms,
  );

  const link_repair_service = new LinkRepairService(
    input.ports.notes,
    input.ports.search,
    input.ports.index,
    stores.editor,
    stores.tab,
    now_ms,
    (path) => {
      editor_service.close_buffer(path);
    },
  );

  const note_service = new NoteService(
    input.ports.notes,
    input.ports.index,
    input.ports.assets,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.op,
    editor_service,
    now_ms,
    link_repair_service,
  );

  const folder_service = new FolderService(
    input.ports.notes,
    input.ports.index,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.tab,
    stores.op,
    now_ms,
    link_repair_service,
  );

  const shell_service = new ShellService(input.ports.shell);

  const clipboard_service = new ClipboardService(
    input.ports.clipboard,
    stores.editor,
    stores.op,
    now_ms,
  );

  const tab_service = new TabService(
    input.ports.vault_settings,
    stores.vault,
    stores.tab,
    stores.notes,
    note_service,
  );

  const git_service = new GitService(
    input.ports.git,
    stores.vault,
    stores.git,
    stores.op,
    now_ms,
  );

  const links_service = new LinksService(
    input.ports.search,
    stores.vault,
    stores.links,
  );

  const hotkey_service = new HotkeyService(
    input.ports.settings,
    stores.op,
    now_ms,
  );

  const theme_service = new ThemeService(
    input.ports.settings,
    stores.op,
    now_ms,
  );

  const vault_service = new VaultService(
    input.ports.vault,
    input.ports.notes,
    input.ports.index,
    input.ports.settings,
    input.ports.vault_settings,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.op,
    stores.search,
    now_ms,
  );

  const split_view_service = new SplitViewService(
    input.ports.editor,
    stores.vault,
    stores.op,
    stores.split_view,
  );

  register_actions({
    registry: action_registry,
    stores: {
      ui: stores.ui,
      vault: stores.vault,
      notes: stores.notes,
      editor: stores.editor,
      op: stores.op,
      search: stores.search,
      tab: stores.tab,
      git: stores.git,
      outline: stores.outline,
    },
    services: {
      vault: vault_service,
      note: note_service,
      folder: folder_service,
      settings: settings_service,
      search: search_service,
      editor: editor_service,
      clipboard: clipboard_service,
      shell: shell_service,
      tab: tab_service,
      git: git_service,
      hotkey: hotkey_service,
      theme: theme_service,
    },
    default_mount_config: input.default_mount_config,
  });

  register_split_view_actions({
    registry: action_registry,
    stores: {
      ui: stores.ui,
      vault: stores.vault,
      notes: stores.notes,
      editor: stores.editor,
      op: stores.op,
      search: stores.search,
      tab: stores.tab,
      git: stores.git,
      outline: stores.outline,
    },
    services: {
      vault: vault_service,
      note: note_service,
      folder: folder_service,
      settings: settings_service,
      search: search_service,
      editor: editor_service,
      clipboard: clipboard_service,
      shell: shell_service,
      tab: tab_service,
      git: git_service,
      hotkey: hotkey_service,
      theme: theme_service,
    },
    default_mount_config: input.default_mount_config,
    split_view_store: stores.split_view,
    split_view_service,
  });

  const cleanup_reactors = mount_reactors({
    editor_store: stores.editor,
    ui_store: stores.ui,
    op_store: stores.op,
    notes_store: stores.notes,
    search_store: stores.search,
    vault_store: stores.vault,
    tab_store: stores.tab,
    git_store: stores.git,
    links_store: stores.links,
    editor_service,
    note_service,
    vault_service,
    settings_service,
    tab_service,
    git_service,
    links_service,
    action_registry,
  });

  return {
    stores,
    action_registry,
    destroy: () => {
      cleanup_reactors();
      split_view_service.destroy();
      editor_service.unmount();
    },
  };
}

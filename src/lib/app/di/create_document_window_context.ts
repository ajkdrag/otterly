import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { EditorPort } from "$lib/features/editor";
import {
  SettingsService,
  register_editor_zoom_actions,
  type SettingsPort,
} from "$lib/features/settings";
import type { VaultSettingsPort } from "$lib/features/vault";
import { ShellService, type ShellPort } from "$lib/features/shell";
import { ClipboardService, type ClipboardPort } from "$lib/features/clipboard";
import {
  SearchStore,
  register_find_in_file_actions,
  search_within_text,
} from "$lib/features/search";
import { register_help_actions } from "$lib/app/orchestration/help_actions";
import { VaultStore } from "$lib/features/vault";
import {
  ThemeService,
  register_theme_actions,
  type ThemeFilePort,
} from "$lib/features/theme";
import { DEFAULT_HOTKEYS, HotkeyService } from "$lib/features/hotkey";
import {
  DocumentService,
  DocumentStore,
  register_document_actions,
  type DocumentPort,
} from "$lib/features/document";
import {
  VimService,
  VimStore,
  register_vim_actions,
  type PressAndHoldPort,
  type VimEnginePort,
  type VimrcPort,
} from "$lib/features/vim";
import { create_find_in_file_reactor } from "$lib/reactors/find_in_file.reactor.svelte";
import { create_op_toast_reactor } from "$lib/reactors/op_toast.reactor.svelte";
import { create_theme_reactor } from "$lib/reactors/theme.reactor.svelte";
import { create_theme_file_reactor } from "$lib/reactors/theme_file.reactor.svelte";
import { create_editor_zoom_reactor } from "$lib/reactors/editor_zoom.reactor.svelte";
import { create_editor_width_reactor } from "$lib/reactors/editor_width.reactor.svelte";
import { create_document_autosave_reactor } from "$lib/reactors/document_autosave.reactor.svelte";
import { create_document_close_request_reactor } from "$lib/reactors/document_close_request.reactor.svelte";
import { create_document_window_reactor } from "$lib/reactors/document_window.reactor.svelte";
import { create_vim_mode_reactor } from "$lib/reactors/vim_mode.reactor.svelte";
import { subscribe_to_window_focus } from "$lib/reactors/window_focus";
import { toast } from "svelte-sonner";

export type DocumentWindowPorts = {
  settings: SettingsPort;
  vault_settings: VaultSettingsPort;
  shell: ShellPort;
  clipboard: ClipboardPort;
  document: DocumentPort;
  editor: EditorPort;
  theme_file: ThemeFilePort;
  vimrc: VimrcPort;
  vim_engine: VimEnginePort;
  press_and_hold: PressAndHoldPort;
};

export type DocumentWindowContext = ReturnType<
  typeof create_document_window_context
>;

// Composition root of a document window: one file opened outside any vault.
// It shares the app's theme and hotkeys, and nothing that needs a vault.
// Vault-scoped editor settings (fonts, spacing) are not loaded. Global ones
// (zoom, width, autosave) are.
export function create_document_window_context(input: {
  ports: DocumentWindowPorts;
}) {
  const now_ms = () => Date.now();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    document: new DocumentStore(),
    search: new SearchStore(),
    vim: new VimStore(),
  };
  const action_registry = new ActionRegistry();

  // Shell and settings get an empty VaultStore. A document window only calls
  // their methods that do not need a vault (open a URL, zoom).
  const shell_service = new ShellService(input.ports.shell, new VaultStore());
  const settings_service = new SettingsService(
    input.ports.vault_settings,
    input.ports.settings,
    new VaultStore(),
    stores.op,
    now_ms,
  );
  const clipboard_service = new ClipboardService(
    input.ports.clipboard,
    stores.op,
    now_ms,
  );
  const theme_service = new ThemeService(
    input.ports.settings,
    input.ports.theme_file,
    stores.op,
    now_ms,
  );
  const hotkey_service = new HotkeyService(
    input.ports.settings,
    stores.op,
    now_ms,
  );
  const document_service = new DocumentService(
    input.ports.document,
    input.ports.editor,
    stores.document,
    now_ms,
    {
      on_external_link_click: (url) =>
        void action_registry.execute(ACTION_IDS.shell_open_url, url),
      // @Incomplete: Following a relative link would mean opening another
      // file the OS never handed us, which the backend refuses on purpose.
      on_unsupported_link_click: () =>
        toast.info("Links to other files only open inside a vault"),
      on_save_request: () =>
        action_registry.execute(ACTION_IDS.note_request_save),
      // This window's tab_close closes the window, and asks first when the
      // file has unsaved changes.
      on_close_request: () =>
        void action_registry.execute(ACTION_IDS.tab_close),
    },
  );

  const vim_service = new VimService(
    input.ports.vimrc,
    input.ports.vim_engine,
    input.ports.press_and_hold,
    stores.vim,
    stores.op,
  );

  register_document_actions({
    registry: action_registry,
    stores: { ui: stores.ui, document: stores.document },
    services: {
      document: document_service,
      shell: shell_service,
      clipboard: clipboard_service,
    },
  });
  register_vim_actions({
    registry: action_registry,
    services: { vim: vim_service },
    has_settings_dialog: false,
  });
  register_find_in_file_actions({
    registry: action_registry,
    stores: { ui: stores.ui, search: stores.search },
    services: { editor: document_service },
  });
  register_help_actions({
    registry: action_registry,
    stores: { ui: stores.ui },
  });
  register_editor_zoom_actions({
    registry: action_registry,
    stores: { ui: stores.ui },
    services: { settings: settings_service },
  });
  // The theme file reactor runs theme.reload_file. The other theme actions
  // come along and nothing in this window calls them.
  register_theme_actions({
    registry: action_registry,
    stores: { ui: stores.ui },
    services: { theme: theme_service, clipboard: clipboard_service },
    // The vault app's window saves the switch. See ThemeActionInput.
    persist_file_switch: false,
  });

  const cleanups = [
    create_theme_reactor(stores.ui),
    create_theme_file_reactor(theme_service, action_registry),
    create_editor_zoom_reactor(stores.ui),
    create_editor_width_reactor(stores.ui),
    create_document_autosave_reactor(
      stores.document,
      stores.ui,
      action_registry,
    ),
    create_document_close_request_reactor(
      stores.document,
      stores.ui,
      action_registry,
    ),
    create_document_window_reactor(stores.document, document_service),
    create_vim_mode_reactor(
      stores.ui,
      document_service,
      vim_service,
      action_registry,
      subscribe_to_window_focus,
    ),
    create_op_toast_reactor(stores.op),
    create_find_in_file_reactor(
      stores.ui,
      stores.search,
      {
        read_buffer_id: () => stores.document.file?.path ?? null,
        read_markdown: () => stores.document.markdown,
        update_find_state: (spec, selected_index) => {
          document_service.update_find_state(spec, selected_index);
        },
      },
      { search_within_file: search_within_text },
    ),
  ];

  async function start() {
    const [themes, hotkey_overrides, editor_settings] = await Promise.all([
      theme_service.load_themes(),
      hotkey_service.load_hotkey_overrides(),
      settings_service.load_global_editor_settings(),
      document_service.load(),
    ]);
    stores.ui.set_editor_settings(editor_settings);
    stores.ui.set_user_themes(themes.user_themes);
    stores.ui.set_active_theme_id(themes.active_theme_id);
    stores.ui.set_theme_file(themes.theme_file);
    stores.ui.hotkey_overrides = hotkey_overrides;
    // The vault app's hotkeys, minus everything that needs a vault or tabs.
    // Shortcuts, Help and the keyboard handler all read this filtered list.
    // Every action is registered above, before start() runs.
    const registered_action_ids = new Set(
      action_registry.get_all().map((action) => action.id),
    );
    const hotkeys_config = hotkey_service.merge_config(
      DEFAULT_HOTKEYS,
      hotkey_overrides,
    );
    stores.ui.set_hotkeys_config({
      bindings: hotkeys_config.bindings.filter((binding) =>
        registered_action_ids.has(binding.action_id),
      ),
    });
  }

  return {
    stores,
    action_registry,
    start,
    destroy: () => {
      for (const cleanup of cleanups) cleanup();
      document_service.unmount_editor();
    },
  };
}

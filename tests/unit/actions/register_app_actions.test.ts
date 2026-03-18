import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_app_actions } from "$lib/app/orchestration/app_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { VaultSession } from "$lib/features/session";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    dismiss: vi.fn(),
  },
}));

const destroy_window = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    destroy: destroy_window,
  }),
}));

type HarnessOptions = {
  reset_app_state?: boolean;
};

function get_test_window(): Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
} {
  const maybe_window = globalThis as typeof globalThis & {
    window?: Window &
      typeof globalThis & {
        __TAURI__?: unknown;
        __TAURI_INTERNALS__?: unknown;
      };
  };
  if (!maybe_window.window) {
    maybe_window.window = globalThis as unknown as Window &
      typeof globalThis & {
        __TAURI__?: unknown;
        __TAURI_INTERNALS__?: unknown;
      };
  }
  return maybe_window.window;
}

function create_app_note(path = "notes/a.md"): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: "a.md",
      title: "a",
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text("# A"),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_harness(options: HarnessOptions = {}) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
  };

  const services = {
    vault: {
      initialize: vi.fn().mockResolvedValue({
        status: "ready",
        has_vault: false,
        editor_settings: null,
      }),
    },
    settings: {
      load_recent_command_ids: vi.fn().mockResolvedValue(["settings.open"]),
    },
    hotkey: {
      load_hotkey_overrides: vi.fn().mockResolvedValue([]),
      merge_config: vi.fn().mockReturnValue({ bindings: DEFAULT_HOTKEYS }),
    },
    theme: {
      load_themes: vi.fn().mockResolvedValue({
        user_themes: [],
        active_theme_id: "theme-light",
      }),
    },
    editor: {
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn(),
      set_scroll_top: vi.fn(),
      restore_cursor: vi.fn(),
    },
    note: {
      create_new_note: vi.fn(),
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "notes",
      }),
    },
    session: {
      load_latest_session: vi.fn().mockResolvedValue(null),
      restore_latest_session: vi.fn().mockResolvedValue(undefined),
      save_latest_session: vi.fn().mockResolvedValue(undefined),
    },
    tab: {
      mark_conflict: vi.fn(),
      sync_dirty_state: vi.fn(),
      clear_conflict: vi.fn(),
      has_conflict: vi.fn().mockReturnValue(false),
      invalidate_cache: vi.fn(),
      remove_tab: vi.fn(),
    },
  };

  const execute_folder_refresh_tree = vi.fn().mockResolvedValue(undefined);
  const execute_git_check_repo = vi.fn().mockResolvedValue(undefined);
  const execute_open_vault_dashboard = vi.fn().mockResolvedValue(undefined);

  register_app_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: options.reset_app_state ?? false,
      bootstrap_default_vault_path: null,
    },
  });

  registry.register({
    id: ACTION_IDS.folder_refresh_tree,
    label: "Refresh Folder Tree",
    execute: execute_folder_refresh_tree,
  });

  registry.register({
    id: ACTION_IDS.git_check_repo,
    label: "Check Git Repo",
    execute: execute_git_check_repo,
  });

  registry.register({
    id: ACTION_IDS.ui_open_vault_dashboard,
    label: "Open Vault Dashboard",
    execute: execute_open_vault_dashboard,
  });

  return {
    registry,
    stores,
    services,
    execute_folder_refresh_tree,
    execute_git_check_repo,
    execute_open_vault_dashboard,
  };
}

describe("register_app_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const test_window = get_test_window();
    delete test_window.__TAURI__;
    delete test_window.__TAURI_INTERNALS__;
  });

  it("initializes app state and loads vault UI when vault exists", async () => {
    const {
      registry,
      stores,
      services,
      execute_folder_refresh_tree,
      execute_git_check_repo,
      execute_open_vault_dashboard,
    } = create_harness();

    services.vault.initialize.mockResolvedValue({
      status: "ready",
      has_vault: true,
      editor_settings: {
        ...stores.ui.editor_settings,
        show_vault_dashboard_on_open: true,
      },
    });

    await registry.execute(ACTION_IDS.app_mounted);

    expect(stores.ui.startup).toEqual({ status: "idle", error: null });
    expect(execute_folder_refresh_tree).toHaveBeenCalledTimes(1);
    expect(execute_git_check_repo).toHaveBeenCalledTimes(1);
    expect(execute_open_vault_dashboard).toHaveBeenCalledTimes(1);
    expect(services.hotkey.merge_config).toHaveBeenCalledWith(
      DEFAULT_HOTKEYS,
      [],
    );
    expect(services.session.load_latest_session).toHaveBeenCalledTimes(1);
  });

  it("restores the latest session when mounting an existing vault", async () => {
    const { registry, services, stores } = create_harness();
    const session: VaultSession = {
      tabs: [
        {
          note_path: as_note_path("notes/a.md"),
          title: "a",
          is_pinned: false,
          is_dirty: false,
          scroll_top: 12,
          cursor: null,
          cached_note: null,
        },
      ],
      active_tab_path: as_note_path("notes/a.md"),
    };

    services.vault.initialize.mockResolvedValue({
      status: "ready",
      has_vault: true,
      editor_settings: stores.ui.editor_settings,
    });
    services.session.load_latest_session.mockResolvedValue(session);
    services.session.restore_latest_session.mockImplementation(() => {
      stores.tab.open_tab(as_note_path("notes/a.md"), "a");
      return Promise.resolve();
    });

    await registry.execute(ACTION_IDS.app_mounted);

    expect(services.session.load_latest_session).toHaveBeenCalledTimes(1);
    expect(services.session.restore_latest_session).toHaveBeenCalledWith(
      session,
    );
    expect(services.note.create_new_note).not.toHaveBeenCalled();
  });

  it("sets startup error state when vault initialization fails", async () => {
    const {
      registry,
      stores,
      services,
      execute_folder_refresh_tree,
      execute_git_check_repo,
      execute_open_vault_dashboard,
    } = create_harness();

    services.vault.initialize.mockResolvedValue({
      status: "error",
      error: "startup failed",
    });

    await registry.execute(ACTION_IDS.app_mounted);

    expect(stores.ui.startup).toEqual({
      status: "error",
      error: "startup failed",
    });
    expect(execute_folder_refresh_tree).not.toHaveBeenCalled();
    expect(execute_git_check_repo).not.toHaveBeenCalled();
    expect(execute_open_vault_dashboard).not.toHaveBeenCalled();
  });

  it("resets UI state on mount when reset_app_state is true", async () => {
    const { registry, stores } = create_harness({ reset_app_state: true });
    const reset_for_new_vault_spy = vi.spyOn(stores.ui, "reset_for_new_vault");

    await registry.execute(ACTION_IDS.app_mounted);

    expect(reset_for_new_vault_spy).toHaveBeenCalledTimes(1);
    expect(stores.ui.editor_settings).toEqual({ ...DEFAULT_EDITOR_SETTINGS });
    expect(stores.ui.startup).toEqual({ status: "idle", error: null });
  });

  it("mounts and unmounts editor via editor service", async () => {
    const { registry, services } = create_harness();
    const note = create_app_note();
    const root = {} as HTMLDivElement;

    await registry.execute(ACTION_IDS.app_editor_mount, root, note);

    expect(services.editor.mount).toHaveBeenCalledWith({ root, note });

    await registry.execute(ACTION_IDS.app_editor_unmount);

    expect(services.editor.unmount).toHaveBeenCalledTimes(1);
  });

  it("shows desktop-only info toast when checking updates outside tauri", async () => {
    const { registry } = create_harness();

    await registry.execute(ACTION_IDS.app_check_for_updates);

    expect(toast.info).toHaveBeenCalledWith(
      "Updates are only available in the desktop app",
    );
  });

  it("opens quit confirmation when quit is requested", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.app_request_quit);

    expect(stores.ui.quit_confirm).toEqual({
      open: true,
      is_quitting: false,
    });
  });

  it("persists the session before destroying the window on confirmed quit", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.quit_confirm.open = true;
    get_test_window().__TAURI__ = {};

    await registry.execute(ACTION_IDS.app_confirm_quit);

    expect(services.session.save_latest_session).toHaveBeenCalledTimes(1);
    expect(destroy_window).toHaveBeenCalledTimes(1);
  });

  it("closes the quit confirmation without quitting on cancel", async () => {
    const { registry, stores } = create_harness();
    stores.ui.quit_confirm.open = true;

    await registry.execute(ACTION_IDS.app_cancel_quit);

    expect(stores.ui.quit_confirm).toEqual({
      open: false,
      is_quitting: false,
    });
  });
});

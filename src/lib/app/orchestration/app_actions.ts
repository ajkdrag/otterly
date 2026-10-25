import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { to_editor_buffer_view_state } from "$lib/shared/types/editor";
import {
  DEFAULT_EDITOR_SETTINGS,
  GLOBAL_ONLY_SETTING_KEYS,
  omit_global_only_keys,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { apply_opened_vault_session } from "$lib/features/vault";
import { detect_platform } from "$lib/shared/utils/detect_platform";
import { toast } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";
import { getCurrentWindow } from "@tauri-apps/api/window";

const log = create_logger("app_actions");
const UPDATE_READY_TOAST_ID = "update-ready";
const is_performance_logging_enabled =
  import.meta.env.DEV && import.meta.env.MODE !== "test";

type AppServices = ActionRegistrationInput["services"];

type VaultInitializeResult = Awaited<
  ReturnType<AppServices["vault"]["initialize"]>
>;

// The app-wide settings every window loads at mount and again on focus.
type AppPreferences = {
  recent_command_ids: Awaited<
    ReturnType<AppServices["settings"]["load_recent_command_ids"]>
  >;
  hotkey_overrides: Awaited<
    ReturnType<AppServices["hotkey"]["load_hotkey_overrides"]>
  >;
  themes: Awaited<ReturnType<AppServices["theme"]["load_stored_themes"]>>;
};

type AppBootstrapData = {
  vault_initialize_result: VaultInitializeResult;
  preferences: AppPreferences;
  theme_file: Awaited<
    ReturnType<AppServices["theme"]["load_themes"]>
  >["theme_file"];
};

function set_startup_loading(input: ActionRegistrationInput) {
  input.stores.ui.startup = {
    status: "loading",
    error: null,
  };
}

function set_startup_error(input: ActionRegistrationInput, error: string) {
  input.stores.ui.startup = {
    status: "error",
    error,
  };
}

function set_startup_idle(input: ActionRegistrationInput) {
  input.stores.ui.startup = {
    status: "idle",
    error: null,
  };
}

async function load_bootstrap_data(
  input: ActionRegistrationInput,
): Promise<AppBootstrapData> {
  const { services, default_mount_config } = input;
  const [
    vault_initialize_result,
    recent_command_ids,
    hotkey_overrides,
    theme_result,
  ] = await Promise.all([
    services.vault.initialize(default_mount_config),
    services.settings.load_recent_command_ids(),
    services.hotkey.load_hotkey_overrides(),
    services.theme.load_themes(),
  ]);

  return {
    vault_initialize_result,
    preferences: { recent_command_ids, hotkey_overrides, themes: theme_result },
    theme_file: theme_result.theme_file,
  };
}

// The theme file is not part of this. Its own watcher reloads it in every
// window, and it keeps the last valid file theme while the file is invalid.
async function load_app_preferences(
  input: ActionRegistrationInput,
): Promise<AppPreferences> {
  const { services } = input;
  const [recent_command_ids, hotkey_overrides, themes] = await Promise.all([
    services.settings.load_recent_command_ids(),
    services.hotkey.load_hotkey_overrides(),
    services.theme.load_stored_themes(),
  ]);
  return { recent_command_ids, hotkey_overrides, themes };
}

function apply_loaded_preferences(
  input: ActionRegistrationInput,
  preferences: AppPreferences,
) {
  const { stores, services } = input;
  stores.ui.set_user_themes(preferences.themes.user_themes);
  stores.ui.set_active_theme_id(preferences.themes.active_theme_id);
  stores.ui.set_recent_command_ids(preferences.recent_command_ids);

  stores.ui.hotkey_overrides = preferences.hotkey_overrides;
  const hotkeys_config = services.hotkey.merge_config(
    DEFAULT_HOTKEYS,
    preferences.hotkey_overrides,
  );
  stores.ui.set_hotkeys_config(hotkeys_config);
}

// Settings are app-wide and every window keeps its own copy, so a window
// reads them again when it gains focus. You have to focus a window before you
// can change anything in it, so its copy is fresh before it can write over
// another window's change.
async function execute_app_reload_app_settings(input: ActionRegistrationInput) {
  const { stores, services } = input;
  const [preferences, global_editor_settings] = await Promise.all([
    load_app_preferences(input),
    services.settings.load_global_editor_settings(),
    services.vault.reload_vault_list().catch((error: unknown) => {
      log.error("Reload vault list failed", { error: String(error) });
    }),
  ]);
  // The settings dialog edits its own copy of these. Reloading under it
  // would throw away unsaved edits.
  if (stores.ui.settings_dialog.open) return;
  apply_loaded_preferences(input, preferences);

  // Editor settings are part app-wide, part per vault. Only the app-wide
  // keys come from disk. Skipping an unchanged object keeps the editor
  // reactors from running on every focus.
  const current = stores.ui.editor_settings;
  const has_changes = GLOBAL_ONLY_SETTING_KEYS.some(
    (key) => current[key] !== global_editor_settings[key],
  );
  if (!has_changes) return;
  const vault_only = omit_global_only_keys(current) as Partial<EditorSettings>;
  stores.ui.set_editor_settings({ ...global_editor_settings, ...vault_only });
}

function reset_ui_state_for_mount(input: ActionRegistrationInput) {
  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });
}

async function mount_ready_vault_state(
  input: ActionRegistrationInput,
  result: Extract<VaultInitializeResult, { status: "ready" }>,
) {
  if (!result.has_vault) {
    return;
  }

  await apply_opened_vault_session(
    input,
    result.editor_settings ?? { ...DEFAULT_EDITOR_SETTINGS },
  );

  if (input.stores.ui.editor_settings.show_vault_dashboard_on_open) {
    await input.registry.execute(ACTION_IDS.ui_open_vault_dashboard);
  }
}

async function execute_app_mounted(input: ActionRegistrationInput) {
  const started_at = is_performance_logging_enabled ? performance.now() : null;
  set_startup_loading(input);

  const bootstrap_data = await load_bootstrap_data(input);
  apply_loaded_preferences(input, bootstrap_data.preferences);
  input.stores.ui.set_theme_file(bootstrap_data.theme_file);

  if (bootstrap_data.vault_initialize_result.status === "error") {
    set_startup_error(input, bootstrap_data.vault_initialize_result.error);
    if (started_at !== null) {
      log.debug("App bootstrap failed", {
        duration_ms: performance.now() - started_at,
      });
    }
    return;
  }

  if (input.default_mount_config.reset_app_state) {
    reset_ui_state_for_mount(input);
  }

  await mount_ready_vault_state(input, bootstrap_data.vault_initialize_result);
  set_startup_idle(input);
  if (started_at !== null) {
    log.debug("App bootstrap ready", {
      duration_ms: performance.now() - started_at,
      // Includes frontend loading since navigation, but not native process launch.
      navigation_ready_ms: performance.now(),
    });
  }
}

async function execute_app_check_for_updates(input: ActionRegistrationInput) {
  if (!detect_platform().is_tauri) {
    toast.info("Updates are only available in the desktop app");
    return;
  }

  // The status bar shows the check and the download with its progress, so a
  // toast only reports how it ended.
  const result = await input.services.updater.download_update();

  if (result.status === "failed") {
    toast.error("Failed to check for updates");
    return;
  }
  if (result.status === "portable") {
    toast.info("Portable builds do not update themselves", {
      description: "Download the latest portable zip from the releases page.",
    });
    return;
  }
  if (result.status === "up_to_date") {
    toast.success("Otterly is up to date");
    return;
  }
  show_update_ready_prompt(input, result.version);
}

// "Later" stops these prompts for the session. The manual check still shows
// the prompt.
// @Speed: Every vault window runs this check, so N windows can download one
// update N times (at most every 6 hours). One window could do it for all.
async function execute_app_check_for_updates_in_background(
  input: ActionRegistrationInput,
) {
  if (input.stores.ui.update_prompt_dismissed) return;
  const result = await input.services.updater.download_update();
  if (result.status !== "ready" || input.stores.ui.update_prompt_dismissed) {
    return;
  }
  show_update_ready_prompt(input, result.version);
}

function show_update_ready_prompt(
  input: ActionRegistrationInput,
  version: string,
) {
  const dismiss = () => {
    input.stores.ui.update_prompt_dismissed = true;
  };
  // A fixed id replaces an open prompt instead of stacking another one.
  toast.info(`Otterly v${version} is ready`, {
    id: UPDATE_READY_TOAST_ID,
    description: "Restart to finish updating.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Restart",
      onClick: () =>
        void input.registry.execute(ACTION_IDS.app_restart_to_update),
    },
    cancel: { label: "Later", onClick: dismiss },
    onDismiss: dismiss,
  });
}

async function execute_app_restart_to_update(input: ActionRegistrationInput) {
  // Restarting skips the quit flow, so save the session the way quit does.
  // It keeps open tabs and unsaved edits.
  try {
    await input.services.session.save_latest_session();
  } catch (error) {
    log.error("Session save before update failed", { error: String(error) });
    toast.error("Failed to save the session. Update not installed.");
    return;
  }

  const installed = await input.services.updater.install_and_relaunch();
  if (!installed) toast.error("Failed to install the update");
}

async function execute_app_confirm_quit(input: ActionRegistrationInput) {
  if (!detect_platform().is_tauri || input.stores.ui.quit_confirm.is_quitting) {
    return;
  }

  input.stores.ui.quit_confirm = {
    open: true,
    is_quitting: true,
  };

  try {
    await input.services.session.save_latest_session();
    await getCurrentWindow().destroy();
  } catch (error) {
    input.stores.ui.quit_confirm = {
      open: true,
      is_quitting: false,
    };
    log.error("Quit failed", { error: String(error) });
    toast.error("Failed to close the window");
  }
}

export function register_app_actions(input: ActionRegistrationInput) {
  const { registry, services, stores } = input;

  registry.register({
    id: ACTION_IDS.app_mounted,
    label: "App Mounted",
    execute: async () => execute_app_mounted(input),
  });

  registry.register({
    id: ACTION_IDS.app_reload_app_settings,
    label: "Reload App Settings",
    execute: async () => execute_app_reload_app_settings(input),
  });

  registry.register({
    id: ACTION_IDS.app_editor_mount,
    label: "Editor Mount",
    execute: async (root: unknown, note: unknown) => {
      await services.editor.mount({
        root: root as HTMLDivElement,
        note: note as OpenNoteState,
      });
      const active_tab = stores.tab.active_tab;
      if (!active_tab) return;
      if (active_tab.note_path !== (note as OpenNoteState).meta.path) return;
      const snapshot = stores.tab.get_snapshot(active_tab.id);
      services.editor.set_scroll_top(snapshot?.scroll_top ?? 0);
      services.editor.restore_view_state(to_editor_buffer_view_state(snapshot));
    },
  });

  registry.register({
    id: ACTION_IDS.app_editor_unmount,
    label: "Editor Unmount",
    execute: () => {
      services.editor.unmount();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_source_mode,
    label: "Toggle Source Mode",
    execute: () => {
      services.editor.toggle_source_mode();
    },
  });

  registry.register({
    id: ACTION_IDS.app_check_for_updates,
    label: "Check for Updates",
    execute: async () => execute_app_check_for_updates(input),
  });

  registry.register({
    id: ACTION_IDS.app_check_for_updates_in_background,
    label: "Check for Updates in Background",
    execute: async () => execute_app_check_for_updates_in_background(input),
  });

  registry.register({
    id: ACTION_IDS.app_restart_to_update,
    label: "Restart to Update",
    execute: async () => execute_app_restart_to_update(input),
  });

  registry.register({
    id: ACTION_IDS.app_request_quit,
    label: "Request Quit",
    execute: () => {
      if (stores.ui.quit_confirm.is_quitting) {
        return;
      }
      stores.ui.quit_confirm = {
        open: true,
        is_quitting: false,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.app_confirm_quit,
    label: "Confirm Quit",
    execute: async () => execute_app_confirm_quit(input),
  });

  registry.register({
    id: ACTION_IDS.app_cancel_quit,
    label: "Cancel Quit",
    execute: () => {
      if (stores.ui.quit_confirm.is_quitting) {
        return;
      }
      stores.ui.quit_confirm = {
        open: false,
        is_quitting: false,
      };
    },
  });
}

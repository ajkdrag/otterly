import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { apply_opened_vault_session } from "$lib/features/vault";
import { detect_platform } from "$lib/shared/utils/detect_platform";
import { toast } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";
import { getCurrentWindow } from "@tauri-apps/api/window";

const log = create_logger("app_actions");

type VaultInitializeResult = Awaited<
  ReturnType<ActionRegistrationInput["services"]["vault"]["initialize"]>
>;

type AppBootstrapData = {
  vault_initialize_result: VaultInitializeResult;
  recent_command_ids: Awaited<
    ReturnType<
      ActionRegistrationInput["services"]["settings"]["load_recent_command_ids"]
    >
  >;
  hotkey_overrides: Awaited<
    ReturnType<
      ActionRegistrationInput["services"]["hotkey"]["load_hotkey_overrides"]
    >
  >;
  theme_result: Awaited<
    ReturnType<ActionRegistrationInput["services"]["theme"]["load_themes"]>
  >;
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
    recent_command_ids,
    hotkey_overrides,
    theme_result,
  };
}

function apply_loaded_preferences(
  input: ActionRegistrationInput,
  data: AppBootstrapData,
) {
  const { stores, services } = input;
  stores.ui.set_user_themes(data.theme_result.user_themes);
  stores.ui.set_active_theme_id(data.theme_result.active_theme_id);
  stores.ui.set_recent_command_ids(data.recent_command_ids);

  stores.ui.hotkey_overrides = data.hotkey_overrides;
  const hotkeys_config = services.hotkey.merge_config(
    DEFAULT_HOTKEYS,
    data.hotkey_overrides,
  );
  stores.ui.set_hotkeys_config(hotkeys_config);
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
  set_startup_loading(input);

  const bootstrap_data = await load_bootstrap_data(input);
  apply_loaded_preferences(input, bootstrap_data);

  if (bootstrap_data.vault_initialize_result.status === "error") {
    set_startup_error(input, bootstrap_data.vault_initialize_result.error);
    return;
  }

  if (input.default_mount_config.reset_app_state) {
    reset_ui_state_for_mount(input);
  }

  await mount_ready_vault_state(input, bootstrap_data.vault_initialize_result);
  set_startup_idle(input);
}

async function execute_app_check_for_updates() {
  if (!detect_platform().is_tauri) {
    toast.info("Updates are only available in the desktop app");
    return;
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const loading_toast_id = toast.loading("Checking for updates...");

  try {
    const update = await check();
    toast.dismiss(loading_toast_id);
    if (!update) {
      toast.success("Otterly is up to date");
      return;
    }

    toast.loading(`Downloading update v${update.version}...`, {
      id: loading_toast_id,
    });
    await update.downloadAndInstall();
    toast.dismiss(loading_toast_id);
    toast.success("Update installed — restart Otterly to apply");
  } catch (error) {
    toast.dismiss(loading_toast_id);
    toast.error("Failed to check for updates");
    log.error("Update check failed", { error: String(error) });
  }
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
    toast.error("Failed to quit Otterly");
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
      services.editor.restore_cursor(snapshot?.cursor ?? null);
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
    id: ACTION_IDS.app_check_for_updates,
    label: "Check for Updates",
    execute: async () => execute_app_check_for_updates(),
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

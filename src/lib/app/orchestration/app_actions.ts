import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { as_note_path, as_vault_path } from "$lib/shared/types/ids";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { toast } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";

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

async function load_non_vault_bootstrap_data(
  input: ActionRegistrationInput,
): Promise<Omit<AppBootstrapData, "vault_initialize_result">> {
  const { services } = input;
  const [recent_command_ids, hotkey_overrides, theme_result] =
    await Promise.all([
      services.settings.load_recent_command_ids(),
      services.hotkey.load_hotkey_overrides(),
      services.theme.load_themes(),
    ]);
  return { recent_command_ids, hotkey_overrides, theme_result };
}

function apply_loaded_preferences(
  input: ActionRegistrationInput,
  data: Omit<AppBootstrapData, "vault_initialize_result">,
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

  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings(
    result.editor_settings ?? { ...DEFAULT_EDITOR_SETTINGS },
  );

  await input.registry.execute(ACTION_IDS.folder_refresh_tree);

  if (input.stores.vault.is_vault_mode) {
    await input.registry.execute(ACTION_IDS.git_check_repo);

    if (input.stores.ui.editor_settings.show_vault_dashboard_on_open) {
      await input.registry.execute(ACTION_IDS.ui_open_vault_dashboard);
    }
  }
}

async function resolve_pending_file_open(
  input: ActionRegistrationInput,
): Promise<void> {
  if (!is_tauri) return;

  const has_vault = input.stores.vault.vault !== null;
  if (has_vault) return;

  try {
    const pending_path = await tauri_invoke<string | null>(
      "get_pending_file_open",
    );
    if (!pending_path) return;

    log.info("Cold start with pending file open", {
      file_path: pending_path,
    });

    const resolution =
      await input.services.vault.resolve_file_to_vault(pending_path);

    const vault_path = resolution
      ? resolution.vault_path
      : pending_path.substring(0, pending_path.lastIndexOf("/"));

    const relative_path = resolution
      ? resolution.relative_path
      : pending_path.substring(pending_path.lastIndexOf("/") + 1);

    const open_config = {
      ...input.default_mount_config,
      bootstrap_default_vault_path: as_vault_path(vault_path),
      open_file_after_mount: relative_path,
    };

    const vault_result = await input.services.vault.initialize(open_config);
    if (vault_result.status === "ready" && vault_result.has_vault) {
      await mount_ready_vault_state(input, vault_result);
      await input.registry.execute(ACTION_IDS.note_open, {
        note_path: as_note_path(relative_path),
        cleanup_if_missing: false,
      });
    }
  } catch (error) {
    log.error("Failed to handle pending file open", {
      error: String(error),
    });
  }
}

async function execute_app_mounted(input: ActionRegistrationInput) {
  set_startup_loading(input);

  await resolve_pending_file_open(input);

  if (input.stores.vault.vault !== null) {
    apply_loaded_preferences(input, await load_non_vault_bootstrap_data(input));
    set_startup_idle(input);
    return;
  }

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

  if (
    bootstrap_data.vault_initialize_result.has_vault &&
    input.default_mount_config.open_file_after_mount
  ) {
    await input.registry.execute(ACTION_IDS.note_open, {
      note_path: as_note_path(input.default_mount_config.open_file_after_mount),
      cleanup_if_missing: false,
    });
  }

  set_startup_idle(input);
}

async function execute_app_check_for_updates() {
  if (!is_tauri) {
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

let file_open_window_counter = 0;

async function open_file_in_new_window(
  vault_path: string,
  relative_path: string,
) {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  const label = `file-open-${String(++file_open_window_counter)}`;
  const params = new URLSearchParams({
    vault_path,
    file_path: relative_path,
  });

  const filename = relative_path.substring(relative_path.lastIndexOf("/") + 1);

  new WebviewWindow(label, {
    url: `/?${params.toString()}`,
    title: `${filename} — otterly`,
    width: 1200,
    height: 820,
  });
}

export function register_app_actions(input: ActionRegistrationInput) {
  const { registry, services } = input;

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
    id: ACTION_IDS.app_handle_file_open,
    label: "Handle File Open",
    execute: async (file_path_raw: unknown) => {
      const file_path = file_path_raw as string;
      try {
        const resolution =
          await services.vault.resolve_file_to_vault(file_path);

        const current_vault_id = input.stores.vault.vault?.id;

        if (resolution && current_vault_id === resolution.vault_id) {
          await registry.execute(ACTION_IDS.note_open, {
            note_path: as_note_path(resolution.relative_path),
            cleanup_if_missing: false,
          });
          return;
        }

        const vault_path = resolution
          ? resolution.vault_path
          : file_path.substring(0, file_path.lastIndexOf("/"));

        const relative_path = resolution
          ? resolution.relative_path
          : file_path.substring(file_path.lastIndexOf("/") + 1);

        if (!current_vault_id) {
          await services.vault.change_vault_by_path(as_vault_path(vault_path));
          await registry.execute(ACTION_IDS.note_open, {
            note_path: as_note_path(relative_path),
            cleanup_if_missing: false,
          });
          return;
        }

        await open_file_in_new_window(vault_path, relative_path);
      } catch (error) {
        log.error("Failed to handle file open", { error: String(error) });
        toast.error("Failed to open file");
      }
    },
  });
}

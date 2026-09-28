import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { step_editor_zoom } from "$lib/features/settings/domain/editor_zoom";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
  type SettingsCategory,
} from "$lib/shared/types/editor_settings";

export function register_settings_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  let settings_open_revision = 0;

  function parse_settings_category(value: unknown): SettingsCategory {
    return (typeof value === "string" ? value : "theme") as SettingsCategory;
  }

  function build_hotkey_draft(overrides: typeof stores.ui.hotkey_overrides) {
    const draft_overrides = [...overrides];
    const draft_config = services.hotkey.merge_config(
      DEFAULT_HOTKEYS,
      draft_overrides,
    );
    return {
      draft_overrides,
      draft_config,
    };
  }

  function set_settings_dialog_open(
    category: SettingsCategory,
    settings_snapshot: EditorSettings,
  ) {
    const { draft_overrides, draft_config } = build_hotkey_draft(
      stores.ui.hotkey_overrides,
    );
    stores.ui.settings_dialog = {
      open: true,
      current_settings: settings_snapshot,
      persisted_settings: settings_snapshot,
      has_unsaved_changes: false,
      active_category: category,
      hotkey_draft_overrides: draft_overrides,
      hotkey_draft_config: draft_config,
    };
  }

  function close_settings_dialog() {
    const persisted_settings = stores.ui.settings_dialog.persisted_settings;
    stores.ui.set_editor_settings(persisted_settings);

    const { draft_overrides, draft_config } = build_hotkey_draft(
      stores.ui.hotkey_overrides,
    );
    stores.ui.settings_dialog = {
      ...stores.ui.settings_dialog,
      open: false,
      current_settings: persisted_settings,
      has_unsaved_changes: false,
      hotkey_draft_overrides: draft_overrides,
      hotkey_draft_config: draft_config,
    };
  }

  async function persist_hotkey_draft() {
    const draft_overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
    await services.hotkey.save_hotkey_overrides(draft_overrides);
    stores.ui.hotkey_overrides = draft_overrides;

    const config = services.hotkey.merge_config(
      DEFAULT_HOTKEYS,
      draft_overrides,
    );
    stores.ui.set_hotkeys_config(config);
    stores.ui.settings_dialog = {
      ...stores.ui.settings_dialog,
      hotkey_draft_config: config,
    };
  }

  async function set_editor_zoom(zoom: number) {
    stores.ui.set_editor_settings({
      ...stores.ui.editor_settings,
      editor_zoom: zoom,
    });
    await services.settings.save_editor_zoom(zoom);
  }

  registry.register({
    id: ACTION_IDS.editor_zoom_in,
    label: "Zoom In",
    execute: () =>
      set_editor_zoom(
        step_editor_zoom(stores.ui.editor_settings.editor_zoom, 1),
      ),
  });

  registry.register({
    id: ACTION_IDS.editor_zoom_out,
    label: "Zoom Out",
    execute: () =>
      set_editor_zoom(
        step_editor_zoom(stores.ui.editor_settings.editor_zoom, -1),
      ),
  });

  registry.register({
    id: ACTION_IDS.editor_zoom_reset,
    label: "Reset Zoom",
    execute: () => set_editor_zoom(DEFAULT_EDITOR_SETTINGS.editor_zoom),
  });

  registry.register({
    id: ACTION_IDS.settings_open,
    label: "Open Settings",
    execute: async (arg: unknown) => {
      const category = parse_settings_category(arg);
      const open_revision = ++settings_open_revision;
      const settings_snapshot = { ...stores.ui.editor_settings };
      set_settings_dialog_open(category, settings_snapshot);

      const result = await services.settings.load_settings(
        stores.ui.editor_settings,
      );
      if (open_revision !== settings_open_revision) {
        return;
      }
      if (!stores.ui.settings_dialog.open) {
        return;
      }
      if (result.status === "success") {
        stores.ui.settings_dialog = {
          ...stores.ui.settings_dialog,
          current_settings: result.settings,
          persisted_settings: result.settings,
          has_unsaved_changes: false,
        };
        stores.ui.set_editor_settings(result.settings);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.settings_close,
    label: "Close Settings",
    execute: () => {
      if (stores.op.is_pending("settings.save")) {
        return;
      }
      settings_open_revision += 1;
      close_settings_dialog();
      void registry.execute(ACTION_IDS.theme_revert);
      services.settings.reset_load_operation();
      services.settings.reset_save_operation();
    },
  });

  registry.register({
    id: ACTION_IDS.settings_update,
    label: "Update Settings",
    execute: (settings: unknown) => {
      const editor_settings = settings as EditorSettings;
      stores.ui.settings_dialog = {
        ...stores.ui.settings_dialog,
        current_settings: editor_settings,
        has_unsaved_changes: true,
      };
      stores.ui.set_editor_settings(editor_settings);
    },
  });

  registry.register({
    id: ACTION_IDS.settings_save,
    label: "Save Settings",
    execute: async () => {
      const settings = stores.ui.settings_dialog.current_settings;
      const result = await services.settings.save_settings(settings);

      if (result.status === "success") {
        stores.ui.set_editor_settings(settings);
        stores.ui.settings_dialog = {
          ...stores.ui.settings_dialog,
          persisted_settings: settings,
          has_unsaved_changes: false,
        };
      }

      await persist_hotkey_draft();
      await registry.execute(ACTION_IDS.theme_save);
    },
  });
}

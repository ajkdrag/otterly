import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry, UIStore } from "$lib/app";
import type { ClipboardService } from "$lib/features/clipboard";
import type { ThemeService } from "$lib/features/theme/application/theme_service";
import type { Theme } from "$lib/shared/types/theme";
import {
  BUILTIN_THEMES,
  get_all_themes,
  DEFAULT_THEME_ID,
  FILE_THEME_ID,
} from "$lib/shared/types/theme";
import { toast } from "svelte-sonner";

// Narrower than ActionRegistrationInput, so a document window can register
// these with its own stores and services.
export type ThemeActionInput = {
  registry: ActionRegistry;
  stores: { ui: UIStore };
  services: { theme: ThemeService; clipboard: ClipboardService };
  // Only the vault app's window saves the switch to the file theme. Every
  // window reloads on a file save, so all of them would write settings.json
  // at once, and set_setting is a read-modify-write that can lose a write. A
  // document window also can't see a theme draft held by the main window.
  persist_file_switch: boolean;
};

export function register_theme_actions(input: ThemeActionInput): void {
  const { registry, stores, services, persist_file_switch } = input;

  let persisted_user_themes_snapshot: Theme[] | null = null;
  let persisted_active_theme_id: string | null = null;

  async function persist_themes(): Promise<void> {
    await services.theme.save_user_themes(stores.ui.user_themes);
    await services.theme.save_active_theme_id(stores.ui.active_theme_id);
  }

  function clone_theme(theme: Theme): Theme {
    return {
      ...theme,
      token_overrides: { ...theme.token_overrides },
    };
  }

  function clone_themes(themes: Theme[]): Theme[] {
    return themes.map(clone_theme);
  }

  function set_themes_and_active_id(
    themes: Theme[],
    active_theme_id: string,
  ): void {
    stores.ui.set_user_themes(themes);
    stores.ui.set_active_theme_id(active_theme_id);
  }

  function capture_draft_snapshot(): void {
    if (persisted_user_themes_snapshot === null) {
      persisted_user_themes_snapshot = clone_themes(stores.ui.user_themes);
    }
    if (persisted_active_theme_id === null) {
      persisted_active_theme_id = stores.ui.active_theme_id;
    }
  }

  function mark_theme_draft(): void {
    capture_draft_snapshot();
    stores.ui.theme_has_draft = true;
  }

  function reset_theme_draft_state(): void {
    persisted_user_themes_snapshot = null;
    persisted_active_theme_id = null;
    stores.ui.theme_has_draft = false;
  }

  function find_theme(theme_id: string): Theme | undefined {
    return get_all_themes(
      stores.ui.user_themes,
      stores.ui.theme_file.theme,
    ).find((t) => t.id === theme_id);
  }

  registry.register({
    id: ACTION_IDS.theme_load,
    label: "Load Themes",
    execute: async () => {
      const result = await services.theme.load_themes();
      stores.ui.set_user_themes(result.user_themes);
      stores.ui.set_active_theme_id(result.active_theme_id);
      stores.ui.set_theme_file(result.theme_file);
      reset_theme_draft_state();
    },
  });

  registry.register({
    id: ACTION_IDS.theme_switch,
    label: "Switch Theme",
    execute: (theme_id: unknown) => {
      if (typeof theme_id !== "string") return;
      if (theme_id === stores.ui.active_theme_id) return;
      mark_theme_draft();
      stores.ui.set_active_theme_id(theme_id);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_create,
    label: "Create Theme",
    execute: (args: unknown) => {
      const { name, base } = args as { name: string; base: Theme };
      mark_theme_draft();
      const new_theme = services.theme.duplicate_theme(name, base);
      const updated = [...stores.ui.user_themes, new_theme];
      set_themes_and_active_id(updated, new_theme.id);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_duplicate,
    label: "Duplicate Theme",
    execute: (theme_id: unknown) => {
      if (typeof theme_id !== "string") return;
      const source = find_theme(theme_id);
      if (!source) return;
      mark_theme_draft();
      const new_theme = services.theme.duplicate_theme(
        `${source.name} (copy)`,
        source,
      );
      const updated = [...stores.ui.user_themes, new_theme];
      set_themes_and_active_id(updated, new_theme.id);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_rename,
    label: "Rename Theme",
    execute: (args: unknown) => {
      const { id, name } = args as { id: string; name: string };
      mark_theme_draft();
      const updated = stores.ui.user_themes.map((t) =>
        t.id === id ? { ...t, name } : t,
      );
      stores.ui.set_user_themes(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_delete,
    label: "Delete Theme",
    execute: (theme_id: unknown) => {
      if (typeof theme_id !== "string") return;
      if (theme_id === FILE_THEME_ID) return;
      if (BUILTIN_THEMES.some((t) => t.id === theme_id)) return;
      mark_theme_draft();
      const updated = stores.ui.user_themes.filter((t) => t.id !== theme_id);
      stores.ui.set_user_themes(updated);
      if (stores.ui.active_theme_id === theme_id) {
        stores.ui.set_active_theme_id(DEFAULT_THEME_ID);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.theme_update,
    label: "Update Theme (draft)",
    execute: (args: unknown) => {
      const theme = args as Theme;
      // Read-only here. The file theme only changes through its file.
      if (theme.is_builtin || theme.id === FILE_THEME_ID) return;
      mark_theme_draft();
      const updated = stores.ui.user_themes.map((t) =>
        t.id === theme.id ? theme : t,
      );
      stores.ui.set_user_themes(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_save,
    label: "Save Themes",
    execute: async () => {
      await persist_themes();
      reset_theme_draft_state();
    },
  });

  registry.register({
    id: ACTION_IDS.theme_revert,
    label: "Revert Theme Changes",
    execute: () => {
      if (persisted_user_themes_snapshot !== null) {
        stores.ui.set_user_themes(clone_themes(persisted_user_themes_snapshot));
      }
      if (persisted_active_theme_id !== null) {
        stores.ui.set_active_theme_id(persisted_active_theme_id);
      }
      reset_theme_draft_state();
    },
  });

  // The theme_file reactor runs this after each save of the theme file.
  registry.register({
    id: ACTION_IDS.theme_reload_file,
    label: "Reload Theme File",
    execute: async () => {
      const loaded = await services.theme.load_theme_file();
      // Keep the last valid theme while the file has errors, so the app does
      // not jump around while someone is halfway through an edit. Keep the
      // last known path too: a file the backend can't read comes back without
      // one, and that is when someone wants to copy it for an agent.
      if (loaded.status === "invalid") {
        stores.ui.set_theme_file({
          ...loaded,
          theme: stores.ui.theme_file.theme,
          path: loaded.path ?? stores.ui.theme_file.path,
        });
        return;
      }
      stores.ui.set_theme_file(loaded);
      if (loaded.status !== "valid") return;

      // Editing the file means "show me this". Not while the settings dialog
      // holds unsaved theme edits, which would lose their theme mid-edit.
      if (stores.ui.theme_has_draft) return;
      if (stores.ui.active_theme_id === FILE_THEME_ID) return;
      stores.ui.set_active_theme_id(FILE_THEME_ID);
      if (persist_file_switch) {
        await services.theme.save_active_theme_id(FILE_THEME_ID);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.theme_create_file,
    label: "Create Theme File",
    execute: async () => {
      const result = await services.theme.create_theme_file_from(
        stores.ui.active_theme,
      );
      if (result.status === "failed") {
        toast.error(`Could not create the theme file: ${result.error}`);
        return;
      }
      // The watcher reloads it too. Loading here shows it without waiting.
      await registry.execute(ACTION_IDS.theme_reload_file);
      await registry.execute(ACTION_IDS.theme_open_file);
    },
  });

  registry.register({
    id: ACTION_IDS.theme_open_file,
    label: "Open Theme File",
    execute: async () => {
      if (await services.theme.open_theme_file()) return;

      // Some systems have no default app for .yaml (macOS says so and fails).
      // Showing the file in the file manager lets the person pick an app.
      const revealed = await services.theme.reveal_theme_file();
      toast.error(
        revealed
          ? "No app is set to open the theme file. Showing it in the file manager."
          : "Could not open the theme file",
      );
    },
  });

  registry.register({
    id: ACTION_IDS.theme_reveal_file,
    label: "Reveal Theme File",
    execute: async () => {
      const revealed = await services.theme.reveal_theme_file();
      if (!revealed) toast.error("Could not show the theme file");
    },
  });

  registry.register({
    id: ACTION_IDS.theme_copy_file_path,
    label: "Copy Theme File Path",
    execute: async () => {
      const path = stores.ui.theme_file.path;
      if (!path) {
        toast.error("The theme file path is not known yet");
        return;
      }
      try {
        await services.clipboard.copy_text(path);
        toast.success("Theme file path copied");
      } catch {
        toast.error("Failed to copy the theme file path");
      }
    },
  });
}

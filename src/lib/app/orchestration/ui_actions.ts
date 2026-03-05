import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

type SidebarView = "explorer" | "dashboard" | "starred";

export function register_ui_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  function parse_sidebar_view(input_view: unknown): SidebarView {
    const value = String(input_view).trim();
    if (value === "starred") {
      return "starred";
    }
    if (value === "dashboard") {
      return "dashboard";
    }
    return "explorer";
  }

  function set_vault_dashboard_open(open: boolean) {
    stores.ui.vault_dashboard = { open };
  }

  function execute_open_external_url(url: unknown) {
    if (typeof url !== "string") {
      return;
    }
    void services.shell.open_url(url);
  }

  registry.register({
    id: ACTION_IDS.shell_open_url,
    label: "Open External URL",
    execute: execute_open_external_url,
  });

  registry.register({
    id: ACTION_IDS.ui_toggle_sidebar,
    label: "Toggle Sidebar",
    shortcut: "CmdOrCtrl+B",
    execute: () => {
      stores.ui.toggle_sidebar();
    },
  });

  registry.register({
    id: ACTION_IDS.ui_select_folder,
    label: "Select Folder",
    execute: (path: unknown) => {
      stores.ui.set_selected_folder_path(String(path));
    },
  });

  registry.register({
    id: ACTION_IDS.ui_set_sidebar_view,
    label: "Set Sidebar View",
    execute: (view: unknown) => {
      const next_view = parse_sidebar_view(view);
      stores.ui.set_sidebar_view(next_view);
      if (next_view === "dashboard") {
        void services.vault.refresh_dashboard_stats();
      }
    },
  });

  registry.register({
    id: ACTION_IDS.ui_toggle_context_rail,
    label: "Toggle Links Panel",
    shortcut: "CmdOrCtrl+Shift+L",
    execute: () => {
      stores.ui.toggle_context_rail();
    },
  });

  registry.register({
    id: ACTION_IDS.ui_toggle_outline_panel,
    label: "Toggle Outline Panel",
    execute: () => {
      if (
        stores.ui.context_rail_open &&
        stores.ui.context_rail_tab === "outline"
      ) {
        stores.ui.toggle_context_rail();
      } else {
        stores.ui.set_context_rail_tab("outline");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.ui_open_vault_dashboard,
    label: "Open Vault Dashboard",
    shortcut: "CmdOrCtrl+Shift+D",
    execute: () => {
      set_vault_dashboard_open(true);
      void services.vault.refresh_dashboard_stats();
    },
  });

  registry.register({
    id: ACTION_IDS.ui_close_vault_dashboard,
    label: "Close Vault Dashboard",
    execute: () => {
      set_vault_dashboard_open(false);
    },
  });

  registry.register({
    id: ACTION_IDS.outline_scroll_to_heading,
    label: "Scroll to Heading",
    execute: (pos: unknown) => {
      if (typeof pos !== "number") return;
      services.editor.scroll_to_position(pos);
    },
  });
}

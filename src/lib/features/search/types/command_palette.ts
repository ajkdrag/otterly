export type CommandId =
  | "create_new_note"
  | "save_note"
  | "change_vault"
  | "open_settings"
  | "open_theme_settings"
  | "open_hotkeys"
  | "toggle_sidebar"
  | "find_in_note"
  | "open_help"
  | "next_tab"
  | "previous_tab"
  | "last_used_tab"
  | "reopen_closed_tab"
  | "sync_index"
  | "reindex_vault"
  | "show_vault_dashboard"
  | "git_version_history"
  | "git_create_checkpoint"
  | "git_init_repo"
  | "toggle_links_panel"
  | "check_for_updates";

export type CommandIcon =
  | "file-plus"
  | "folder-open"
  | "settings"
  | "keyboard"
  | "git-branch"
  | "history"
  | "bookmark"
  | "link"
  | "refresh-cw";

export type CommandDefinition = {
  id: CommandId;
  label: string;
  description: string;
  keywords: string[];
  icon: CommandIcon;
};

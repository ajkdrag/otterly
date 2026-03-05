export type CommandId =
  | "create_new_note"
  | "change_vault"
  | "open_settings"
  | "open_hotkeys"
  | "sync_index"
  | "reindex_vault"
  | "show_vault_dashboard"
  | "git_version_history"
  | "git_create_checkpoint"
  | "git_init_repo"
  | "toggle_links_panel"
  | "toggle_outline_panel"
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
  | "list-tree"
  | "refresh-cw";

export type CommandDefinition = {
  id: CommandId;
  label: string;
  description: string;
  keywords: string[];
  icon: CommandIcon;
};

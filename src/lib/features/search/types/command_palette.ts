export type CommandId =
  | "create_new_note"
  | "save_note"
  | "toggle_source_mode"
  | "toggle_bullet_list"
  | "toggle_ordered_list"
  | "toggle_task_list"
  | "convert_to_code_block"
  | "toggle_line_numbers"
  | "clean_up_legacy_markdown"
  | "change_vault"
  | "open_settings"
  | "open_theme_settings"
  | "open_theme_file"
  | "reveal_theme_file"
  | "copy_theme_file_path"
  | "open_hotkeys"
  | "toggle_sidebar"
  | "find_in_note"
  | "find_in_vault"
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
  | "search_tags"
  | "show_tags_pane"
  | "check_for_updates"
  | "new_window";

export type CommandIcon =
  | "file-plus"
  | "folder-open"
  | "settings"
  | "keyboard"
  | "git-branch"
  | "history"
  | "bookmark"
  | "link"
  | "refresh-cw"
  | "code"
  | "list"
  | "list-ordered"
  | "list-checks"
  | "hash"
  | "tag"
  | "text-search";

export type CommandDefinition = {
  id: CommandId;
  label: string;
  description: string;
  keywords: string[];
  icon: CommandIcon;
};

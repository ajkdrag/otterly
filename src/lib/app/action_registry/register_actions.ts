import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_app_actions } from "$lib/app/orchestration/app_actions";
import { register_note_actions } from "$lib/features/note";
import { register_folder_actions } from "$lib/features/folder";
import { register_vault_actions } from "$lib/features/vault";
import { register_settings_actions } from "$lib/features/settings";
import {
  register_omnibar_actions,
  register_find_in_file_actions,
} from "$lib/features/search";
import { register_ui_actions } from "$lib/app/orchestration/ui_actions";
import { register_help_actions } from "$lib/app/orchestration/help_actions";
import { register_tab_actions } from "$lib/features/tab";
import { register_git_actions } from "$lib/features/git";
import { register_hotkey_actions } from "$lib/features/hotkey";
import { register_theme_actions } from "$lib/features/theme";

export function register_actions(input: ActionRegistrationInput) {
  register_app_actions(input);
  register_note_actions(input);
  register_folder_actions(input);
  register_vault_actions(input);
  register_settings_actions(input);
  register_omnibar_actions(input);
  register_ui_actions(input);
  register_find_in_file_actions(input);
  register_tab_actions(input);
  register_git_actions(input);
  register_hotkey_actions(input);
  register_help_actions(input);
  register_theme_actions(input);
}

export type SettingsCategory =
  | "theme"
  | "layout"
  | "files"
  | "git"
  | "misc"
  | "hotkeys";

export type EditorSettings = {
  attachment_folder: string;
  show_hidden_files: boolean;
  autosave_enabled: boolean;
  autosave_delay_ms: number;
  git_autocommit_enabled: boolean;
  show_vault_dashboard_on_open: boolean;
  max_open_tabs: number;
  editor_max_width_ch: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  attachment_folder: ".assets",
  show_hidden_files: false,
  autosave_enabled: true,
  autosave_delay_ms: 2000,
  git_autocommit_enabled: false,
  show_vault_dashboard_on_open: true,
  max_open_tabs: 5,
  editor_max_width_ch: 85,
};

export const SETTINGS_KEY = "editor" as const;

export const GLOBAL_ONLY_SETTING_KEYS: readonly (keyof EditorSettings)[] = [
  "show_vault_dashboard_on_open",
  "git_autocommit_enabled",
  "autosave_enabled",
  "autosave_delay_ms",
  "editor_max_width_ch",
] as const;

const GLOBAL_ONLY_SET = new Set<string>(GLOBAL_ONLY_SETTING_KEYS);

export function omit_global_only_keys(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!GLOBAL_ONLY_SET.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

export async function apply_global_only_overrides(
  base: EditorSettings,
  get_setting: (key: string) => Promise<unknown>,
): Promise<EditorSettings> {
  const result = { ...base };
  for (const key of GLOBAL_ONLY_SETTING_KEYS) {
    const global_value = await get_setting(key);
    if (typeof global_value === typeof base[key]) {
      (result as Record<string, unknown>)[key] = global_value;
    }
  }
  return result;
}

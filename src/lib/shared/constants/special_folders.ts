export const APP_DIR = ".leapgrownotes" as const;

export const EXCLUDED_FOLDERS = [APP_DIR, ".git"] as const;

export function is_excluded_folder(name: string): boolean {
  return EXCLUDED_FOLDERS.includes(name as (typeof EXCLUDED_FOLDERS)[number]);
}

// The theme file is theme.yaml or theme.json next to settings.json. No call
// takes a path: the backend knows the one folder.

export type ThemeFileSnapshot = {
  // The existing file, or where theme.yaml goes when there is none. Set even
  // when the file can't be read, so the person can still find the folder.
  path: string;
  // null when there is no theme file or it can't be read.
  text: string | null;
  // Why the file can't be read: both names exist, over 256 KB, or not UTF-8.
  error: string | null;
};

export interface ThemeFilePort {
  // Problems with the file itself come back in the snapshot. This only
  // rejects when the backend can't reach the config folder.
  read_theme_file(): Promise<ThemeFileSnapshot>;
  // Fails when a theme file already exists. Returns the new file's path.
  create_theme_file(text: string): Promise<string>;
  write_theme_schema(text: string): Promise<void>;
  open_theme_file(): Promise<void>;
  reveal_theme_file(): Promise<void>;
  // Starts the one backend watcher. Every window may call it.
  watch_theme_file(): Promise<void>;
  // Every window reloads the theme file after a change. This is true for the
  // first window to ask after a change and false for the rest, so only one
  // window writes the result to the app log.
  claim_theme_file_log(): Promise<boolean>;
  subscribe_theme_file_changes(callback: () => void): () => void;
}

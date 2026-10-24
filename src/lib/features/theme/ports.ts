// The theme file is theme.yaml or theme.json next to settings.json. No call
// takes a path: the backend knows the one folder.

export type ThemeFileSnapshot = {
  // The existing file, or where theme.yaml goes when there is none.
  path: string;
  // null when there is no theme file.
  text: string | null;
};

export interface ThemeFilePort {
  // Fails when both theme.yaml and theme.json exist, or the file is too big.
  read_theme_file(): Promise<ThemeFileSnapshot>;
  // Fails when a theme file already exists. Returns the new file's path.
  create_theme_file(text: string): Promise<string>;
  write_theme_schema(text: string): Promise<void>;
  open_theme_file(): Promise<void>;
  reveal_theme_file(): Promise<void>;
  // Starts the one backend watcher. Every window may call it.
  watch_theme_file(): Promise<void>;
  subscribe_theme_file_changes(callback: () => void): () => void;
}

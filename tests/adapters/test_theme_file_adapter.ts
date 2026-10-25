import type { ThemeFilePort, ThemeFileSnapshot } from "$lib/features/theme";

// Starts with no theme file. Set _snapshot to change what the next read
// returns, and call _emit_change to fake a save.
export function create_test_theme_file_adapter(): ThemeFilePort & {
  _snapshot: ThemeFileSnapshot;
  _emit_change: () => void;
} {
  let handler: (() => void) | null = null;
  const mock = {
    _snapshot: {
      path: "/config/otterly/theme.yaml",
      text: null,
      error: null,
    } as ThemeFileSnapshot,
    _emit_change() {
      handler?.();
    },
    read_theme_file() {
      return Promise.resolve(mock._snapshot);
    },
    create_theme_file() {
      return Promise.resolve(mock._snapshot.path);
    },
    write_theme_schema() {
      return Promise.resolve();
    },
    open_theme_file() {
      return Promise.resolve();
    },
    reveal_theme_file() {
      return Promise.resolve();
    },
    watch_theme_file() {
      return Promise.resolve();
    },
    claim_theme_file_log() {
      return Promise.resolve(true);
    },
    subscribe_theme_file_changes(callback: () => void) {
      handler = callback;
      return () => {
        handler = null;
      };
    },
  };
  return mock;
}

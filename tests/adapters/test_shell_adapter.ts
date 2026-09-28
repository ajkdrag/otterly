import type { ShellPort } from "$lib/features/shell";

export function create_test_shell_adapter(): ShellPort & {
  _calls: {
    open_url: string[];
    reveal_in_file_manager: string[];
    open_in_default_app: string[];
  };
} {
  const calls = {
    open_url: [] as string[],
    reveal_in_file_manager: [] as string[],
    open_in_default_app: [] as string[],
  };

  return {
    _calls: calls,
    open_url(url) {
      calls.open_url.push(url);
      return Promise.resolve();
    },
    reveal_in_file_manager(_vault_id, path) {
      calls.reveal_in_file_manager.push(path);
      return Promise.resolve();
    },
    open_in_default_app(_vault_id, path) {
      calls.open_in_default_app.push(path);
      return Promise.resolve();
    },
  };
}

import type { VimEnginePort } from "$lib/features/vim";

export function create_test_vim_engine_adapter(): VimEnginePort {
  return {
    apply_vimrc() {
      return [];
    },
    sync_clipboard_from_host() {
      return Promise.resolve();
    },
  };
}

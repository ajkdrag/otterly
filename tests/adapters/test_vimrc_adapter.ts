import type { VimrcPort } from "$lib/features/vim";

export function create_test_vimrc_adapter(): VimrcPort {
  return {
    read_vimrc() {
      return Promise.resolve({ path: "/config/otterly/vimrc", text: null });
    },
    open_vimrc() {
      return Promise.resolve();
    },
  };
}

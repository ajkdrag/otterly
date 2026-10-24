import type { VimrcFile, VimrcPort } from "$lib/features/vim/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_vimrc_tauri_adapter(): VimrcPort {
  return {
    read_vimrc: () => tauri_invoke<VimrcFile>("read_vimrc"),
    open_vimrc: () => tauri_invoke<void>("open_vimrc"),
  };
}

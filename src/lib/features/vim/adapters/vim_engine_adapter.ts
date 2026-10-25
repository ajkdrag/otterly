import {
  apply_vimrc,
  sync_clipboard_from_host,
} from "@otterly/markdown-editor";
import type { VimEnginePort } from "$lib/features/vim/ports";

export function create_vim_engine_adapter(): VimEnginePort {
  return { apply_vimrc, sync_clipboard_from_host };
}

export { VimService } from "$lib/features/vim/application/vim_service";
export { register_vim_actions } from "$lib/features/vim/application/vim_actions";
export { default as VimModeBadge } from "$lib/features/vim/ui/vim_mode_badge.svelte";
export { default as VimSettings } from "$lib/features/vim/ui/vim_settings.svelte";
export { VimStore } from "$lib/features/vim/state/vim_store.svelte";
export type {
  VimEnginePort,
  VimrcFile,
  VimrcPort,
} from "$lib/features/vim/ports";
export type {
  VimrcLoadResult,
  VimrcProblem,
  VimrcStatus,
} from "$lib/features/vim/types/vimrc";
export { create_vimrc_tauri_adapter } from "$lib/features/vim/adapters/vimrc_tauri_adapter";
export { create_vim_engine_adapter } from "$lib/features/vim/adapters/vim_engine_adapter";

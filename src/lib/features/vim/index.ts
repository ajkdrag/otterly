export { VimService } from "$lib/features/vim/application/vim_service";
export { register_vim_actions } from "$lib/features/vim/application/vim_actions";
export { default as VimStatusIndicator } from "$lib/features/vim/ui/vim_status_indicator.svelte";
export { default as VimSettings } from "$lib/features/vim/ui/vim_settings.svelte";
export { VimStore } from "$lib/features/vim/state/vim_store.svelte";
export type {
  PressAndHoldPort,
  VimEnginePort,
  VimrcFile,
  VimrcPort,
} from "$lib/features/vim/ports";
export type {
  VimrcLoadResult,
  VimrcOpenResult,
  VimrcProblem,
  VimrcStatus,
} from "$lib/features/vim/types/vimrc";
export { create_vimrc_tauri_adapter } from "$lib/features/vim/adapters/vimrc_tauri_adapter";
export { create_vim_engine_adapter } from "$lib/features/vim/adapters/vim_engine_adapter";
export { create_press_and_hold_tauri_adapter } from "$lib/features/vim/adapters/press_and_hold_tauri_adapter";

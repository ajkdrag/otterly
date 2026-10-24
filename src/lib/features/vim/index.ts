export { VimService } from "$lib/features/vim/application/vim_service";
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
export { create_vim_engine_adapter } from "$lib/features/vim/adapters/vim_engine_adapter";

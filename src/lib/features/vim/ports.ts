import type { VimrcProblem } from "$lib/features/vim/types/vimrc";

// text is null when the file does not exist yet.
export type VimrcFile = { path: string; text: string | null };

// The vimrc lives at a fixed path in the app config dir, so neither call
// takes a path.
export interface VimrcPort {
  read_vimrc: () => Promise<VimrcFile>;
  // Creates the file from a starter template when it is missing, then opens
  // it for editing.
  open_vimrc: () => Promise<void>;
}

// The editor's Vim engine is global to the page, so applying a vimrc reaches
// every editor in the window.
export interface VimEnginePort {
  // Replaces the previous vimrc. Returns the lines that did not apply.
  apply_vimrc: (text: string) => VimrcProblem[];
}

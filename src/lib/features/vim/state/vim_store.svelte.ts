import type { VimrcStatus } from "$lib/features/vim/types/vimrc";

export class VimStore {
  // null until the first load.
  vimrc = $state<VimrcStatus | null>(null);

  set_vimrc(vimrc: VimrcStatus) {
    this.vimrc = vimrc;
  }
}

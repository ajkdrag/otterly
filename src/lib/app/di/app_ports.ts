import type { AssetsPort, NotesPort } from "$lib/features/note";
import type { ClipboardPort } from "$lib/features/clipboard";
import type { EditorPort } from "$lib/features/editor";
import type { SessionPort } from "$lib/features/session";
import type {
  SearchPort,
  VaultFindPort,
  WorkspaceIndexPort,
} from "$lib/features/search";
import type { SettingsPort } from "$lib/features/settings";
import type { ShellPort } from "$lib/features/shell";
import type { GitPort } from "$lib/features/git";
import type { VaultPort, VaultSettingsPort } from "$lib/features/vault";
import type { WatcherPort } from "$lib/features/watcher";
import type { UpdaterPort } from "$lib/features/updater";
import type { ThemeFilePort } from "$lib/features/theme";
import type { TagsPort } from "$lib/features/tags";
import type { ProfilePort } from "$lib/features/profile";
import type {
  PressAndHoldPort,
  VimEnginePort,
  VimrcPort,
} from "$lib/features/vim";

export type Ports = {
  vault: VaultPort;
  notes: NotesPort;
  index: WorkspaceIndexPort;
  search: SearchPort;
  vault_find: VaultFindPort;
  settings: SettingsPort;
  vault_settings: VaultSettingsPort;
  session: SessionPort;
  assets: AssetsPort;
  editor: EditorPort;
  clipboard: ClipboardPort;
  shell: ShellPort;
  git: GitPort;
  watcher: WatcherPort;
  updater: UpdaterPort;
  theme_file: ThemeFilePort;
  tags: TagsPort;
  profile: ProfilePort;
  vimrc: VimrcPort;
  vim_engine: VimEnginePort;
  press_and_hold: PressAndHoldPort;
};

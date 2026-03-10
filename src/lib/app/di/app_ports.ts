import type { AssetsPort, NotesPort } from "$lib/features/note";
import type { ClipboardPort } from "$lib/features/clipboard";
import type { EditorPort } from "$lib/features/editor";
import type { SessionPort } from "$lib/features/session";
import type { SearchPort, WorkspaceIndexPort } from "$lib/features/search";
import type { SettingsPort } from "$lib/features/settings";
import type { ShellPort } from "$lib/features/shell";
import type { GitPort } from "$lib/features/git";
import type { VaultPort, VaultSettingsPort } from "$lib/features/vault";
import type { WatcherPort } from "$lib/features/watcher";

export type Ports = {
  vault: VaultPort;
  notes: NotesPort;
  index: WorkspaceIndexPort;
  search: SearchPort;
  settings: SettingsPort;
  vault_settings: VaultSettingsPort;
  session: SessionPort;
  assets: AssetsPort;
  editor: EditorPort;
  clipboard: ClipboardPort;
  shell: ShellPort;
  git: GitPort;
  watcher: WatcherPort;
};

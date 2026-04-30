import { create_app_close_request_reactor } from "$lib/reactors/app_close_request.reactor.svelte";
import { create_editor_sync_reactor } from "$lib/reactors/editor_sync.reactor.svelte";
import { create_editor_width_reactor } from "$lib/reactors/editor_width.reactor.svelte";
import { create_theme_reactor } from "$lib/reactors/theme.reactor.svelte";
import { create_autosave_reactor } from "$lib/reactors/autosave.reactor.svelte";
import { create_op_toast_reactor } from "$lib/reactors/op_toast.reactor.svelte";
import { create_recent_notes_persist_reactor } from "$lib/reactors/recent_notes_persist.reactor.svelte";
import { create_starred_persist_reactor } from "$lib/reactors/starred_persist.reactor.svelte";
import { create_tab_dirty_sync_reactor } from "$lib/reactors/tab_dirty_sync.reactor.svelte";
import { create_session_persist_reactor } from "$lib/reactors/session_persist.reactor.svelte";
import { create_git_autocommit_reactor } from "$lib/reactors/git_autocommit.reactor.svelte";
import { create_recent_commands_persist_reactor } from "$lib/reactors/recent_commands_persist.reactor.svelte";
import { create_find_in_file_reactor } from "$lib/reactors/find_in_file.reactor.svelte";
import { create_backlinks_sync_reactor } from "$lib/reactors/backlinks_sync.reactor.svelte";
import { create_local_links_sync_reactor } from "$lib/reactors/local_links_sync.reactor.svelte";
import { create_watcher_reactor } from "$lib/reactors/watcher.reactor.svelte";
import { create_window_title_reactor } from "$lib/reactors/window_title.reactor.svelte";
import { create_conflict_toast_reactor } from "$lib/reactors/conflict_toast.reactor.svelte";
import { ConflictToastManager } from "$lib/reactors/conflict_toast";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { OpStore } from "$lib/app";
import type { NotesStore } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import type { EditorService } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { VaultService } from "$lib/features/vault";
import type { SettingsService } from "$lib/features/settings";
import type { SessionService } from "$lib/features/session";
import type { TabService } from "$lib/features/tab";
import type { GitStore } from "$lib/features/git";
import type { GitService } from "$lib/features/git";
import type { LinksService } from "$lib/features/links";
import type { SearchStore } from "$lib/features/search";
import type { LinksStore } from "$lib/features/links";
import type { WatcherService } from "$lib/features/watcher";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { UserStore } from "$lib/features/user";
import type { UserService } from "$lib/features/user";
import { create_user_folder_persist_reactor } from "$lib/reactors/user_folder_persist.reactor.svelte";

export type ReactorContext = {
  editor_store: EditorStore;
  ui_store: UIStore;
  op_store: OpStore;
  notes_store: NotesStore;
  search_store: SearchStore;
  vault_store: VaultStore;
  tab_store: TabStore;
  git_store: GitStore;
  links_store: LinksStore;
  user_store: UserStore;
  editor_service: EditorService;
  note_service: NoteService;
  vault_service: VaultService;
  settings_service: SettingsService;
  session_service: SessionService;
  tab_service: TabService;
  git_service: GitService;
  links_service: LinksService;
  watcher_service: WatcherService;
  user_service: UserService;
  action_registry: ActionRegistry;
};

export function mount_reactors(context: ReactorContext): () => void {
  const conflict_toast_manager = new ConflictToastManager();

  const unmounts = [
    create_app_close_request_reactor(
      context.tab_store,
      context.ui_store,
      context.action_registry,
    ),
    create_editor_sync_reactor(
      context.editor_store,
      context.tab_store,
      context.vault_store,
      context.editor_service,
    ),
    create_editor_width_reactor(context.ui_store),
    create_autosave_reactor(
      context.editor_store,
      context.tab_store,
      context.ui_store,
      context.note_service,
      context.tab_service,
    ),
    create_theme_reactor(context.ui_store),
    create_op_toast_reactor(context.op_store),
    create_recent_notes_persist_reactor(
      context.notes_store,
      context.vault_store,
      context.vault_service,
    ),
    create_starred_persist_reactor(
      context.notes_store,
      context.vault_store,
      context.vault_service,
    ),
    create_tab_dirty_sync_reactor(
      context.editor_store,
      context.tab_store,
      context.tab_service,
    ),
    create_conflict_toast_reactor(
      context.editor_store,
      context.tab_store,
      context.tab_service,
      context.note_service,
      conflict_toast_manager,
    ),
    create_session_persist_reactor(
      context.editor_store,
      context.tab_store,
      context.vault_store,
      context.session_service,
    ),
    create_git_autocommit_reactor(
      context.editor_store,
      context.tab_store,
      context.git_store,
      context.ui_store,
      context.git_service,
    ),
    create_recent_commands_persist_reactor(
      context.ui_store,
      context.settings_service,
    ),
    create_find_in_file_reactor(context.ui_store, context.editor_service),
    create_local_links_sync_reactor(
      context.editor_store,
      context.ui_store,
      context.links_service,
    ),
    create_backlinks_sync_reactor(
      context.editor_store,
      context.tab_store,
      context.ui_store,
      context.search_store,
      context.links_store,
      context.links_service,
    ),
    create_window_title_reactor(
      context.vault_store,
      context.tab_store,
      (title) => void getCurrentWindow().setTitle(title),
    ),
    create_watcher_reactor(
      context.vault_store,
      context.editor_store,
      context.tab_store,
      context.tab_service,
      context.note_service,
      context.watcher_service,
      context.action_registry,
    ),
    create_user_folder_persist_reactor(
      context.ui_store,
      context.user_store,
      context.user_service,
    ),
  ];

  return () => {
    for (const unmount of unmounts) {
      unmount();
    }
    conflict_toast_manager.dismiss_all();
  };
}

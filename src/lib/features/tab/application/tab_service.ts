import type { VaultSettingsPort } from "$lib/features/vault";
import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { NotesStore } from "$lib/features/note";
import type { NoteService } from "$lib/features/note";
import type { Tab, PersistedTabState } from "$lib/features/tab/types/tab";
import type { NotePath, VaultId } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("tab_service");
const TABS_KEY = "open_tabs";

export class TabService {
  constructor(
    private readonly vault_settings_port: VaultSettingsPort,
    private readonly vault_store: VaultStore,
    private readonly tab_store: TabStore,
    private readonly notes_store: NotesStore,
    private readonly note_service: NoteService,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private list_known_note_paths(): Set<string> {
    return new Set(this.notes_store.notes.map((note) => note.path));
  }

  private build_persisted_tabs_state(
    known_paths: Set<string>,
  ): PersistedTabState {
    const persistable_tabs = this.tab_store.tabs.filter((tab) =>
      known_paths.has(tab.note_path),
    );
    const active_path = this.tab_store.active_tab?.note_path ?? null;

    return {
      tabs: persistable_tabs.map((tab) => {
        const snapshot = this.tab_store.get_snapshot(tab.id);
        return {
          note_path: tab.note_path,
          is_pinned: tab.is_pinned,
          cursor: snapshot?.cursor ?? null,
        };
      }),
      active_tab_path:
        active_path && known_paths.has(active_path) ? active_path : null,
    };
  }

  private restore_cursor_snapshots(
    tabs: Tab[],
    persisted_tabs: PersistedTabState["tabs"],
  ): void {
    const tab_by_path = new Map(tabs.map((tab) => [tab.note_path, tab]));
    for (const persisted_tab of persisted_tabs) {
      if (!persisted_tab.cursor) {
        continue;
      }

      const tab = tab_by_path.get(persisted_tab.note_path);
      if (!tab) {
        continue;
      }

      this.tab_store.set_snapshot(tab.id, {
        scroll_top: 0,
        cursor: persisted_tab.cursor,
      });
    }
  }

  private resolve_active_tab_id(
    tabs: Tab[],
    active_tab_path: string | null,
  ): string | null {
    if (active_tab_path && tabs.some((tab) => tab.id === active_tab_path)) {
      return active_tab_path;
    }
    return tabs[0]?.id ?? null;
  }

  async save_tabs(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    const known_paths = this.list_known_note_paths();
    const state = this.build_persisted_tabs_state(known_paths);

    try {
      await this.vault_settings_port.set_vault_setting(
        vault_id,
        TABS_KEY,
        state,
      );
    } catch (error) {
      log.error("Save tabs failed", { error });
    }
  }

  sync_dirty_state(tab_id: string, is_dirty: boolean) {
    this.tab_store.set_dirty(tab_id, is_dirty);
  }

  /** Clears cached content for a tab so it re-reads from disk on next activation. */
  invalidate_cache(note_path: NotePath) {
    this.tab_store.invalidate_cache_by_path(note_path);
  }

  /** Closes the tab for the given path. Used by the watcher reactor on external delete. */
  remove_tab(note_path: NotePath) {
    this.tab_store.remove_tab_by_path(note_path);
  }

  async load_tabs(): Promise<PersistedTabState | null> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return null;

    try {
      const stored =
        await this.vault_settings_port.get_vault_setting<PersistedTabState>(
          vault_id,
          TABS_KEY,
        );
      if (!stored || !Array.isArray(stored.tabs)) {
        return null;
      }
      return stored;
    } catch (error) {
      log.error("Load tabs failed", { error });
      return null;
    }
  }

  async restore_tabs(persisted: PersistedTabState): Promise<void> {
    const restored_tabs: Tab[] = persisted.tabs
      .filter(
        (t) => typeof t.note_path === "string" && t.note_path.endsWith(".md"),
      )
      .map((t) => ({
        id: t.note_path,
        note_path: t.note_path,
        title: note_name_from_path(t.note_path),
        is_pinned: Boolean(t.is_pinned),
        is_dirty: false,
      }));

    if (restored_tabs.length === 0) return;

    const active_id = this.resolve_active_tab_id(
      restored_tabs,
      persisted.active_tab_path,
    );
    this.tab_store.restore_tabs(restored_tabs, active_id);
    this.restore_cursor_snapshots(restored_tabs, persisted.tabs);

    if (!active_id) {
      return;
    }

    const active_tab = restored_tabs.find((tab) => tab.id === active_id);
    if (!active_tab) {
      return;
    }

    const result = await this.note_service.open_note(
      active_tab.note_path,
      false,
    );
    if (result.status === "not_found") {
      this.tab_store.remove_tab_by_path(active_tab.note_path);
    }
  }
}

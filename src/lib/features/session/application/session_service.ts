import type { EditorService } from "$lib/features/editor";
import type { EditorStore } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import { is_draft_note_path } from "$lib/features/note";
import type { SessionPort } from "$lib/features/session/ports";
import type { VaultSession } from "$lib/features/session/types/session";
import type { Tab, TabStore } from "$lib/features/tab";
import type { VaultStore } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("session_service");

export class SessionService {
  constructor(
    private readonly session_port: SessionPort,
    private readonly vault_store: VaultStore,
    private readonly tab_store: TabStore,
    private readonly editor_store: EditorStore,
    private readonly editor_service: EditorService,
    private readonly note_service: NoteService,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private resolve_active_open_note(tab: Tab) {
    const open_note = this.editor_store.open_note;
    if (!open_note) {
      return null;
    }
    if (this.tab_store.active_tab_id !== tab.id) {
      return null;
    }
    if (open_note.meta.path !== tab.note_path) {
      return null;
    }
    return open_note;
  }

  private resolve_session_snapshot(tab: Tab) {
    if (this.resolve_active_open_note(tab)) {
      return {
        scroll_top: this.editor_service.get_scroll_top(),
        cursor: this.editor_store.cursor,
      };
    }
    return this.tab_store.get_snapshot(tab.id);
  }

  private resolve_session_cached_note(tab_id: string, tab: Tab) {
    if (!tab.is_dirty && !is_draft_note_path(tab.note_path)) {
      return null;
    }

    return (
      this.resolve_active_open_note(tab) ??
      this.tab_store.get_cached_note(tab_id) ??
      null
    );
  }

  private build_session(): VaultSession {
    return {
      tabs: this.tab_store.tabs.map((tab) => {
        const snapshot = this.resolve_session_snapshot(tab);
        const cached_note = this.resolve_session_cached_note(tab.id, tab);

        return {
          note_path: tab.note_path,
          title: tab.title,
          is_pinned: tab.is_pinned,
          is_dirty: tab.is_dirty,
          scroll_top: snapshot?.scroll_top ?? 0,
          cursor: snapshot?.cursor ?? null,
          cached_note,
        };
      }),
      active_tab_path: this.tab_store.active_tab?.note_path ?? null,
    };
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

  async save_latest_session(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    const flushed = this.editor_service.flush();
    if (flushed) {
      this.editor_store.set_markdown(flushed.note_id, flushed.markdown);
    }

    const session = this.build_session();

    try {
      await this.session_port.save_latest_session(vault_id, session);
    } catch (error) {
      log.error("Save session failed", { error });
    }
  }

  async load_latest_session(): Promise<VaultSession | null> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return null;

    try {
      const stored =
        await this.session_port.load_latest_session<VaultSession>(vault_id);
      if (!stored || !Array.isArray(stored.tabs)) {
        return null;
      }
      return stored;
    } catch (error) {
      log.error("Load session failed", { error });
      return null;
    }
  }

  async restore_latest_session(session: VaultSession): Promise<void> {
    const restored_entries = (
      await Promise.all(
        session.tabs.map(async (entry) => {
          if (typeof entry.note_path !== "string") {
            return null;
          }
          if (is_draft_note_path(entry.note_path)) {
            return entry.cached_note ? entry : null;
          }
          const exists = await this.note_service.note_exists(entry.note_path);
          return exists ? entry : null;
        }),
      )
    ).filter((entry): entry is VaultSession["tabs"][number] => entry !== null);

    const restored_tabs: Tab[] = restored_entries.map((entry) => ({
      id: entry.note_path,
      note_path: entry.note_path,
      title: entry.title || note_name_from_path(entry.note_path),
      is_pinned: Boolean(entry.is_pinned),
      is_dirty: Boolean(entry.is_dirty),
    }));

    if (restored_tabs.length === 0) return;

    const active_id = this.resolve_active_tab_id(
      restored_tabs,
      session.active_tab_path,
    );
    this.tab_store.restore_tabs(restored_tabs, active_id);

    for (const entry of restored_entries) {
      this.tab_store.set_snapshot(entry.note_path, {
        scroll_top: typeof entry.scroll_top === "number" ? entry.scroll_top : 0,
        cursor: entry.cursor ?? null,
      });
      if (entry.cached_note) {
        this.tab_store.set_cached_note(entry.note_path, entry.cached_note);
      }
    }
  }
}

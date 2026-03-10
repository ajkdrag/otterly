import { describe, expect, it, vi } from "vitest";
import { SessionService, type VaultSession } from "$lib/features/session";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import {
  as_markdown_text,
  as_note_path,
  as_vault_id,
} from "$lib/shared/types/ids";
import type { CursorInfo } from "$lib/shared/types/editor";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";

function create_setup() {
  const session_port = {
    load_latest_session: vi.fn().mockResolvedValue(null),
    save_latest_session: vi.fn().mockResolvedValue(undefined),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: as_vault_id("vault-a") }));
  const tab_store = new TabStore();
  const editor_store = new EditorStore();
  const editor_service = {
    flush: vi.fn().mockReturnValue(null),
    get_scroll_top: vi.fn().mockReturnValue(0),
  };
  const note_service = {
    note_exists: vi.fn().mockResolvedValue(true),
  };

  const service = new SessionService(
    session_port,
    vault_store,
    tab_store,
    editor_store,
    editor_service as never,
    note_service as never,
  );

  return {
    service,
    session_port,
    tab_store,
    editor_store,
    editor_service,
    note_service,
  };
}

describe("SessionService", () => {
  describe("save_latest_session", () => {
    it("persists ordered tabs with pins, active tab, scroll, and cursor", async () => {
      const { service, session_port, tab_store } = create_setup();
      const alpha = as_note_path("docs/alpha.md");
      const beta = as_note_path("docs/beta.md");
      const cursor: CursorInfo = {
        line: 2,
        column: 3,
        total_lines: 20,
        total_words: 4,
        anchor: 9,
        head: 9,
      };

      tab_store.open_tab(alpha, "alpha");
      tab_store.open_tab(beta, "beta");
      tab_store.pin_tab(beta);
      tab_store.set_snapshot(beta, { scroll_top: 120, cursor });

      await service.save_latest_session();

      expect(session_port.save_latest_session).toHaveBeenCalledWith(
        as_vault_id("vault-a"),
        {
          tabs: [
            {
              note_path: beta,
              title: "beta",
              is_pinned: true,
              is_dirty: false,
              scroll_top: 120,
              cursor,
              cached_note: null,
            },
            {
              note_path: alpha,
              title: "alpha",
              is_pinned: false,
              is_dirty: false,
              scroll_top: 0,
              cursor: null,
              cached_note: null,
            },
          ],
          active_tab_path: beta,
        },
      );
    });

    it("persists the live active editor state for dirty notes", async () => {
      const { service, session_port, tab_store, editor_store, editor_service } =
        create_setup();
      const note = create_test_note("docs/active", "Active");
      const open_note = {
        ...create_open_note_state(note, "dirty draft"),
        is_dirty: true,
      };
      const cursor: CursorInfo = {
        line: 3,
        column: 5,
        total_lines: 12,
        total_words: 2,
        anchor: 15,
        head: 15,
      };

      tab_store.open_tab(note.path, note.title);
      tab_store.set_dirty(note.path, true);
      editor_store.set_open_note(open_note);
      editor_store.set_cursor(note.id, cursor);
      editor_service.get_scroll_top.mockReturnValue(88);
      editor_service.flush.mockReturnValue({
        note_id: note.id,
        markdown: as_markdown_text("dirty draft"),
      });

      await service.save_latest_session();

      expect(session_port.save_latest_session).toHaveBeenCalledWith(
        as_vault_id("vault-a"),
        {
          tabs: [
            {
              note_path: note.path,
              title: note.title,
              is_pinned: false,
              is_dirty: true,
              scroll_top: 88,
              cursor,
              cached_note: {
                ...open_note,
                markdown: as_markdown_text("dirty draft"),
              },
            },
          ],
          active_tab_path: note.path,
        },
      );
    });

    it("persists draft tabs from cached state", async () => {
      const { service, session_port, tab_store } = create_setup();
      const draft_path = as_note_path("draft:1:Untitled-1");
      const draft_note = {
        meta: {
          id: draft_path,
          path: draft_path,
          name: "Untitled-1",
          title: "Untitled-1",
          mtime_ms: 0,
          size_bytes: 0,
        },
        markdown: as_markdown_text("unsaved"),
        buffer_id: "untitled:1",
        is_dirty: true,
      };

      tab_store.open_tab(draft_path, "Untitled-1");
      tab_store.set_dirty(draft_path, true);
      tab_store.set_cached_note(draft_path, draft_note);

      await service.save_latest_session();

      expect(session_port.save_latest_session).toHaveBeenCalledWith(
        as_vault_id("vault-a"),
        expect.objectContaining({
          tabs: [
            expect.objectContaining({
              note_path: draft_path,
              is_dirty: true,
              cached_note: draft_note,
            }),
          ],
        }),
      );
    });
  });

  describe("restore_latest_session", () => {
    it("restores tabs, snapshots, and dirty cached notes", async () => {
      const { service, tab_store } = create_setup();
      const alpha = as_note_path("docs/alpha.md");
      const beta = as_note_path("docs/beta.md");
      const beta_note = create_test_note("docs/beta", "Beta");
      const beta_cached = {
        ...create_open_note_state(beta_note, "unsaved"),
        is_dirty: true,
      };
      const cursor: CursorInfo = {
        line: 7,
        column: 2,
        total_lines: 20,
        total_words: 10,
        anchor: 42,
        head: 42,
      };

      const session: VaultSession = {
        tabs: [
          {
            note_path: alpha,
            title: "alpha",
            is_pinned: false,
            is_dirty: false,
            scroll_top: 0,
            cursor: null,
            cached_note: null,
          },
          {
            note_path: beta,
            title: "Beta",
            is_pinned: true,
            is_dirty: true,
            scroll_top: 64,
            cursor,
            cached_note: beta_cached,
          },
        ],
        active_tab_path: beta,
      };

      await service.restore_latest_session(session);

      expect(tab_store.tabs).toEqual([
        {
          id: alpha,
          note_path: alpha,
          title: "alpha",
          is_pinned: false,
          is_dirty: false,
        },
        {
          id: beta,
          note_path: beta,
          title: "Beta",
          is_pinned: true,
          is_dirty: true,
        },
      ]);
      expect(tab_store.active_tab_id).toBe(beta);
      expect(tab_store.get_snapshot(beta)).toEqual({
        scroll_top: 64,
        cursor,
      });
      expect(tab_store.get_cached_note(beta)).toEqual(beta_cached);
    });

    it("restores draft tabs without checking disk existence", async () => {
      const { service, tab_store, note_service } = create_setup();
      const draft_path = as_note_path("draft:1:Untitled-1");
      const draft_note = {
        meta: {
          id: draft_path,
          path: draft_path,
          name: "Untitled-1",
          title: "Untitled-1",
          mtime_ms: 0,
          size_bytes: 0,
        },
        markdown: as_markdown_text("draft"),
        buffer_id: "untitled:1",
        is_dirty: true,
      };

      await service.restore_latest_session({
        tabs: [
          {
            note_path: draft_path,
            title: "Untitled-1",
            is_pinned: false,
            is_dirty: true,
            scroll_top: 20,
            cursor: null,
            cached_note: draft_note,
          },
        ],
        active_tab_path: draft_path,
      });

      expect(note_service.note_exists).not.toHaveBeenCalled();
      expect(tab_store.tabs[0]?.id).toBe(draft_path);
      expect(tab_store.get_cached_note(draft_path)).toEqual(draft_note);
    });

    it("skips missing saved notes while preserving order of remaining tabs", async () => {
      const { service, tab_store, note_service } = create_setup();
      note_service.note_exists.mockImplementation((note_path: string) => {
        return note_path !== "docs/missing.md";
      });

      await service.restore_latest_session({
        tabs: [
          {
            note_path: as_note_path("docs/alpha.md"),
            title: "alpha",
            is_pinned: false,
            is_dirty: false,
            scroll_top: 0,
            cursor: null,
            cached_note: null,
          },
          {
            note_path: as_note_path("docs/missing.md"),
            title: "missing",
            is_pinned: false,
            is_dirty: false,
            scroll_top: 0,
            cursor: null,
            cached_note: null,
          },
          {
            note_path: as_note_path("docs/beta.md"),
            title: "beta",
            is_pinned: true,
            is_dirty: false,
            scroll_top: 0,
            cursor: null,
            cached_note: null,
          },
        ],
        active_tab_path: as_note_path("docs/missing.md"),
      });

      expect(tab_store.tabs.map((tab) => tab.id)).toEqual([
        as_note_path("docs/alpha.md"),
        as_note_path("docs/beta.md"),
      ]);
      expect(tab_store.active_tab_id).toBe(as_note_path("docs/alpha.md"));
    });

    it("returns empty state when the session has no restorable tabs", async () => {
      const { service, tab_store, note_service } = create_setup();
      note_service.note_exists.mockResolvedValue(false);

      await service.restore_latest_session({
        tabs: [
          {
            note_path: as_note_path("docs/missing.md"),
            title: "missing",
            is_pinned: false,
            is_dirty: false,
            scroll_top: 0,
            cursor: null,
            cached_note: null,
          },
        ],
        active_tab_path: as_note_path("docs/missing.md"),
      });

      expect(tab_store.tabs).toEqual([]);
      expect(tab_store.active_tab_id).toBeNull();
    });
  });

  describe("load_latest_session", () => {
    it("reads the latest session from the session port", async () => {
      const { service, session_port } = create_setup();
      const session: VaultSession = {
        tabs: [],
        active_tab_path: null,
      };
      session_port.load_latest_session.mockResolvedValueOnce(session);

      const result = await service.load_latest_session();

      expect(session_port.load_latest_session).toHaveBeenCalledWith(
        as_vault_id("vault-a"),
      );
      expect(result).toEqual(session);
    });

    it("returns null when no saved session exists", async () => {
      const { service, session_port } = create_setup();
      session_port.load_latest_session.mockResolvedValueOnce(null);

      const result = await service.load_latest_session();

      expect(result).toBeNull();
    });
  });
});

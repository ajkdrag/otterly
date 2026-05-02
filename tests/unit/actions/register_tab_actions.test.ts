import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_folder_actions } from "$lib/features/folder/application/folder_actions";
import {
  register_tab_actions,
  ensure_tab_capacity,
} from "$lib/features/tab/application/tab_actions";
import { register_note_actions } from "$lib/features/note/application/note_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { UserStore } from "$lib/features/user";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { NotePath } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { create_test_vault } from "../helpers/test_fixtures";

function np(path: string): NotePath {
  return as_note_path(path);
}

function mock_open_note(path: string): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path,
      title: path.replace(".md", ""),
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty: false,
  };
}

function mock_draft_open_note(
  path: string,
  title: string = "Untitled-1",
): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: title,
      title,
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text(""),
    buffer_id: `buffer:${path}`,
    is_dirty: false,
  };
}

function create_tab_actions_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    user: new UserStore(),
  };
  stores.vault.set_vault(create_test_vault());

  const services = {
    vault: {},
    note: {
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "",
      }),
      save_note: vi.fn().mockResolvedValue({ status: "saved" }),
      skip_mtime_guard: vi.fn(),
      write_note_content: vi.fn().mockResolvedValue(undefined),
      reset_save_operation: vi.fn(),
      reset_asset_write_operation: vi.fn(),
      reset_delete_operation: vi.fn(),
      reset_rename_operation: vi.fn(),
    },
    folder: {},
    settings: {},
    search: {},
    editor: {
      flush: vi.fn().mockReturnValue(null),
      get_scroll_top: vi.fn().mockReturnValue(0),
      get_code_block_heights: vi.fn().mockReturnValue([]),
      set_scroll_top: vi.fn(),
      restore_view_state: vi.fn(),
      set_code_block_heights: vi.fn(),
      close_buffer: vi.fn(),
    },
    clipboard: {
      copy_text: vi.fn().mockResolvedValue(undefined),
    },
    shell: {},
    tab: {},
  };

  register_tab_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  register_folder_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  register_note_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services };
}

describe("register_tab_actions", () => {
  describe("tab_activate", () => {
    it("activates a specific tab by id", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");

      await registry.execute(ACTION_IDS.tab_activate, "a.md");

      expect(stores.tab.active_tab_id).toBe("a.md");
    });

    it("does nothing for unknown tab id", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");

      await registry.execute(ACTION_IDS.tab_activate, "missing.md");

      expect(stores.tab.active_tab_id).toBe("a.md");
    });
  });

  describe("note cache integration", () => {
    it("capture_active_tab_snapshot caches the open note", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.editor.set_open_note(mock_open_note("b.md"));

      await registry.execute(ACTION_IDS.tab_activate, "a.md");

      expect(stores.tab.get_cached_note("b.md")).not.toBeNull();
    });

    it("switching away from a dirty tab saves the note", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");
      stores.tab.set_dirty("a.md", true);

      const dirty_note = { ...mock_open_note("a.md"), is_dirty: true };
      stores.editor.set_open_note(dirty_note);

      await registry.execute(ACTION_IDS.tab_activate, "b.md");

      expect(services.note.save_note).toHaveBeenCalledWith(null, true);
    });

    it("switching away from a dirty tab refreshes cached state after save", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");
      stores.tab.set_dirty("a.md", true);

      stores.editor.set_open_note({
        ...mock_open_note("a.md"),
        markdown: as_markdown_text("updated"),
        is_dirty: true,
        meta: {
          ...mock_open_note("a.md").meta,
          mtime_ms: 10,
        },
      });

      services.note.save_note.mockImplementation(() => {
        stores.editor.mark_clean(np("a.md"), 99);
        return {
          status: "saved",
          saved_path: np("a.md"),
          saved_mtime_ms: 99,
        };
      });

      await registry.execute(ACTION_IDS.tab_activate, "b.md");

      expect(stores.tab.get_cached_note("a.md")).toEqual({
        ...stores.editor.open_note,
      });
      expect(stores.tab.get_cached_note("a.md")?.is_dirty).toBe(false);
      expect(stores.tab.get_cached_note("a.md")?.meta.mtime_ms).toBe(99);
      expect(stores.tab.find_tab_by_path(np("a.md"))?.is_dirty).toBe(false);
    });

    it("switching away from a dirty tab does not save when autosave is disabled", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.ui.editor_settings = {
        ...stores.ui.editor_settings,
        autosave_enabled: false,
      };
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");

      const dirty_note = { ...mock_open_note("a.md"), is_dirty: true };
      stores.editor.set_open_note(dirty_note);

      await registry.execute(ACTION_IDS.tab_activate, "b.md");

      expect(services.note.save_note).not.toHaveBeenCalled();
    });

    it("switching away from a clean tab does not save", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");
      stores.editor.set_open_note(mock_open_note("a.md"));

      await registry.execute(ACTION_IDS.tab_activate, "b.md");

      expect(services.note.save_note).not.toHaveBeenCalled();
    });

    it("tab switch uses cached note instead of hitting disk", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");
      stores.tab.set_cached_note("a.md", mock_open_note("a.md"));
      stores.editor.set_open_note(mock_open_note("a.md"));

      await registry.execute(ACTION_IDS.tab_activate, "b.md");
      stores.editor.set_open_note(mock_open_note("b.md"));
      const open_note_calls_before = services.note.open_note.mock.calls.length;

      await registry.execute(ACTION_IDS.tab_activate, "a.md");

      expect(services.note.open_note.mock.calls.length).toBe(
        open_note_calls_before,
      );
      expect(stores.editor.open_note?.meta.path).toBe("a.md");
    });

    it("close_tab_immediate clears cache for closed tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_cached_note("a.md", mock_open_note("a.md"));

      await registry.execute(ACTION_IDS.tab_close);

      expect(stores.tab.get_cached_note("a.md")).toBeNull();
    });
  });

  describe("tab_activate_by_index", () => {
    it("switches to tab by numeric index", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.open_tab(np("c.md"), "c");

      await registry.execute(ACTION_IDS.tab_activate_by_index, 0);

      expect(stores.tab.active_tab_id).toBe("a.md");
    });

    it("does nothing for out-of-range index", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");

      await registry.execute(ACTION_IDS.tab_activate_by_index, 5);

      expect(stores.tab.active_tab_id).toBe("a.md");
    });
  });

  describe("tab_close", () => {
    it("closes clean tab immediately", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");

      await registry.execute(ACTION_IDS.tab_close);

      expect(stores.tab.tabs).toHaveLength(1);
      expect(stores.tab.tabs[0]?.id).toBe("a.md");
    });

    it("shows confirmation dialog for dirty tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);

      await registry.execute(ACTION_IDS.tab_close);

      expect(stores.ui.tab_close_confirm.open).toBe(true);
      expect(stores.ui.tab_close_confirm.tab_id).toBe("a.md");
      expect(stores.tab.tabs).toHaveLength(1);
    });

    it("does not close pinned tab via keyboard shortcut", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.pin_tab("a.md");

      await registry.execute(ACTION_IDS.tab_close);

      expect(stores.tab.tabs).toHaveLength(1);
    });

    it("closes pinned tab when tab_id is explicitly provided", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.pin_tab("a.md");

      await registry.execute(ACTION_IDS.tab_close, "a.md");

      expect(stores.tab.tabs).toHaveLength(0);
    });
  });

  describe("tab_close_other", () => {
    it("closes all tabs except specified one", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.open_tab(np("c.md"), "c");

      await registry.execute(ACTION_IDS.tab_close_other, "b.md");

      expect(stores.tab.tabs).toHaveLength(1);
      expect(stores.tab.tabs[0]?.id).toBe("b.md");
    });
  });

  describe("tab_next / tab_prev", () => {
    it("cycles to next tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.open_tab(np("c.md"), "c");
      stores.tab.activate_tab("a.md");

      await registry.execute(ACTION_IDS.tab_next);

      expect(stores.tab.active_tab_id).toBe("b.md");
    });

    it("wraps from last to first tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");

      await registry.execute(ACTION_IDS.tab_next);

      expect(stores.tab.active_tab_id).toBe("a.md");
    });

    it("cycles to previous tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.open_tab(np("c.md"), "c");
      stores.tab.activate_tab("b.md");

      await registry.execute(ACTION_IDS.tab_prev);

      expect(stores.tab.active_tab_id).toBe("a.md");
    });

    it("wraps from first to last tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");

      await registry.execute(ACTION_IDS.tab_prev);

      expect(stores.tab.active_tab_id).toBe("b.md");
    });
  });

  describe("tab_reopen_closed", () => {
    it("reopens the last closed tab from history", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.push_closed_history({
        note_path: np("closed.md"),
        title: "closed",
        scroll_top: 50,
        cursor: null,
        code_block_heights: [],
        draft_note: null,
      });

      await registry.execute(ACTION_IDS.tab_reopen_closed);

      expect(stores.tab.tabs.map((t) => t.id)).toContain("closed.md");
      expect(services.note.open_note).toHaveBeenCalledWith("closed.md", false);
    });

    it("reopens a tab closed by close_other_tabs", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("b.md");
      stores.editor.set_open_note(mock_open_note("b.md"));

      await registry.execute(ACTION_IDS.tab_close_other, "b.md");
      await registry.execute(ACTION_IDS.tab_reopen_closed);

      expect(stores.tab.tabs.map((tab) => tab.id)).toContain("a.md");
      expect(services.note.open_note).toHaveBeenCalledWith("a.md", false);
    });

    it("restores an untitled draft from closed history", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      const draft_path = np("draft:1:Untitled-1");
      const untitled_note = {
        ...mock_draft_open_note("draft:1:Untitled-1"),
        buffer_id: "untitled-buffer",
        markdown: as_markdown_text("draft"),
        is_dirty: true,
      };

      stores.tab.open_tab(np("other.md"), "other");
      stores.editor.set_open_note(mock_open_note("other.md"));
      stores.tab.push_closed_history({
        note_path: draft_path,
        title: "Untitled-1",
        scroll_top: 0,
        cursor: null,
        code_block_heights: [],
        draft_note: untitled_note,
      });

      await registry.execute(ACTION_IDS.tab_reopen_closed);

      expect(stores.tab.active_tab_id).toBe(draft_path);
      expect(stores.editor.open_note?.meta.path).toBe(draft_path);
      expect(stores.editor.open_note?.markdown).toBe(as_markdown_text("draft"));
      expect(stores.tab.active_tab?.is_dirty).toBe(true);
      expect(services.note.open_note).not.toHaveBeenCalledWith(
        draft_path,
        false,
      );
    });
  });

  describe("tab_pin / tab_unpin", () => {
    it("pins and unpins a tab", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");

      await registry.execute(ACTION_IDS.tab_pin, "a.md");
      expect(stores.tab.tabs[0]?.is_pinned).toBe(true);

      await registry.execute(ACTION_IDS.tab_unpin, "a.md");
      expect(stores.tab.tabs[0]?.is_pinned).toBe(false);
    });
  });

  describe("tab_move_left / tab_move_right", () => {
    it("moves active tab right", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("a.md");

      await registry.execute(ACTION_IDS.tab_move_right);

      expect(stores.tab.tabs.map((t) => t.id)).toEqual(["b.md", "a.md"]);
    });

    it("moves active tab left", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("b.md");

      await registry.execute(ACTION_IDS.tab_move_left);

      expect(stores.tab.tabs.map((t) => t.id)).toEqual(["b.md", "a.md"]);
    });
  });

  describe("tab close confirm flow", () => {
    it("saves and closes tab via confirm_close_save", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: "a.md",
        tab_title: "a",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_save);

      expect(stores.ui.tab_close_confirm.open).toBe(false);
      expect(services.note.save_note).toHaveBeenCalledWith(null, true);
      expect(stores.tab.tabs).toHaveLength(0);
    });

    it("skips the mtime guard before saving a conflicted active tab", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);
      stores.tab.mark_conflict(np("a.md"));
      stores.editor.set_open_note({
        ...mock_open_note("a.md"),
        is_dirty: true,
      });

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: "a.md",
        tab_title: "a",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_save);

      expect(services.note.skip_mtime_guard).toHaveBeenCalledWith("a.md");
      expect(services.note.save_note).toHaveBeenCalledWith(null, true);
      expect(stores.tab.tabs).toHaveLength(0);
    });

    it("does not close the tab when save fails", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);
      services.note.save_note.mockResolvedValueOnce({
        status: "conflict",
      });

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: "a.md",
        tab_title: "a",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_save);

      expect(stores.ui.tab_close_confirm.open).toBe(true);
      expect(stores.tab.tabs).toHaveLength(1);
    });

    it("routes untitled save-and-close through the save dialog", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      const draft_path = np("draft:1:Untitled-1");
      stores.tab.open_tab(draft_path, "Untitled-1");
      stores.tab.set_dirty(draft_path, true);
      stores.editor.set_open_note({
        ...mock_draft_open_note("draft:1:Untitled-1"),
        buffer_id: "untitled-buffer",
        is_dirty: true,
      });

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: draft_path,
        tab_title: "Untitled-1",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_save);

      expect(stores.ui.tab_close_confirm.open).toBe(false);
      expect(stores.ui.save_note_dialog.open).toBe(true);
      expect(stores.ui.save_note_dialog.source).toBe("tab_close");
      expect(services.note.save_note).not.toHaveBeenCalledWith(null, true);
    });

    it("closes an untitled tab after save dialog confirmation", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      const draft_path = np("draft:1:Untitled-1");
      stores.tab.open_tab(draft_path, "Untitled-1");
      stores.tab.set_dirty(draft_path, true);
      stores.editor.set_open_note({
        ...mock_draft_open_note("draft:1:Untitled-1"),
        buffer_id: "untitled-buffer",
        is_dirty: true,
      });
      services.note.save_note
        .mockImplementationOnce(() => {
          stores.editor.set_open_note({
            ...mock_open_note("saved.md"),
            is_dirty: false,
          });
          return Promise.resolve({
            status: "saved",
            saved_path: np("saved.md"),
          });
        })
        .mockResolvedValueOnce({
          status: "saved",
          saved_path: np("saved.md"),
        });

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: draft_path,
        tab_title: "Untitled-1",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_save);
      stores.ui.save_note_dialog.new_path = np("saved.md");
      await registry.execute(ACTION_IDS.note_confirm_save);

      expect(stores.tab.find_tab_by_path(np("saved.md"))).toBeNull();
      expect(stores.ui.save_note_dialog.open).toBe(false);
    });

    it("discards and closes tab via confirm_close_discard", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);
      stores.tab.mark_conflict(np("a.md"));

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: "a.md",
        tab_title: "a",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_confirm_close_discard);

      expect(stores.ui.tab_close_confirm.open).toBe(false);
      expect(stores.tab.tabs).toHaveLength(0);
      expect(stores.tab.has_conflict(np("a.md"))).toBe(false);
    });

    it("cancels close via tab_cancel_close", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);
      stores.tab.mark_conflict(np("a.md"));

      stores.ui.tab_close_confirm = {
        open: true,
        tab_id: "a.md",
        tab_title: "a",
        pending_dirty_tab_ids: [],
        close_mode: "single",
        keep_tab_id: null,
        apply_to_all: false,
      };

      await registry.execute(ACTION_IDS.tab_cancel_close);

      expect(stores.ui.tab_close_confirm.open).toBe(false);
      expect(stores.tab.tabs).toHaveLength(1);
      expect(stores.tab.has_conflict(np("a.md"))).toBe(true);
    });

    it("discarding close-other closes the removed tab buffer", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.set_dirty("a.md", true);
      stores.tab.set_cached_note("a.md", {
        ...mock_open_note("a.md"),
        markdown: as_markdown_text("draft"),
        is_dirty: true,
      });
      stores.tab.activate_tab("b.md");
      stores.editor.set_open_note(mock_open_note("b.md"));

      await registry.execute(ACTION_IDS.tab_close_other, "b.md");
      await registry.execute(ACTION_IDS.tab_confirm_close_discard);

      expect(services.editor.close_buffer).toHaveBeenCalledWith("a.md");
      expect(stores.tab.find_tab_by_path(np("a.md"))).toBeNull();
      expect(stores.tab.get_cached_note("a.md")).toBeNull();
    });

    it("discarding close-other records the removed tab for reopen", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.set_dirty("a.md", true);
      stores.tab.set_cached_note("a.md", {
        ...mock_open_note("a.md"),
        markdown: as_markdown_text("draft"),
        is_dirty: true,
      });
      stores.tab.activate_tab("b.md");
      stores.editor.set_open_note(mock_open_note("b.md"));

      await registry.execute(ACTION_IDS.tab_close_other, "b.md");
      await registry.execute(ACTION_IDS.tab_confirm_close_discard);
      await registry.execute(ACTION_IDS.tab_reopen_closed);

      expect(stores.tab.tabs.map((tab) => tab.id)).toContain("a.md");
      expect(services.note.open_note).toHaveBeenCalledWith("a.md", false);
    });
  });

  describe("multi-close buffer cleanup", () => {
    it("close_other_tabs closes removed tab buffers on the clean path", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.activate_tab("b.md");
      stores.editor.set_open_note(mock_open_note("b.md"));

      await registry.execute(ACTION_IDS.tab_close_other, "b.md");

      expect(services.editor.close_buffer).toHaveBeenCalledWith("a.md");
    });
  });

  describe("ensure_tab_capacity", () => {
    it("returns true when under limit", () => {
      const { stores, services } = create_tab_actions_harness();
      stores.ui.editor_settings = {
        ...stores.ui.editor_settings,
        max_open_tabs: 5,
      };
      stores.tab.open_tab(np("a.md"), "a");

      const result = ensure_tab_capacity({
        registry: new ActionRegistry(),
        stores,
        services: services as never,
        default_mount_config: {
          reset_app_state: true,
          bootstrap_default_vault_path: null,
        },
      });

      expect(result).toBe(true);
      expect(stores.tab.tabs).toHaveLength(1);
    });

    it("evicts oldest clean tab when at limit", () => {
      const { stores, services } = create_tab_actions_harness();
      stores.ui.editor_settings = {
        ...stores.ui.editor_settings,
        max_open_tabs: 3,
      };
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.open_tab(np("c.md"), "c");
      stores.tab.activate_tab("c.md");

      const result = ensure_tab_capacity({
        registry: new ActionRegistry(),
        stores,
        services: services as never,
        default_mount_config: {
          reset_app_state: true,
          bootstrap_default_vault_path: null,
        },
      });

      expect(result).toBe(true);
      expect(stores.tab.tabs).toHaveLength(2);
      expect(stores.tab.find_tab_by_path(np("a.md"))).toBeNull();
      expect(stores.tab.closed_tab_history).toHaveLength(1);
      expect(stores.tab.closed_tab_history[0]?.note_path).toBe("a.md");
    });

    it("returns false when all tabs are dirty or pinned", () => {
      const { stores, services } = create_tab_actions_harness();
      stores.ui.editor_settings = {
        ...stores.ui.editor_settings,
        max_open_tabs: 2,
      };
      stores.tab.open_tab(np("a.md"), "a");
      stores.tab.set_dirty("a.md", true);
      stores.tab.open_tab(np("b.md"), "b");
      stores.tab.pin_tab("b.md");
      stores.tab.activate_tab("a.md");

      const result = ensure_tab_capacity({
        registry: new ActionRegistry(),
        stores,
        services: services as never,
        default_mount_config: {
          reset_app_state: true,
          bootstrap_default_vault_path: null,
        },
      });

      expect(result).toBe(false);
      expect(stores.tab.tabs).toHaveLength(2);
    });
  });

  describe("tab_copy_path", () => {
    it("copies file path to clipboard", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.tab.open_tab(np("docs/note.md"), "note");

      await registry.execute(ACTION_IDS.tab_copy_path, "docs/note.md");

      expect(services.clipboard.copy_text).toHaveBeenCalledWith("docs/note.md");
    });
  });

  describe("tab_reveal_in_tree", () => {
    it("delegates to filetree reveal and expands ancestor folders", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.tab.open_tab(np("docs/specs/note.md"), "note");

      stores.editor.set_open_note(mock_open_note("other.md"));

      await registry.execute(
        ACTION_IDS.tab_reveal_in_tree,
        "docs/specs/note.md",
      );

      expect(stores.ui.sidebar_view).toBe("explorer");
      expect(stores.ui.selected_folder_path).toBe("docs/specs");
      expect(stores.ui.filetree_revealed_note_path).toBe("docs/specs/note.md");
      expect(stores.ui.filetree.expanded_paths.has("docs")).toBe(true);
      expect(stores.ui.filetree.expanded_paths.has("docs/specs")).toBe(true);
    });
  });

  describe("filetree_reveal_note", () => {
    it("reveals root-level note without expanding folders", async () => {
      const { registry, stores } = create_tab_actions_harness();

      await registry.execute(ACTION_IDS.filetree_reveal_note, {
        note_path: "root.md",
      });

      expect(stores.ui.sidebar_view).toBe("explorer");
      expect(stores.ui.selected_folder_path).toBe("");
      expect(stores.ui.filetree_revealed_note_path).toBe("root.md");
      expect(stores.ui.filetree.expanded_paths.size).toBe(0);
    });
  });

  describe("filetree scope", () => {
    it("scopes explorer to a folder", async () => {
      const { registry, stores } = create_tab_actions_harness();

      await registry.execute(ACTION_IDS.filetree_scope_to_folder, "docs/specs");

      expect(stores.ui.filetree_scoped_root_path).toBe("docs/specs");
      expect(stores.ui.sidebar_view).toBe("explorer");
    });

    it("clears explorer scope", async () => {
      const { registry, stores } = create_tab_actions_harness();
      stores.ui.set_filetree_scoped_root_path("docs");

      await registry.execute(ACTION_IDS.filetree_clear_scope);

      expect(stores.ui.filetree_scoped_root_path).toBeNull();
    });

    it("remaps scope after folder rename", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.ui.rename_folder_dialog = {
        open: true,
        folder_path: "docs",
        new_name: "guides",
      };
      stores.ui.set_filetree_scoped_root_path("docs/specs");
      (services.folder as Record<string, unknown>).rename_folder = vi
        .fn()
        .mockResolvedValue({ status: "success" });
      (services.folder as Record<string, unknown>).apply_folder_rename =
        vi.fn();
      (services.folder as Record<string, unknown>).rename_folder_index = vi
        .fn()
        .mockResolvedValue(undefined);

      await registry.execute(ACTION_IDS.folder_confirm_rename);

      expect(stores.ui.filetree_scoped_root_path).toBe("guides/specs");
    });

    it("clears scope when scoped folder is deleted", async () => {
      const { registry, stores, services } = create_tab_actions_harness();
      stores.ui.delete_folder_dialog = {
        open: true,
        folder_path: "docs",
        affected_note_count: 0,
        affected_folder_count: 0,
        status: "confirming",
      };
      stores.ui.set_filetree_scoped_root_path("docs/specs");
      (services.folder as Record<string, unknown>).delete_folder = vi
        .fn()
        .mockResolvedValue({ status: "success" });
      (services.folder as Record<string, unknown>).remove_notes_by_prefix = vi
        .fn()
        .mockResolvedValue(undefined);

      await registry.execute(ACTION_IDS.folder_confirm_delete);

      expect(stores.ui.filetree_scoped_root_path).toBeNull();
    });
  });
});

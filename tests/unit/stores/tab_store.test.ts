import { describe, expect, it } from "vitest";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { NotePath } from "$lib/shared/types/ids";

function np(path: string): NotePath {
  return as_note_path(path);
}

function mock_open_note(path: string): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path.replace(".md", ""),
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty: false,
  };
}

describe("TabStore", () => {
  describe("open_tab", () => {
    it("opens a new tab and activates it", () => {
      const store = new TabStore();
      const tab = store.open_tab(np("docs/a.md"), "a");

      expect(store.tabs).toHaveLength(1);
      expect(tab.id).toBe("docs/a.md");
      expect(tab.kind).toBe("note");
      if (tab.kind === "note") expect(tab.note_path).toBe("docs/a.md");
      expect(tab.title).toBe("a");
      expect(store.active_tab_id).toBe("docs/a.md");
    });

    it("activates existing tab instead of creating duplicate", () => {
      const store = new TabStore();
      store.open_tab(np("docs/a.md"), "a");
      store.open_tab(np("docs/b.md"), "b");
      const returned = store.open_tab(np("docs/a.md"), "a");

      expect(store.tabs).toHaveLength(2);
      expect(store.active_tab_id).toBe("docs/a.md");
      expect(returned.id).toBe("docs/a.md");
    });

    it("deduplicates tabs case-insensitively", () => {
      const store = new TabStore();
      store.open_tab(np("docs/alpha.md"), "alpha");
      const returned = store.open_tab(np("DOCS/ALPHA.md"), "ALPHA");

      expect(store.tabs).toHaveLength(1);
      expect(store.active_tab_id).toBe("docs/alpha.md");
      expect(returned.id).toBe("docs/alpha.md");
    });

    it("appends new tabs at the end", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      expect(store.tabs.map((t) => t.id)).toEqual(["a.md", "b.md", "c.md"]);
    });
  });

  describe("open_document_tab", () => {
    it("creates a document tab with correct fields", () => {
      const store = new TabStore();
      const tab = store.open_document_tab(
        "/docs/report.pdf",
        "report.pdf",
        "pdf",
      );

      expect(store.tabs).toHaveLength(1);
      expect(tab.kind).toBe("document");
      expect(tab.id).toBe("/docs/report.pdf");
      expect(tab.is_dirty).toBe(false);
      if (tab.kind === "document") {
        expect(tab.file_path).toBe("/docs/report.pdf");
        expect(tab.file_type).toBe("pdf");
      }
      expect(tab.title).toBe("report.pdf");
      expect(store.active_tab_id).toBe("/docs/report.pdf");
    });

    it("activates existing document tab if same file_path", () => {
      const store = new TabStore();
      store.open_document_tab("/docs/a.pdf", "a.pdf", "pdf");
      store.open_tab(np("notes/b.md"), "b");
      const returned = store.open_document_tab("/docs/a.pdf", "a.pdf", "pdf");

      expect(store.tabs).toHaveLength(2);
      expect(store.active_tab_id).toBe("/docs/a.pdf");
      expect(returned.id).toBe("/docs/a.pdf");
    });

    it("document tab is_dirty is always false", () => {
      const store = new TabStore();
      const tab = store.open_document_tab("/x.pdf", "x.pdf", "pdf");

      expect(tab.is_dirty).toBe(false);
    });

    it("document tabs appear in MRU order", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_document_tab("/b.pdf", "b.pdf", "pdf");

      expect(store.mru_order[0]).toBe("/b.pdf");
      expect(store.mru_order[1]).toBe("a.md");
    });
  });

  describe("close_tab", () => {
    it("closes a tab and activates next tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.activate_tab("b.md");

      store.close_tab("b.md");

      expect(store.tabs).toHaveLength(2);
      expect(store.active_tab_id).toBe("c.md");
    });

    it("activates previous tab when last tab is closed", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");

      store.close_tab("b.md");

      expect(store.active_tab_id).toBe("a.md");
    });

    it("sets active to null when all tabs closed", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");

      store.close_tab("a.md");

      expect(store.tabs).toHaveLength(0);
      expect(store.active_tab_id).toBeNull();
    });

    it("does not change active when closing inactive tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.close_tab("a.md");

      expect(store.active_tab_id).toBe("c.md");
    });

    it("cleans up editor snapshot on close", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_snapshot("a.md", { scroll_top: 100, cursor: null });

      store.close_tab("a.md");

      expect(store.get_snapshot("a.md")).toBeNull();
    });

    it("cleans up note cache on close", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_cached_note("a.md", mock_open_note("a.md"));

      store.close_tab("a.md");

      expect(store.get_cached_note("a.md")).toBeNull();
    });
  });

  describe("close_other_tabs", () => {
    it("closes all tabs except the specified one", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.close_other_tabs("b.md");

      expect(store.tabs).toHaveLength(1);
      expect(store.tabs[0]?.id).toBe("b.md");
      expect(store.active_tab_id).toBe("b.md");
    });

    it("keeps pinned tabs when closing others", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.pin_tab("a.md");

      store.close_other_tabs("b.md");

      expect(store.tabs).toHaveLength(2);
      expect(store.tabs.map((t) => t.id)).toEqual(["a.md", "b.md"]);
    });

    it("cleans up note cache for closed tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.set_cached_note("a.md", mock_open_note("a.md"));
      store.set_cached_note("b.md", mock_open_note("b.md"));
      store.set_cached_note("c.md", mock_open_note("c.md"));

      store.close_other_tabs("b.md");

      expect(store.get_cached_note("a.md")).toBeNull();
      expect(store.get_cached_note("b.md")?.meta.path).toBe("b.md");
      expect(store.get_cached_note("c.md")).toBeNull();
    });
  });

  describe("close_tabs_to_right", () => {
    it("closes tabs to the right of specified tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.open_tab(np("d.md"), "d");

      store.close_tabs_to_right("b.md");

      expect(store.tabs.map((t) => t.id)).toEqual(["a.md", "b.md"]);
    });

    it("activates the reference tab if active was removed", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.close_tabs_to_right("a.md");

      expect(store.active_tab_id).toBe("a.md");
    });

    it("cleans up note cache for closed tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.set_cached_note("a.md", mock_open_note("a.md"));
      store.set_cached_note("b.md", mock_open_note("b.md"));
      store.set_cached_note("c.md", mock_open_note("c.md"));

      store.close_tabs_to_right("a.md");

      expect(store.get_cached_note("a.md")?.meta.path).toBe("a.md");
      expect(store.get_cached_note("b.md")).toBeNull();
      expect(store.get_cached_note("c.md")).toBeNull();
    });
  });

  describe("close_all_tabs", () => {
    it("removes all tabs and resets state", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.set_snapshot("a.md", { scroll_top: 50, cursor: null });

      store.close_all_tabs();

      expect(store.tabs).toHaveLength(0);
      expect(store.active_tab_id).toBeNull();
      expect(store.editor_snapshots.size).toBe(0);
    });

    it("clears note cache", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.set_cached_note("a.md", mock_open_note("a.md"));
      store.set_cached_note("b.md", mock_open_note("b.md"));

      store.close_all_tabs();

      expect(store.get_cached_note("a.md")).toBeNull();
      expect(store.get_cached_note("b.md")).toBeNull();
      expect(store.note_cache.size).toBe(0);
    });
  });

  describe("dirty state", () => {
    it("sets and reads dirty state", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");

      store.set_dirty("a.md", true);

      expect(store.tabs[0]?.is_dirty).toBe(true);
    });

    it("get_dirty_tabs returns only dirty tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.set_dirty("a.md", true);

      const dirty = store.get_dirty_tabs();

      expect(dirty).toHaveLength(1);
      expect(dirty[0]?.id).toBe("a.md");
    });
  });

  describe("pin_tab / unpin_tab", () => {
    it("pins a tab and moves it to the leftmost position", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.pin_tab("c.md");

      expect(store.tabs[0]?.id).toBe("c.md");
      expect(store.tabs[0]?.is_pinned).toBe(true);
    });

    it("unpins a tab and moves it after pinned tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.pin_tab("a.md");
      store.pin_tab("b.md");

      store.unpin_tab("a.md");

      expect(store.tabs[0]?.id).toBe("b.md");
      expect(store.tabs[0]?.is_pinned).toBe(true);
      expect(store.tabs[1]?.id).toBe("a.md");
      expect(store.tabs[1]?.is_pinned).toBe(false);
    });
  });

  describe("reorder_tab", () => {
    it("moves tab from one position to another", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.reorder_tab(2, 0);

      expect(store.tabs.map((t) => t.id)).toEqual(["c.md", "a.md", "b.md"]);
    });

    it("does not reorder pinned and unpinned tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.pin_tab("a.md");

      store.reorder_tab(0, 1);

      expect(store.tabs.map((t) => t.id)).toEqual(["a.md", "b.md"]);
    });

    it("ignores out-of-bounds indices", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");

      store.reorder_tab(-1, 0);
      store.reorder_tab(0, 5);

      expect(store.tabs).toHaveLength(1);
    });
  });

  describe("move_tab_left / move_tab_right", () => {
    it("moves active tab left", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");

      store.move_tab_right("a.md");

      expect(store.tabs.map((t) => t.id)).toEqual(["b.md", "a.md", "c.md"]);
    });

    it("does not move tab past the beginning", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");

      store.move_tab_left("a.md");

      expect(store.tabs.map((t) => t.id)).toEqual(["a.md", "b.md"]);
    });
  });

  describe("update_tab_path", () => {
    it("updates tab id, path, and title on rename", () => {
      const store = new TabStore();
      store.open_tab(np("docs/old.md"), "old");
      store.activate_tab("docs/old.md");

      store.update_tab_path(np("docs/old.md"), np("docs/new.md"));

      const tab = store.tabs[0];
      expect(tab?.id).toBe("docs/new.md");
      expect(tab?.kind === "note" && tab.note_path).toBe("docs/new.md");
      expect(tab?.title).toBe("new");
      expect(store.active_tab_id).toBe("docs/new.md");
    });

    it("migrates editor snapshot to new path", () => {
      const store = new TabStore();
      store.open_tab(np("old.md"), "old");
      store.set_snapshot("old.md", { scroll_top: 42, cursor: null });

      store.update_tab_path(np("old.md"), np("new.md"));

      expect(store.get_snapshot("old.md")).toBeNull();
      expect(store.get_snapshot("new.md")?.scroll_top).toBe(42);
    });

    it("migrates note cache to new path", () => {
      const store = new TabStore();
      store.open_tab(np("old.md"), "old");
      store.set_cached_note("old.md", mock_open_note("old.md"));

      store.update_tab_path(np("old.md"), np("new.md"));

      expect(store.get_cached_note("old.md")).toBeNull();
      expect(store.get_cached_note("new.md")?.meta.path).toBe("old.md");
    });
  });

  describe("update_tab_path_prefix", () => {
    it("updates all tabs matching prefix on folder rename", () => {
      const store = new TabStore();
      store.open_tab(np("docs/a.md"), "a");
      store.open_tab(np("docs/b.md"), "b");
      store.open_tab(np("other/c.md"), "c");
      store.activate_tab("docs/a.md");

      store.update_tab_path_prefix("docs/", "notes/");

      expect(
        store.tabs.map((t) => (t.kind === "note" ? t.note_path : t.file_path)),
      ).toEqual(["notes/a.md", "notes/b.md", "other/c.md"]);
      expect(store.active_tab_id).toBe("notes/a.md");
    });

    it("matches prefix case-insensitively", () => {
      const store = new TabStore();
      store.open_tab(np("Docs/a.md"), "a");
      store.open_tab(np("DOCS/b.md"), "b");
      store.open_tab(np("other/c.md"), "c");

      store.update_tab_path_prefix("docs/", "notes/");

      expect(
        store.tabs.map((t) => (t.kind === "note" ? t.note_path : t.file_path)),
      ).toEqual(["notes/a.md", "notes/b.md", "other/c.md"]);
    });

    it("migrates note cache on prefix change", () => {
      const store = new TabStore();
      store.open_tab(np("docs/a.md"), "a");
      store.open_tab(np("docs/b.md"), "b");
      store.open_tab(np("other/c.md"), "c");
      store.set_cached_note("docs/a.md", mock_open_note("docs/a.md"));
      store.set_cached_note("docs/b.md", mock_open_note("docs/b.md"));
      store.set_cached_note("other/c.md", mock_open_note("other/c.md"));

      store.update_tab_path_prefix("docs/", "notes/");

      expect(store.get_cached_note("docs/a.md")).toBeNull();
      expect(store.get_cached_note("docs/b.md")).toBeNull();
      expect(store.get_cached_note("notes/a.md")?.meta.path).toBe("docs/a.md");
      expect(store.get_cached_note("notes/b.md")?.meta.path).toBe("docs/b.md");
      expect(store.get_cached_note("other/c.md")?.meta.path).toBe("other/c.md");
    });
  });

  describe("find_evictable_tab", () => {
    it("returns first non-pinned non-dirty non-active tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.activate_tab("c.md");

      expect(store.find_evictable_tab()?.id).toBe("a.md");
    });

    it("skips pinned tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.pin_tab("a.md");
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.activate_tab("c.md");

      expect(store.find_evictable_tab()?.id).toBe("b.md");
    });

    it("skips dirty tabs", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_dirty("a.md", true);
      store.open_tab(np("b.md"), "b");
      store.open_tab(np("c.md"), "c");
      store.activate_tab("c.md");

      expect(store.find_evictable_tab()?.id).toBe("b.md");
    });

    it("skips the active tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.activate_tab("a.md");

      expect(store.find_evictable_tab()?.id).toBe("b.md");
    });

    it("returns null when all tabs are dirty or pinned", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_dirty("a.md", true);
      store.open_tab(np("b.md"), "b");
      store.pin_tab("b.md");
      store.activate_tab("a.md");

      expect(store.find_evictable_tab()).toBeNull();
    });

    it("returns null when only active tab remains", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");

      expect(store.find_evictable_tab()).toBeNull();
    });

    it("returns null when empty", () => {
      const store = new TabStore();

      expect(store.find_evictable_tab()).toBeNull();
    });
  });

  describe("closed tab history", () => {
    it("pushes and pops closed tab entries", () => {
      const store = new TabStore();
      store.push_closed_history({
        kind: "note",
        note_path: np("a.md"),
        title: "a",
        scroll_top: 10,
        cursor: null,
      });
      store.push_closed_history({
        kind: "note",
        note_path: np("b.md"),
        title: "b",
        scroll_top: 20,
        cursor: null,
      });

      const entry = store.pop_closed_history();

      expect(entry?.kind === "note" && entry.note_path).toBe("b.md");
      expect(store.closed_tab_history).toHaveLength(1);
    });

    it("returns null when history is empty", () => {
      const store = new TabStore();

      expect(store.pop_closed_history()).toBeNull();
    });

    it("limits history to 10 entries", () => {
      const store = new TabStore();
      for (let i = 0; i < 15; i++) {
        store.push_closed_history({
          kind: "note",
          note_path: np(`${String(i)}.md`),
          title: String(i),
          scroll_top: 0,
          cursor: null,
        });
      }

      expect(store.closed_tab_history).toHaveLength(10);
    });
  });

  describe("restore_tabs", () => {
    it("restores tabs and activates specified tab", () => {
      const store = new TabStore();
      const tabs = [
        {
          kind: "note" as const,
          id: "a.md",
          note_path: np("a.md"),
          title: "a",
          is_pinned: false,
          is_dirty: false,
        },
        {
          kind: "note" as const,
          id: "b.md",
          note_path: np("b.md"),
          title: "b",
          is_pinned: true,
          is_dirty: false,
        },
      ];

      store.restore_tabs(tabs, "b.md");

      expect(store.tabs).toHaveLength(2);
      expect(store.active_tab_id).toBe("b.md");
    });

    it("falls back to first tab when active id not found", () => {
      const store = new TabStore();
      const tabs = [
        {
          kind: "note" as const,
          id: "a.md",
          note_path: np("a.md"),
          title: "a",
          is_pinned: false,
          is_dirty: false,
        },
      ];

      store.restore_tabs(tabs, "missing.md");

      expect(store.active_tab_id).toBe("a.md");
    });
  });

  describe("computed properties", () => {
    it("has_tabs returns false when empty", () => {
      const store = new TabStore();
      expect(store.has_tabs).toBe(false);
    });

    it("has_tabs returns true when tabs exist", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      expect(store.has_tabs).toBe(true);
    });

    it("active_tab returns the active tab", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");

      expect(store.active_tab?.id).toBe("b.md");
    });

    it("active_tab_index returns correct index", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");

      expect(store.active_tab_index).toBe(1);
    });

    it("find_tab_by_path returns tab or null", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");

      expect(store.find_tab_by_path(np("a.md"))?.id).toBe("a.md");
      expect(store.find_tab_by_path(np("missing.md"))).toBeNull();
    });
  });

  describe("note_cache", () => {
    it("stores and retrieves a cached note", () => {
      const store = new TabStore();
      const note = mock_open_note("a.md");

      store.set_cached_note("a.md", note);

      expect(store.get_cached_note("a.md")).toBe(note);
    });

    it("returns null for uncached tab", () => {
      const store = new TabStore();

      expect(store.get_cached_note("missing.md")).toBeNull();
    });

    it("clears a cached note", () => {
      const store = new TabStore();
      store.set_cached_note("a.md", mock_open_note("a.md"));

      store.clear_cached_note("a.md");

      expect(store.get_cached_note("a.md")).toBeNull();
    });

    it("clear_cached_note is no-op for missing key", () => {
      const store = new TabStore();

      expect(() => {
        store.clear_cached_note("missing.md");
      }).not.toThrow();
    });

    it("invalidate_cache_by_path clears cache for all matching tabs", () => {
      const store = new TabStore();
      store.open_tab(np("docs/a.md"), "a");
      store.open_tab(np("docs/b.md"), "b");
      store.set_cached_note("docs/a.md", mock_open_note("docs/a.md"));
      store.set_cached_note("docs/b.md", mock_open_note("docs/b.md"));

      store.invalidate_cache_by_path(np("docs/a.md"));

      expect(store.get_cached_note("docs/a.md")).toBeNull();
      expect(store.get_cached_note("docs/b.md")?.meta.path).toBe("docs/b.md");
    });

    it("invalidate_cache_by_path is no-op for unmatched path", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_cached_note("a.md", mock_open_note("a.md"));

      store.invalidate_cache_by_path(np("missing.md"));

      expect(store.get_cached_note("a.md")?.meta.path).toBe("a.md");
    });

    it("overwrites existing cache entry", () => {
      const store = new TabStore();
      const first = mock_open_note("a.md");
      const second = mock_open_note("b.md");

      store.set_cached_note("a.md", first);
      store.set_cached_note("a.md", second);

      expect(store.get_cached_note("a.md")).toBe(second);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.set_dirty("a.md", true);
      store.set_snapshot("a.md", { scroll_top: 50, cursor: null });
      store.push_closed_history({
        kind: "note",
        note_path: np("b.md"),
        title: "b",
        scroll_top: 0,
        cursor: null,
      });

      store.reset();

      expect(store.tabs).toHaveLength(0);
      expect(store.active_tab_id).toBeNull();
      expect(store.closed_tab_history).toHaveLength(0);
      expect(store.editor_snapshots.size).toBe(0);
    });

    it("clears note cache", () => {
      const store = new TabStore();
      store.open_tab(np("a.md"), "a");
      store.open_tab(np("b.md"), "b");
      store.set_cached_note("a.md", mock_open_note("a.md"));
      store.set_cached_note("b.md", mock_open_note("b.md"));

      store.reset();

      expect(store.note_cache.size).toBe(0);
    });
  });
});

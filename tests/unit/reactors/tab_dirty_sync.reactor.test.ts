import { describe, expect, it, vi } from "vitest";
import {
  resolve_tab_dirty_sync,
  create_tab_dirty_sync_reactor,
} from "$lib/reactors/tab_dirty_sync.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab";

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

function mock_tab(path: string): Tab {
  return {
    id: path,
    note_path: as_note_path(path),
    title: path,
    is_pinned: false,
    is_dirty: false,
  };
}

describe("tab_dirty_sync.reactor", () => {
  describe("resolve_tab_dirty_sync", () => {
    it("returns tab id and dirty state when note path matches active tab", () => {
      const open_note = mock_open_note("docs/a.md");
      open_note.is_dirty = true;
      const active_tab = mock_tab("docs/a.md");

      expect(resolve_tab_dirty_sync(open_note, active_tab)).toEqual({
        tab_id: "docs/a.md",
        is_dirty: true,
      });
    });

    it("returns null when open note path differs from active tab path", () => {
      const open_note = mock_open_note("docs/b.md");
      const active_tab = mock_tab("docs/a.md");

      expect(resolve_tab_dirty_sync(open_note, active_tab)).toBeNull();
    });

    it("returns null when either input is missing", () => {
      const open_note = mock_open_note("docs/a.md");
      const active_tab = mock_tab("docs/a.md");

      expect(resolve_tab_dirty_sync(null, active_tab)).toBeNull();
      expect(resolve_tab_dirty_sync(open_note, null)).toBeNull();
    });

    it("forces drafts to stay dirty", () => {
      const open_note = mock_open_note("draft:1:Untitled-1");
      open_note.meta.name = "Untitled-1";
      open_note.meta.title = "Untitled-1";
      open_note.is_dirty = false;
      const active_tab = mock_tab("draft:1:Untitled-1");

      expect(resolve_tab_dirty_sync(open_note, active_tab)).toEqual({
        tab_id: "draft:1:Untitled-1",
        is_dirty: true,
      });
    });
  });

  it("returns a cleanup function", () => {
    const unmount = create_tab_dirty_sync_reactor(
      {
        open_note: null,
      } as never,
      {
        active_tab: null,
      } as never,
      {
        sync_dirty_state: vi.fn(),
      } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  create_conflict_toast_callbacks,
  create_conflict_toast_reactor,
  resolve_conflict_toast_target,
} from "$lib/reactors/conflict_toast.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab";

function mock_open_note(path: string, is_dirty = false): OpenNoteState {
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
    is_dirty,
  };
}

function mock_tab(path: string, is_dirty = true): Tab {
  return {
    id: path,
    note_path: as_note_path(path),
    title: path.replace(".md", ""),
    is_pinned: false,
    is_dirty,
  };
}

describe("conflict_toast.reactor", () => {
  describe("resolve_conflict_toast_target", () => {
    it("returns the active conflicted dirty note", () => {
      const target = resolve_conflict_toast_target(
        mock_tab("a.md"),
        mock_open_note("a.md", true),
        () => true,
      );

      expect(target).toEqual({
        note_id: "a.md",
        note_path: "a.md",
      });
    });

    it("returns null for clean notes, mismatched tabs, or notes without conflict", () => {
      expect(
        resolve_conflict_toast_target(
          mock_tab("a.md", false),
          mock_open_note("a.md", false),
          () => true,
        ),
      ).toBeNull();

      expect(
        resolve_conflict_toast_target(
          mock_tab("a.md"),
          mock_open_note("b.md", true),
          () => true,
        ),
      ).toBeNull();

      expect(
        resolve_conflict_toast_target(
          mock_tab("a.md"),
          mock_open_note("a.md", true),
          () => false,
        ),
      ).toBeNull();
    });

    it("produces the expected show-hide-show sequence across tab switches", () => {
      const visible_targets = [
        resolve_conflict_toast_target(
          mock_tab("a.md"),
          mock_open_note("a.md", true),
          () => true,
        ),
        resolve_conflict_toast_target(
          mock_tab("b.md"),
          mock_open_note("a.md", true),
          () => true,
        ),
        resolve_conflict_toast_target(
          mock_tab("a.md"),
          mock_open_note("a.md", true),
          () => true,
        ),
      ];

      expect(visible_targets).toEqual([
        { note_id: "a.md", note_path: "a.md" },
        null,
        { note_id: "a.md", note_path: "a.md" },
      ]);
    });

    it("switches to the newly active conflicted tab when two conflicted tabs exist", () => {
      const first = resolve_conflict_toast_target(
        mock_tab("a.md"),
        mock_open_note("a.md", true),
        (note_path) => note_path === "a.md" || note_path === "b.md",
      );
      const second = resolve_conflict_toast_target(
        mock_tab("b.md"),
        mock_open_note("b.md", true),
        (note_path) => note_path === "a.md" || note_path === "b.md",
      );

      expect(first).toEqual({ note_id: "a.md", note_path: "a.md" });
      expect(second).toEqual({ note_id: "b.md", note_path: "b.md" });
    });
  });

  describe("create_conflict_toast_callbacks", () => {
    it("reload clears conflict state, invalidates cache, and reloads from disk", () => {
      let has_conflict = true;
      const tab_service = {
        clear_conflict: vi.fn(() => {
          has_conflict = false;
        }),
        invalidate_cache: vi.fn(),
      };
      const note_service = {
        open_note: vi.fn(),
        skip_mtime_guard: vi.fn(),
      };

      const callbacks = create_conflict_toast_callbacks(
        {
          note_id: as_note_path("a.md"),
          note_path: as_note_path("a.md"),
        },
        tab_service,
        note_service,
      );

      callbacks.on_reload();

      expect(has_conflict).toBe(false);
      expect(tab_service.invalidate_cache).toHaveBeenCalledWith("a.md");
      expect(note_service.open_note).toHaveBeenCalledWith("a.md", false, {
        force_reload: true,
      });
    });

    it("keep clears conflict state and skips the mtime guard", () => {
      let has_conflict = true;
      const tab_service = {
        clear_conflict: vi.fn(() => {
          has_conflict = false;
        }),
        invalidate_cache: vi.fn(),
      };
      const note_service = {
        open_note: vi.fn(),
        skip_mtime_guard: vi.fn(),
      };

      const callbacks = create_conflict_toast_callbacks(
        {
          note_id: as_note_path("a.md"),
          note_path: as_note_path("a.md"),
        },
        tab_service,
        note_service,
      );

      callbacks.on_keep();

      expect(has_conflict).toBe(false);
      expect(note_service.skip_mtime_guard).toHaveBeenCalledWith("a.md");
    });
  });

  it("returns a cleanup function", () => {
    const unmount = create_conflict_toast_reactor(
      {
        open_note: null,
      } as never,
      {
        active_tab: null,
        conflicted_note_paths: new Map(),
        has_conflict: vi.fn(),
      } as never,
      {
        clear_conflict: vi.fn(),
        invalidate_cache: vi.fn(),
      } as never,
      {
        open_note: vi.fn(),
        skip_mtime_guard: vi.fn(),
      } as never,
      {
        show: vi.fn(),
        dismiss: vi.fn(),
        dismiss_all: vi.fn(),
      } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});

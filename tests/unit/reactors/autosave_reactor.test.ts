/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_autosave_reactor } from "$lib/reactors/autosave.reactor.svelte";
import { EditorStore } from "$lib/features/editor";
import { TabStore, TabService } from "$lib/features/tab";
import { VaultStore } from "$lib/features/vault";
import { UIStore } from "$lib/app";
import type { EditorService } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { NoteSaveResult } from "$lib/features/note/types/note_service_result";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

function create_pending_autosave() {
  vi.useFakeTimers();
  const editor = new EditorStore();
  const tabs = new TabStore();
  const vault = new VaultStore();
  const ui = new UIStore();
  vault.set_vault(create_test_vault());
  ui.editor_settings.autosave_enabled = true;
  ui.editor_settings.autosave_delay_ms = 100;
  const path = as_note_path("note.md");
  const note = {
    meta: {
      id: path,
      path,
      name: "note",
      title: "note",
      mtime_ms: 10,
      size_bytes: 0,
    },
    markdown: as_markdown_text("before delay"),
    buffer_id: "original",
    is_dirty: true,
  };
  editor.set_open_note(note);
  tabs.open_tab(path, "note");
  tabs.set_dirty(path, true);
  let live_markdown = as_markdown_text("saved text");
  const mark_clean = vi.fn();
  const flush = vi.fn(() => {
    if (!editor.open_note) return null;
    const result = {
      note_id: editor.open_note.meta.id,
      markdown: live_markdown,
    };
    editor.set_markdown(result.note_id, result.markdown);
    return result;
  });
  let finish_save: (result: NoteSaveResult) => void = () => {};
  const save_note = vi.fn(
    () =>
      new Promise<NoteSaveResult>((resolve) => {
        finish_save = resolve;
      }),
  );
  cleanups.push(
    create_autosave_reactor(
      editor,
      tabs,
      ui,
      { save_note } as unknown as NoteService,
      new TabService(tabs),
      vault,
      { flush, mark_clean } as unknown as EditorService,
    ),
  );
  flushSync();
  return {
    editor,
    tabs,
    vault,
    note,
    mark_clean,
    save_note,
    type_text(text: string) {
      live_markdown = as_markdown_text(text);
    },
    async finish(
      result: NoteSaveResult = {
        status: "saved",
        saved_path: path,
        saved_mtime_ms: 20,
      },
    ) {
      finish_save(result);
      await Promise.resolve();
      flushSync();
    },
  };
}

describe("autosave.reactor", () => {
  it("captures live content when the timer fires instead of its earlier snapshot", async () => {
    const pending = create_pending_autosave();
    await vi.advanceTimersByTimeAsync(100);
    expect(pending.save_note).toHaveBeenCalledOnce();
    await pending.finish();
    expect(pending.tabs.get_cached_note("note.md")).toMatchObject({
      markdown: "saved text",
      is_dirty: false,
      meta: { mtime_ms: 20 },
    });
  });

  it("keeps edits made during the write dirty", async () => {
    const pending = create_pending_autosave();
    await vi.advanceTimersByTimeAsync(100);
    pending.type_text("later typing");
    await pending.finish();
    expect(pending.tabs.get_cached_note("note.md")).toMatchObject({
      markdown: "later typing",
      is_dirty: true,
      meta: { mtime_ms: 20 },
    });
    expect(
      pending.tabs.find_tab_by_path(as_note_path("note.md"))?.is_dirty,
    ).toBe(true);
    expect(pending.mark_clean).toHaveBeenCalledWith("note.md", "saved text");
  });

  it("reconciles only the original cached note after switching tabs", async () => {
    const pending = create_pending_autosave();
    await vi.advanceTimersByTimeAsync(100);
    pending.tabs.set_cached_note("note.md", {
      ...pending.note,
      markdown: as_markdown_text("later cached edit"),
    });
    const other_path = as_note_path("other.md");
    pending.tabs.open_tab(other_path, "other");
    const other = {
      ...pending.note,
      buffer_id: "other",
      meta: { ...pending.note.meta, id: other_path, path: other_path },
    };
    pending.editor.set_open_note(other);
    await pending.finish();
    expect(pending.tabs.get_cached_note("note.md")).toMatchObject({
      markdown: "later cached edit",
      is_dirty: true,
      meta: { mtime_ms: 20 },
    });
    expect(pending.editor.open_note).toEqual(other);
    expect(pending.tabs.active_tab_id).toBe("other.md");
  });

  it.each(["saved", "conflict"] as const)(
    "ignores %s completion for a replaced inactive buffer",
    async (status) => {
      const pending = create_pending_autosave();
      await vi.advanceTimersByTimeAsync(100);
      const replacement = {
        ...pending.note,
        buffer_id: "replacement",
        markdown: as_markdown_text("replacement text"),
      };
      pending.tabs.set_cached_note("note.md", replacement);
      pending.editor.clear_open_note();
      await pending.finish(
        status === "conflict"
          ? { status }
          : { status, saved_path: as_note_path("note.md"), saved_mtime_ms: 20 },
      );
      expect(pending.tabs.get_cached_note("note.md")).toEqual(replacement);
      expect(pending.mark_clean).not.toHaveBeenCalled();
      expect(pending.tabs.has_conflict(as_note_path("note.md"))).toBe(false);
    },
  );

  it.each(["vault", "buffer"])(
    "ignores a completion after the %s changes",
    async (change) => {
      const pending = create_pending_autosave();
      await vi.advanceTimersByTimeAsync(100);
      if (change === "vault") pending.vault.set_vault(create_test_vault());
      else
        pending.editor.set_open_note({
          ...pending.note,
          buffer_id: "replacement",
        });
      await pending.finish();
      expect(pending.tabs.get_cached_note("note.md")).toBeNull();
      expect(pending.mark_clean).not.toHaveBeenCalled();
      expect(
        pending.tabs.find_tab_by_path(as_note_path("note.md"))?.is_dirty,
      ).toBe(true);
    },
  );
});

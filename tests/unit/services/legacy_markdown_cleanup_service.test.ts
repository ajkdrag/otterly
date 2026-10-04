import { describe, expect, it, vi } from "vitest";
import { LegacyMarkdownCleanupService } from "$lib/features/note/application/legacy_markdown_cleanup_service";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import {
  as_note_path,
  as_markdown_text,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";

const note = {
  id: as_note_path("one.md"),
  path: as_note_path("one.md"),
  name: "one",
  title: "One",
  mtime_ms: 10,
  size_bytes: 30,
};

function create_service(markdown = "- one\n\n- two") {
  const vault_store = new VaultStore();
  vault_store.set_vault({
    id: as_vault_id("vault"),
    name: "Vault",
    path: as_vault_path("/tmp/vault"),
    created_at: 1,
  });
  const tab_store = new TabStore();
  const editor_store = new EditorStore();
  const notes_store = new NotesStore();
  notes_store.set_notes([note]);
  const notes_port = {
    list_notes: vi.fn().mockResolvedValue([note]),
    read_note: vi.fn().mockResolvedValue({ meta: note, markdown }),
    get_latest_markdown_cleanup_backup: vi.fn().mockResolvedValue(null),
    apply_markdown_cleanup: vi.fn().mockResolvedValue({
      backup: { id: "backup", created_at_ms: 11, note_count: 1 },
      updated_notes: [{ ...note, mtime_ms: 12 }],
    }),
    restore_latest_markdown_cleanup: vi.fn().mockResolvedValue(null),
  };
  const editor_service = {
    flush: vi.fn(),
    is_dirty: vi.fn().mockReturnValue(false),
    close_buffer: vi.fn(),
  };
  const index_port = { upsert_note: vi.fn().mockResolvedValue(undefined) };
  const suppress_file_write = vi.fn();
  const reload_active_note = vi.fn().mockResolvedValue(undefined);
  const service = new LegacyMarkdownCleanupService(
    notes_port as never,
    index_port as never,
    vault_store,
    tab_store,
    editor_store,
    editor_service as never,
    notes_store,
    () => 100,
    suppress_file_write,
    reload_active_note,
  );
  return {
    service,
    notes_port,
    tab_store,
    editor_store,
    editor_service,
    suppress_file_write,
    reload_active_note,
  };
}

describe("LegacyMarkdownCleanupService", () => {
  it("previews full before and after text and compacts sibling list items", async () => {
    const { service } = create_service();
    const preview = await service.preview();

    expect(preview.changed_count).toBe(1);
    expect(preview.notes[0]?.before_markdown).toBe("- one\n\n- two");
    expect(preview.notes[0]?.after_markdown).toBe("- one\n- two");
    expect(preview.notes[0]?.list_separators_removed).toBe(1);
  });

  it("skips a note that becomes dirty after preview and makes no write", async () => {
    const { service, notes_port, tab_store } = create_service();
    const preview = await service.preview();
    const tab = tab_store.open_tab(note.path, note.title);
    tab_store.set_dirty(tab.id, true);

    await expect(service.apply(preview.id)).rejects.toThrow(/unsaved/);
    expect(notes_port.apply_markdown_cleanup).not.toHaveBeenCalled();
  });

  it("suppresses watcher events before batch IO and refreshes search after apply", async () => {
    const { service, notes_port, suppress_file_write } = create_service();
    const preview = await service.preview();
    await service.apply(preview.id);

    expect(suppress_file_write).toHaveBeenCalledWith("one.md");
    expect(notes_port.apply_markdown_cleanup).toHaveBeenCalledOnce();
  });

  it("refreshes a clean open buffer and maps its cursor after list compaction", async () => {
    const { service, notes_port, tab_store, editor_store, reload_active_note } =
      create_service();
    const tab = tab_store.open_tab(note.path, note.title);
    const open_note = {
      meta: note,
      markdown: as_markdown_text("- one\n\n- two"),
      buffer_id: "one.md",
      is_dirty: false,
    };
    editor_store.set_open_note(open_note);
    tab_store.set_cached_note(tab.id, open_note);
    tab_store.set_snapshot(tab.id, {
      scroll_top: 0,
      cursor: {
        line: 3,
        column: 4,
        total_lines: 3,
        total_words: 3,
        anchor: 10,
        head: 10,
        offset_kind: "markdown",
      },
      code_block_view_states: [],
    });
    const preview = await service.preview();
    expect(preview.skipped_open_count).toBe(0);
    notes_port.read_note.mockResolvedValue({
      meta: { ...note, mtime_ms: 12 },
      markdown: as_markdown_text("- one\n- two"),
    });
    await service.apply(preview.id);

    expect(tab_store.get_cached_note(tab.id)?.markdown).toBe("- one\n- two");
    expect(tab_store.get_snapshot(tab.id)?.cursor).toMatchObject({
      line: 2,
      column: 4,
      head: 9,
    });
    expect(reload_active_note).toHaveBeenCalledWith("one.md");
  });
});

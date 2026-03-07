import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  as_asset_path,
  as_markdown_text,
  as_note_path,
} from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { EditorService } from "$lib/features/editor/application/editor_service";
import type { AssetsPort } from "$lib/features/note/ports";
import type { LinkRepairService } from "$lib/features/links/application/link_repair_service";

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("NoteService", () => {
  it("opens note content and updates editor/ui state", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi.fn().mockResolvedValue({
      meta: note_meta,
      markdown: as_markdown_text("# Alpha"),
    });

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/alpha.md", false);

    expect(editor_store.open_note?.meta.path).toBe(
      as_note_path("docs/alpha.md"),
    );
    expect(editor_store.open_note?.markdown).toBe(as_markdown_text("# Alpha"));
    expect(notes_store.recent_notes).toEqual([note_meta]);
    expect(result).toEqual({
      status: "opened",
      selected_folder_path: "docs",
    });
    expect(op_store.get("note.open:docs/alpha.md").status).toBe("success");
  });

  it("adds opened note to notes store when missing", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/missing.md"),
      path: as_note_path("docs/missing.md"),
      name: "missing",
      title: "missing",
      mtime_ms: 0,
      size_bytes: 0,
    };

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi.fn().mockResolvedValue({
      meta: note_meta,
      markdown: as_markdown_text("# Missing"),
    });

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    await service.open_note("docs/missing.md", false);

    expect(notes_store.notes).toEqual([note_meta]);
    expect(notes_store.recent_notes).toEqual([note_meta]);
  });

  it("self-heals stale search hits when note is missing", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const stale_meta = {
      id: as_note_path("docs/stale.md"),
      path: as_note_path("docs/stale.md"),
      name: "stale",
      title: "stale",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([stale_meta]);
    notes_store.add_recent_note(stale_meta);

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi
      .fn()
      .mockRejectedValue(new Error("No such file or directory"));

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/stale.md", false, {
      cleanup_if_missing: true,
    });
    const vault_id = vault_store.vault?.id;
    if (!vault_id) {
      throw new Error("vault id missing in test setup");
    }

    expect(result).toEqual({ status: "not_found" });
    expect(index_port._calls.remove_note).toEqual([
      {
        vault_id: vault_id,
        note_id: as_note_path("docs/stale.md"),
      },
    ]);
    expect(notes_store.notes).toEqual([]);
    expect(notes_store.recent_notes).toEqual([]);
    expect(op_store.get("note.open:docs/stale.md").status).toBe("success");
  });

  it("keeps index untouched for non-search not-found open failures", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const stale_meta = {
      id: as_note_path("docs/missing.md"),
      path: as_note_path("docs/missing.md"),
      name: "missing",
      title: "missing",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([stale_meta]);

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi
      .fn()
      .mockRejectedValue(new Error("No such file or directory"));

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/missing.md", false);

    expect(result.status).toBe("failed");
    expect(index_port._calls.remove_note).toEqual([]);
    expect(notes_store.notes).toEqual([stale_meta]);
    expect(op_store.get("note.open:docs/missing.md").status).toBe("error");
  });

  it("bumps recent note when reopening the active note", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    editor_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: "alpha",
      is_dirty: false,
    });
    notes_store.add_recent_note({
      id: as_note_path("docs/other.md"),
      path: as_note_path("docs/other.md"),
      name: "other",
      title: "other",
      mtime_ms: 0,
      size_bytes: 0,
    });

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    await service.open_note("docs/alpha.md", false);

    expect(notes_store.recent_notes[0]).toEqual(note_meta);
  });

  it("re-reads note when force_reload is enabled", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    editor_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# stale"),
      buffer_id: "alpha",
      is_dirty: false,
    });

    const notes_port = create_mock_notes_port();
    const read_note = vi.fn().mockResolvedValue({
      meta: note_meta,
      markdown: as_markdown_text("# refreshed"),
    });
    notes_port.read_note = read_note;
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/alpha.md", false, {
      force_reload: true,
    });

    expect(result.status).toBe("opened");
    expect(read_note).toHaveBeenCalledTimes(1);
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# refreshed"),
    );
    expect(editor_store.open_note?.buffer_id).toContain(":reload:");
  });

  it("removes deleted notes from recent list", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/remove-me.md"),
      path: as_note_path("docs/remove-me.md"),
      name: "remove-me",
      title: "remove-me",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);
    notes_store.add_recent_note(note_meta);

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    await service.delete_note(note_meta);

    expect(notes_store.recent_notes).toEqual([]);
  });

  it("updates recent notes when a note is renamed", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);
    notes_store.add_recent_note(note_meta);

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    await service.rename_note(note_meta, as_note_path("docs/beta.md"), false);

    expect(notes_store.recent_notes).toEqual([
      {
        ...note_meta,
        id: as_note_path("docs/beta.md"),
        path: as_note_path("docs/beta.md"),
        name: "beta",
        title: "beta",
      },
    ]);
  });

  it("calls link repair with correct path map when renaming a note", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/old.md"),
      path: as_note_path("docs/old.md"),
      name: "old",
      title: "old",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const repair_links = vi.fn().mockResolvedValue({
      scanned: 1,
      rewritten: 1,
      failed: [],
    });
    const link_repair = { repair_links } as unknown as LinkRepairService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
      link_repair,
    );

    await service.rename_note(note_meta, as_note_path("docs/new.md"), false);

    const vault_id = vault_store.vault?.id;
    expect(repair_links).toHaveBeenCalledWith(
      vault_id,
      new Map([["docs/old.md", "docs/new.md"]]),
      expect.any(Function),
    );
  });

  it("retries read when create_if_missing races with existing note", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/has spaces.md"),
      path: as_note_path("docs/has spaces.md"),
      name: "has spaces",
      title: "has spaces",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);

    const notes_port = create_mock_notes_port();
    const read_note = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "tauri invoke failed: read_note: No such file or directory (os error 2)",
        ),
      )
      .mockResolvedValueOnce({
        meta: note_meta,
        markdown: as_markdown_text("# Ok"),
      });
    notes_port.read_note = read_note;
    notes_port.create_note = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("tauri invoke failed: create_note: note already exists"),
      );

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/has spaces.md", true);

    expect(read_note).toHaveBeenCalledTimes(2);
    expect(editor_store.open_note?.meta.path).toBe(
      as_note_path("docs/has spaces.md"),
    );
    expect(editor_store.open_note?.markdown).toBe(as_markdown_text("# Ok"));
    expect(notes_store.recent_notes).toEqual([note_meta]);
    expect(result).toEqual({
      status: "opened",
      selected_folder_path: "docs",
    });
    expect(op_store.get("note.open:docs/has spaces.md").status).toBe("success");
  });

  it("opens existing note via read before create when store is stale", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/already-there.md"),
      path: as_note_path("docs/already-there.md"),
      name: "already-there",
      title: "already-there",
      mtime_ms: 0,
      size_bytes: 0,
    };

    const notes_port = create_mock_notes_port();
    const read_note = vi.fn().mockResolvedValue({
      meta: note_meta,
      markdown: as_markdown_text("# Existing"),
    });
    const create_note = vi.fn().mockResolvedValue(note_meta);
    notes_port.read_note = read_note;
    notes_port.create_note = create_note;

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/already-there.md", true);

    expect(read_note).toHaveBeenCalledTimes(1);
    expect(create_note).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "opened",
      selected_folder_path: "docs",
    });
  });

  it("sets last_saved_at on editor store after successful save", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    editor_store.set_open_note({
      meta: {
        id: as_note_path("docs/alpha.md"),
        path: as_note_path("docs/alpha.md"),
        name: "alpha",
        title: "alpha",
        mtime_ms: 1_700_000_000_000,
        size_bytes: 0,
      },
      markdown: as_markdown_text("# Alpha"),
      buffer_id: "alpha-buffer",
      is_dirty: true,
    });

    const disk_mtime = 1_700_000_010_000;
    const notes_port = create_mock_notes_port();
    notes_port.write_note = vi.fn().mockResolvedValue(disk_mtime);
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => disk_mtime,
    );

    await service.save_note(null, true);

    expect(editor_store.last_saved_at).toBe(disk_mtime);
  });

  it("returns conflict when write_note rejects with mtime_mismatch", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    editor_store.set_open_note({
      meta: {
        id: as_note_path("docs/alpha.md"),
        path: as_note_path("docs/alpha.md"),
        name: "alpha",
        title: "alpha",
        mtime_ms: 1_700_000_000_000,
        size_bytes: 0,
      },
      markdown: as_markdown_text("# Alpha"),
      buffer_id: "alpha-buffer",
      is_dirty: true,
    });

    const notes_port = create_mock_notes_port();
    notes_port.write_note = vi
      .fn()
      .mockRejectedValue(new Error("conflict:mtime_mismatch"));
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.save_note(null, true);

    expect(result).toEqual({ status: "conflict" });
    expect(op_store.get("note.save").status).not.toBe("failed");
  });

  it("saves untitled note to a new path", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    editor_store.set_open_note({
      meta: {
        id: as_note_path("draft:1:Untitled-1"),
        path: as_note_path("draft:1:Untitled-1"),
        name: "Untitled-1",
        title: "Untitled-1",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("draft"),
      buffer_id: "untitled-test",
      is_dirty: true,
    });

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const rename_buffer = vi.fn();

    const editor_service = {
      flush: vi.fn().mockReturnValue({
        note_id: as_note_path("draft:1:Untitled-1"),
        markdown: as_markdown_text("draft"),
      }),
      mark_clean: vi.fn(),
      rename_buffer,
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.save_note(
      as_note_path("docs/my-note.md"),
      false,
    );

    const vault = vault_store.vault;
    expect(vault).not.toBeNull();

    expect(notes_port._calls.create_note).toContainEqual({
      vault_id: vault?.id,
      note_path: as_note_path("docs/my-note.md"),
      markdown: as_markdown_text("draft"),
    });
    expect(rename_buffer).toHaveBeenCalledWith(
      as_note_path("draft:1:Untitled-1"),
      as_note_path("docs/my-note.md"),
    );
    expect(editor_store.open_note?.meta.path).toBe(
      as_note_path("docs/my-note.md"),
    );
    expect(editor_store.open_note?.is_dirty).toBe(false);
    expect(result).toEqual({
      status: "saved",
      saved_path: as_note_path("docs/my-note.md"),
    });
    expect(op_store.get("note.save").status).toBe("success");
    expect(notes_store.recent_notes[0]?.id).toBe(
      as_note_path("docs/my-note.md"),
    );
  });

  it("writes pasted image asset for active vault", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const write_image_asset = vi
      .fn()
      .mockResolvedValue(as_asset_path("docs/.assets/alpha-1.png"));
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset,
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.save_pasted_image(
      as_note_path("docs/alpha.md"),
      {
        bytes: new Uint8Array([7, 8, 9]),
        mime_type: "image/png",
        file_name: "clip.png",
      },
    );

    expect(write_image_asset).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "saved",
      asset_path: as_asset_path("docs/.assets/alpha-1.png"),
    });
    expect(op_store.get("asset.write").status).toBe("success");
  });

  it("keeps note.save pending until overlapping saves settle", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    editor_store.set_open_note({
      meta: {
        id: as_note_path("docs/alpha.md"),
        path: as_note_path("docs/alpha.md"),
        name: "alpha",
        title: "alpha",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("# Alpha"),
      buffer_id: "alpha-buffer",
      is_dirty: true,
    });

    const first_write = create_deferred<void>();
    const second_write = create_deferred<void>();
    const notes_port = create_mock_notes_port();
    notes_port.write_note = vi
      .fn()
      .mockImplementationOnce(() => first_write.promise)
      .mockImplementationOnce(() => second_write.promise);

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const first_save = service.save_note(null, true);
    const second_save = service.save_note(null, true);

    expect(op_store.get("note.save").status).toBe("pending");

    first_write.resolve();
    await first_save;
    expect(op_store.get("note.save").status).toBe("pending");

    second_write.resolve();
    await second_save;
    expect(op_store.get("note.save").status).toBe("success");
  });

  it("maps backend rename already-exists errors to conflict", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);

    const notes_port = create_mock_notes_port();
    notes_port.rename_note = vi
      .fn()
      .mockRejectedValue(new Error("tauri invoke failed: note already exists"));

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.rename_note(
      note_meta,
      as_note_path("docs/archived.md"),
      false,
    );

    expect(result).toEqual({ status: "conflict" });
  });

  it("maps create_note already-exists errors to save conflict", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    editor_store.set_open_note({
      meta: {
        id: as_note_path("draft:1:Untitled-1"),
        path: as_note_path("draft:1:Untitled-1"),
        name: "Untitled-1",
        title: "Untitled-1",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("draft"),
      buffer_id: "untitled-buffer",
      is_dirty: true,
    });

    const notes_port = create_mock_notes_port();
    notes_port.create_note = vi
      .fn()
      .mockRejectedValue(new Error("tauri invoke failed: note already exists"));

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.save_note(
      as_note_path("docs/existing.md"),
      false,
    );
    expect(result).toEqual({ status: "conflict" });
  });

  it("creates note when read throws DOMException with NotFoundError name", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/new-from-link.md"),
      path: as_note_path("docs/new-from-link.md"),
      name: "new-from-link",
      title: "new-from-link",
      mtime_ms: 0,
      size_bytes: 0,
    };

    const dom_error = new DOMException(
      "A requested file or directory could not be found at the time an operation was processed.",
      "NotFoundError",
    );

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi.fn().mockRejectedValueOnce(dom_error);
    const create_note = vi.fn().mockResolvedValue(note_meta);
    notes_port.create_note = create_note;

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/new-from-link.md", true);

    expect(create_note).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("opened");
  });

  it("does not create when read failure is not not-found", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const notes_port = create_mock_notes_port();
    notes_port.read_note = vi
      .fn()
      .mockRejectedValue(new Error("permission denied"));
    const create_note = vi.fn();
    notes_port.create_note = create_note;

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;
    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.open_note("docs/alpha.md", true);
    expect(result.status).toBe("failed");
    expect(create_note).not.toHaveBeenCalled();
  });
});

describe("NoteService rename case-insensitive handling", () => {
  it("allows case-only rename without conflict", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };
    notes_store.set_notes([note_meta]);

    const notes_port = create_mock_notes_port();
    const rename_note = vi.fn().mockResolvedValue(undefined);
    notes_port.rename_note = rename_note;

    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.rename_note(
      note_meta,
      as_note_path("docs/ALPHA.md"),
      false,
    );

    expect(result.status).toBe("renamed");
    expect(rename_note).toHaveBeenCalled();
  });

  it("detects conflict case-insensitively for different note", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const editor_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const alpha_note = {
      id: as_note_path("docs/alpha.md"),
      path: as_note_path("docs/alpha.md"),
      name: "alpha",
      title: "alpha",
      mtime_ms: 0,
      size_bytes: 0,
    };

    const beta_note = {
      id: as_note_path("docs/beta.md"),
      path: as_note_path("docs/beta.md"),
      name: "beta",
      title: "beta",
      mtime_ms: 0,
      size_bytes: 0,
    };

    notes_store.set_notes([alpha_note, beta_note]);

    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const assets_port = {
      resolve_asset_url: vi.fn(),
      write_image_asset: vi.fn(),
    } as unknown as AssetsPort;

    const editor_service = {
      flush: vi.fn().mockReturnValue(null),
      mark_clean: vi.fn(),
      rename_buffer: vi.fn(),
    } as unknown as EditorService;

    const service = new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
    );

    const result = await service.rename_note(
      alpha_note,
      as_note_path("docs/BETA.md"),
      false,
    );

    expect(result.status).toBe("conflict");
  });
});

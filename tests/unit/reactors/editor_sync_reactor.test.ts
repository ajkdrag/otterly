import { describe, expect, it } from "vitest";
import {
  resolve_editor_sync_open,
  resolve_editor_sync_restore_policy,
} from "$lib/reactors/editor_sync.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

function open_note(buffer_id: string) {
  return {
    meta: {
      id: as_note_path("notes/a.md"),
      path: as_note_path("notes/a.md"),
      name: "a.md",
      title: "a",
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text("# A"),
    buffer_id,
    is_dirty: false,
  };
}

describe("editor_sync.reactor", () => {
  it("opens buffer when note id changes", () => {
    const note = open_note("notes/a.md");
    expect(
      resolve_editor_sync_open({
        open_vault_id: "vault-a",
        open_note_id: note.meta.id,
        open_note_buffer_id: note.buffer_id,
        last_vault_id: "vault-a",
        last_note_id: "notes/b.md",
        last_buffer_id: "notes/b.md",
      }),
    ).toBe(true);
  });

  it("opens buffer when buffer id changes for same note", () => {
    const note = open_note("notes/a.md:reload:1");
    expect(
      resolve_editor_sync_open({
        open_vault_id: "vault-a",
        open_note_id: note.meta.id,
        open_note_buffer_id: note.buffer_id,
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
        last_buffer_id: "notes/a.md",
      }),
    ).toBe(true);
  });

  it("does not reopen when note id and buffer id are unchanged", () => {
    const note = open_note("notes/a.md");
    expect(
      resolve_editor_sync_open({
        open_vault_id: "vault-a",
        open_note_id: note.meta.id,
        open_note_buffer_id: note.buffer_id,
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
        last_buffer_id: "notes/a.md",
      }),
    ).toBe(false);
  });

  it("opens buffer when vault identity changes for the same note", () => {
    const note = open_note("notes/a.md");
    expect(
      resolve_editor_sync_open({
        open_vault_id: "vault-b",
        open_note_id: note.meta.id,
        open_note_buffer_id: note.buffer_id,
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
        last_buffer_id: "notes/a.md",
      }),
    ).toBe(true);
  });

  it("uses cache restore policy when switching note identity", () => {
    expect(
      resolve_editor_sync_restore_policy({
        open_vault_id: "vault-a",
        open_note_id: "notes/b.md",
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
      }),
    ).toBe("reuse_cache");
  });

  it("uses cache restore policy when switching vaults", () => {
    expect(
      resolve_editor_sync_restore_policy({
        open_vault_id: "vault-b",
        open_note_id: "notes/a.md",
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
      }),
    ).toBe("reuse_cache");
  });

  it("uses fresh restore policy for same-note buffer resets", () => {
    expect(
      resolve_editor_sync_restore_policy({
        open_vault_id: "vault-a",
        open_note_id: "notes/a.md",
        last_vault_id: "vault-a",
        last_note_id: "notes/a.md",
      }),
    ).toBe("fresh");
  });
});

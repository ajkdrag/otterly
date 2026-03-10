import { describe, expect, it, vi } from "vitest";
import type { EditorPort, EditorSession } from "$lib/features/editor/ports";
import { EditorService } from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(note_path: string, markdown: string): OpenNoteState {
  const path = as_note_path(note_path);
  return {
    meta: {
      id: path,
      path,
      name: note_path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "",
      title: note_path.replace(/\.md$/i, ""),
      mtime_ms: 0,
      size_bytes: markdown.length,
    },
    markdown: as_markdown_text(markdown),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_session_with_find(initial_markdown: string): EditorSession {
  let current_markdown = initial_markdown;
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn((markdown: string) => {
      current_markdown = markdown;
    }),
    get_markdown: vi.fn(() => current_markdown),
    insert_text_at_cursor: vi.fn(),
    set_selection: vi.fn(),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    update_find_state: vi.fn(),
  };
}

describe("EditorService update_find_state", () => {
  it("forwards update_find_state to session when session exists", async () => {
    const session = create_session_with_find("# Test");
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve(session)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
      },
    );

    const root = {} as HTMLDivElement;
    const note = create_open_note("test.md", "# Test");

    await service.mount({ root, note });

    service.update_find_state("test", 0);
    expect(session.update_find_state).toHaveBeenCalledWith("test", 0);

    service.update_find_state("another", 3);
    expect(session.update_find_state).toHaveBeenCalledWith("another", 3);
  });

  it("does not throw when no session exists", () => {
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve({} as EditorSession)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
      },
    );

    expect(() => {
      service.update_find_state("test", 0);
    }).not.toThrow();
  });

  it("clears find state with empty query", async () => {
    const session = create_session_with_find("# Test");
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();
    vault_store.set_vault(create_test_vault());

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve(session)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
      },
    );

    const root = {} as HTMLDivElement;
    const note = create_open_note("test.md", "# Test");

    await service.mount({ root, note });

    service.update_find_state("test", 0);
    expect(session.update_find_state).toHaveBeenCalledWith("test", 0);

    service.update_find_state("", 0);
    expect(session.update_find_state).toHaveBeenCalledWith("", 0);
  });
});

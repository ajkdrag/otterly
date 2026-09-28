import type { Vault } from "$lib/shared/types/vault";
import type { NoteMeta } from "$lib/shared/types/note";
import type {
  CodeBlockViewState,
  OpenNoteState,
} from "$lib/shared/types/editor";
import type {
  VaultId,
  VaultPath,
  NoteId,
  NotePath,
} from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";

export function create_test_vault(overrides?: Partial<Vault>): Vault {
  return {
    id: "vault-1" as VaultId,
    name: "Test Vault",
    path: "/test/vault" as VaultPath,
    created_at: 0,
    ...overrides,
  };
}

export function create_test_note(id: string, title: string): NoteMeta {
  return {
    id: id as NoteId,
    path: `${id}.md` as NotePath,
    name: id.split("/").at(-1) ?? id,
    title,
    mtime_ms: 0,
    size_bytes: 0,
  };
}

export function create_open_note_state(
  note: NoteMeta,
  markdown = "content",
): OpenNoteState {
  return {
    meta: note,
    markdown: as_markdown_text(markdown),
    buffer_id: note.id,
    is_dirty: false,
  };
}

export function code_block_view_state(
  source_height: number,
): CodeBlockViewState {
  return {
    source_height,
    diagram_height: null,
    source_hidden: false,
    diagram_zoom: 1,
  };
}

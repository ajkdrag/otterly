import type { NoteDoc } from "$lib/shared/types/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

export type OpenNoteState = NoteDoc & {
  buffer_id: string;
  is_dirty: boolean;
};

export type CursorInfo = {
  line: number;
  column: number;
  total_lines: number;
  total_words: number;
  anchor?: number;
  head?: number;
};

export type CodeBlockHeights = Array<number | null>;

export type EditorBufferViewState = {
  cursor: CursorInfo | null;
  code_block_heights: CodeBlockHeights;
};

export function to_editor_buffer_view_state(
  snapshot:
    | Pick<EditorBufferViewState, "cursor" | "code_block_heights">
    | null
    | undefined,
): EditorBufferViewState {
  return {
    cursor: snapshot?.cursor ?? null,
    code_block_heights: snapshot?.code_block_heights ?? [],
  };
}

export type PastedImagePayload = {
  bytes: Uint8Array;
  mime_type: string;
  file_name: string | null;
};

export type ImagePasteRequest = {
  note_id: NoteId;
  note_path: NotePath;
  image: PastedImagePayload;
};

export function to_open_note_state(
  doc: NoteDoc,
  options?: { buffer_id?: string },
): OpenNoteState {
  return {
    ...doc,
    buffer_id: options?.buffer_id ?? doc.meta.id,
    is_dirty: false,
  };
}

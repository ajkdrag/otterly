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

// UI state for each code block, in document order. null means defaults.
// None of it touches the Markdown.
export type CodeBlockViewState = {
  // Heights in px set by the resize handles. null sizes to the content.
  source_height: number | null;
  diagram_height: number | null;
  // Diagram blocks can hide their source and show only the diagram.
  source_hidden: boolean;
  // 1 fits the diagram to the block width.
  diagram_zoom: number;
};

export type CodeBlockViewStates = Array<CodeBlockViewState | null>;

export function are_code_block_view_states_equal(
  left: CodeBlockViewStates,
  right: CodeBlockViewStates,
): boolean {
  return (
    left.length === right.length &&
    left.every((view_state, index) =>
      is_same_code_block_view_state(view_state ?? null, right[index] ?? null),
    )
  );
}

export function is_same_code_block_view_state(
  left: CodeBlockViewState | null,
  right: CodeBlockViewState | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.source_height === right.source_height &&
    left.diagram_height === right.diagram_height &&
    left.source_hidden === right.source_hidden &&
    left.diagram_zoom === right.diagram_zoom
  );
}

export type EditorBufferViewState = {
  cursor: CursorInfo | null;
  code_block_view_states: CodeBlockViewStates;
};

export function to_editor_buffer_view_state(
  snapshot:
    | Pick<EditorBufferViewState, "cursor" | "code_block_view_states">
    | null
    | undefined,
): EditorBufferViewState {
  return {
    cursor: snapshot?.cursor ?? null,
    code_block_view_states: snapshot?.code_block_view_states ?? [],
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

import type { NotePath } from "$lib/shared/types/ids";
import type {
  CodeBlockViewStates,
  CursorInfo,
  OpenNoteState,
} from "$lib/shared/types/editor";

export type TabId = string;

export type Tab = {
  id: TabId;
  note_path: NotePath;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean;
};

export type TabEditorSnapshot = {
  scroll_top: number;
  cursor: CursorInfo | null;
  code_block_view_states: CodeBlockViewStates;
};

export type ClosedTabEntry = {
  note_path: NotePath;
  title: string;
  scroll_top: number;
  cursor: CursorInfo | null;
  code_block_view_states: CodeBlockViewStates;
  draft_note: OpenNoteState | null;
};

import type {
  CodeBlockViewStates,
  OpenNoteState,
  CursorInfo,
} from "$lib/shared/types/editor";
import type { NotePath } from "$lib/shared/types/ids";

export type SessionEntry = {
  note_path: NotePath;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean;
  scroll_top: number;
  cursor: CursorInfo | null;
  code_block_view_states: CodeBlockViewStates;
  cached_note: OpenNoteState | null;
};

export type VaultSession = {
  tabs: SessionEntry[];
  active_tab_path: NotePath | null;
};

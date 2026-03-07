import type { NotePath } from "$lib/shared/types/ids";
import type { CursorInfo } from "$lib/shared/types/editor";

export type TabId = string;

export type Tab = {
  id: TabId;
  title: string;
  is_pinned: boolean;
  is_dirty: boolean;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
);

export type TabEditorSnapshot = {
  scroll_top: number;
  cursor: CursorInfo | null;
};

export type ClosedTabEntry = {
  title: string;
  scroll_top: number;
  cursor: CursorInfo | null;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
);

export type PersistedTab = {
  is_pinned: boolean;
  cursor: CursorInfo | null;
} & (
  | { kind: "note"; note_path: NotePath }
  | { kind: "document"; file_path: string; file_type: string }
);

export type PersistedTabState = {
  tabs: PersistedTab[];
  active_tab_path: string | null;
};

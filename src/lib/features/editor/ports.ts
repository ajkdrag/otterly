import type { VaultId } from "$lib/shared/types/ids";
import type {
  CodeBlockViewStates,
  CursorInfo,
  EditorBufferViewState,
  EditorViewMode,
  PastedImagePayload,
} from "$lib/shared/types/editor";

export type BufferConfig = {
  note_path: string;
  vault_id: VaultId | null;
  initial_markdown: string;
  restore_policy: BufferRestorePolicy;
  view_state?: EditorBufferViewState | null;
};

export type BufferRestorePolicy = "reuse_cache" | "fresh";

export type EditorSession = {
  destroy: () => void;
  set_markdown: (markdown: string) => void;
  get_markdown: () => string;
  set_code_block_view_states: (heights: CodeBlockViewStates) => void;
  get_code_block_view_states: () => CodeBlockViewStates;
  restore_view_state: (view_state: EditorBufferViewState | null) => void;
  insert_text_at_cursor: (text: string) => void;
  set_selection: (anchor: number, head: number) => void;
  restore_cursor?: (cursor: CursorInfo) => void;
  get_scroll_top?: () => number;
  set_scroll_top?: (value: number) => void;
  mark_clean: (note_path?: string, saved_markdown?: string) => void;
  is_dirty: () => boolean;
  focus: () => void;
  // Switches a Markdown note between its rich and source views. Does nothing
  // for other files.
  toggle_source_mode: () => void;
  set_wiki_suggestions?: (
    items: Array<{
      title: string;
      path: string;
      kind: "existing" | "planned";
      ref_count?: number | undefined;
    }>,
  ) => void;
  open_buffer: (config: BufferConfig) => void;
  rename_buffer: (old_note_path: string, new_note_path: string) => void;
  close_buffer: (note_path: string) => void;
  update_find_state?: (query: string, selected_index: number) => void;
  // The #tag at the caret, without its `#`. Null unless a Markdown note has
  // focus with the caret in or right after a tag.
  tag_at_cursor: () => string | null;
};

export type EditorEventHandlers = {
  on_markdown_change: (markdown: string) => void;
  on_dirty_state_change: (is_dirty: boolean) => void;
  on_cursor_change?: (info: CursorInfo) => void;
  on_view_mode_change?: (mode: EditorViewMode) => void;
  on_code_block_view_states_change?: (heights: CodeBlockViewStates) => void;
  on_internal_link_click?: (raw_path: string, base_note_path: string) => void;
  on_external_link_click?: (url: string) => void;
  on_file_link_click?: (file_path: string) => void;
  on_image_paste_requested?: (payload: PastedImagePayload) => void;
  on_wiki_suggest_query?: (query: string) => void;
  // Without these, chips are not clickable and there is no `#` completion
  // (the document window has no vault to search).
  on_tag_click?: (tag: string) => void;
  query_tags?: (
    partial: string,
    signal: AbortSignal,
  ) => Promise<{ tag: string; count: number }[]>;
};

export type EditorSessionConfig = {
  root: HTMLElement;
  initial_markdown: string;
  note_path: string;
  vault_id: VaultId | null;
  events: EditorEventHandlers;
};

export interface EditorPort {
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>;
}

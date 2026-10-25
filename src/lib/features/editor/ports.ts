import type { VaultId } from "$lib/shared/types/ids";
import type {
  CodeBlockViewStates,
  CursorInfo,
  EditorBufferViewState,
  EditorViewMode,
  PastedImagePayload,
  VimStatus,
} from "$lib/shared/types/editor";
import type { FindSpec } from "$lib/shared/types/search";

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
  // Turns Vim keys on or off for every buffer, keeping each one's history.
  set_vim_enabled: (enabled: boolean) => void;
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
  update_find_state?: (spec: FindSpec, selected_index: number) => void;
  // Replaces the selected find match and selects the next one. Returns the new
  // selected index, or null when there was nothing to replace.
  replace_find_match?: (replacement: string) => number | null;
  // Replaces every find match in one undo step. Returns how many it replaced.
  replace_all_find_matches?: (replacement: string) => number;
  // Selects `length` UTF-16 units at `column` of a 1-based line and scrolls
  // it to the center. Columns do not count a leading BOM. Does not focus.
  select_line_range?: (line: number, column: number, length: number) => void;
  // The #tag at the caret, without its `#`. Null unless a Markdown note has
  // focus with the caret in or right after a tag.
  tag_at_cursor: () => string | null;
};

export type EditorEventHandlers = {
  on_markdown_change: (markdown: string) => void;
  on_dirty_state_change: (is_dirty: boolean) => void;
  on_cursor_change?: (info: CursorInfo) => void;
  on_view_mode_change?: (mode: EditorViewMode) => void;
  // null when Vim is off.
  on_vim_status_change?: (status: VimStatus | null) => void;
  // :w and :wq in the Vim editor. The promise settles when the save is done
  // or has failed, and :wq closes only after it resolves.
  on_save_request?: () => void | Promise<void>;
  // :q, and the second half of :wq.
  on_close_request?: () => void;
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
  vim_enabled: boolean;
  events: EditorEventHandlers;
};

export interface EditorPort {
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>;
}

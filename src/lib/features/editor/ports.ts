import type { VaultId } from "$lib/shared/types/ids";
import type { CursorInfo, PastedImagePayload } from "$lib/shared/types/editor";
import type { OutlineHeading } from "$lib/features/outline/types/outline";

export type BufferConfig = {
  note_path: string;
  vault_id: VaultId | null;
  initial_markdown: string;
  restore_policy: BufferRestorePolicy;
};

export type BufferRestorePolicy = "reuse_cache" | "fresh";

export type EditorSession = {
  destroy: () => void;
  set_markdown: (markdown: string) => void;
  get_markdown: () => string;
  insert_text_at_cursor: (text: string) => void;
  mark_clean: () => void;
  is_dirty: () => boolean;
  focus: () => void;
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
  scroll_to_position?: (pos: number) => void;
};

export type EditorEventHandlers = {
  on_markdown_change: (markdown: string) => void;
  on_dirty_state_change: (is_dirty: boolean) => void;
  on_cursor_change?: (info: CursorInfo) => void;
  on_internal_link_click?: (raw_path: string, base_note_path: string) => void;
  on_external_link_click?: (url: string) => void;
  on_image_paste_requested?: (payload: PastedImagePayload) => void;
  on_wiki_suggest_query?: (query: string) => void;
  on_outline_change?: (headings: OutlineHeading[]) => void;
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

import type {
  BufferRestorePolicy,
  EditorPort,
  EditorSession,
} from "$lib/features/editor/ports";
import type {
  OpenNoteState,
  CursorInfo,
  PastedImagePayload,
} from "$lib/shared/types/editor";
import type { MarkdownText, NoteId, NotePath } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";
import type { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { SearchService } from "$lib/features/search";
import type { OutlineStore } from "$lib/features/outline";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("editor_service");

function note_name_from_path(path: string): string {
  const leaf = path.split("/").at(-1) ?? path;
  return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
}

export type EditorServiceCallbacks = {
  on_internal_link_click: (raw_path: string, base_note_path: string) => void;
  on_external_link_click: (url: string) => void;
  on_image_paste_requested: (
    note_id: NoteId,
    note_path: NotePath,
    image: PastedImagePayload,
  ) => void;
};

type EditorFlushResult = {
  note_id: NoteId;
  markdown: MarkdownText;
};

type EditorSessionEvents = Parameters<EditorPort["start_session"]>[0]["events"];

export class EditorService {
  private session: EditorSession | null = null;
  private host_root: HTMLDivElement | null = null;
  private active_note: OpenNoteState | null = null;
  private session_generation = 0;

  constructor(
    private readonly editor_port: EditorPort,
    private readonly vault_store: VaultStore,
    private readonly editor_store: EditorStore,
    private readonly op_store: OpStore,
    private readonly callbacks: EditorServiceCallbacks,
    private readonly search_service?: SearchService,
    private readonly outline_store?: OutlineStore,
  ) {}

  is_mounted(): boolean {
    return this.host_root !== null && this.session !== null;
  }

  async mount(args: {
    root: HTMLDivElement;
    note: OpenNoteState;
  }): Promise<void> {
    this.host_root = args.root;
    this.active_note = args.note;

    this.op_store.start("editor.mount", Date.now());
    try {
      await this.recreate_session();
      this.focus();
      this.op_store.succeed("editor.mount");
    } catch (error) {
      log.error("Editor mount failed", { error });
      this.op_store.fail("editor.mount", error_message(error));
    }
  }

  unmount() {
    this.invalidate_session_generation();
    this.teardown_session();
    this.host_root = null;
    this.active_note = null;
  }

  open_buffer(
    note: OpenNoteState,
    restore_policy: BufferRestorePolicy = "reuse_cache",
  ): void {
    this.active_note = note;

    if (!this.host_root || !this.session) return;

    this.session.open_buffer({
      note_path: note.meta.path,
      vault_id: this.vault_store.vault?.id ?? null,
      initial_markdown: note.markdown,
      restore_policy,
    });
    this.focus();
  }

  rename_buffer(old_note_path: NotePath, new_note_path: NotePath) {
    if (this.active_note?.meta.path === old_note_path) {
      const name = note_name_from_path(new_note_path);
      this.active_note = {
        ...this.active_note,
        meta: {
          ...this.active_note.meta,
          id: new_note_path,
          path: new_note_path,
          name,
          title: name,
        },
      };
    }
    this.session?.rename_buffer(old_note_path, new_note_path);
  }

  insert_text(text: string) {
    this.session?.insert_text_at_cursor(text);
  }

  mark_clean() {
    this.session?.mark_clean();
  }

  flush(): EditorFlushResult | null {
    if (!this.session || !this.active_note) return null;

    const markdown = this.session.get_markdown();
    const payload: EditorFlushResult = {
      note_id: this.active_note.meta.id,
      markdown: as_markdown_text(markdown),
    };

    this.editor_store.set_markdown(payload.note_id, payload.markdown);
    return payload;
  }

  get_scroll_top(): number {
    return this.host_root?.parentElement?.scrollTop ?? 0;
  }

  set_scroll_top(value: number) {
    const container = this.host_root?.parentElement;
    if (!container || value <= 0) return;
    requestAnimationFrame(() => {
      container.scrollTop = value;
    });
  }

  focus() {
    this.session?.focus();
  }

  close_buffer(note_path: NotePath) {
    this.session?.close_buffer(note_path);
  }

  update_find_state(query: string, selected_index: number) {
    this.session?.update_find_state?.(query, selected_index);
  }

  scroll_to_position(pos: number) {
    this.session?.scroll_to_position?.(pos);
  }

  private next_session_generation(): number {
    this.session_generation += 1;
    return this.session_generation;
  }

  private invalidate_session_generation() {
    this.session_generation += 1;
  }

  private is_generation_current(generation: number): boolean {
    return generation === this.session_generation;
  }

  private get_active_note_id(): NoteId | null {
    return this.active_note?.meta.id ?? null;
  }

  private get_active_note_path(): NotePath | null {
    return this.active_note?.meta.path ?? null;
  }

  private with_active_note_id(
    generation: number,
    fn: (id: NoteId) => void,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const id = this.get_active_note_id();
    if (!id) return;
    fn(id);
  }

  private with_active_note_identity(
    generation: number,
    fn: (id: NoteId, path: NotePath) => void,
  ): void {
    if (!this.is_generation_current(generation)) return;
    const id = this.get_active_note_id();
    const path = this.get_active_note_path();
    if (!id || !path) return;
    fn(id, path);
  }

  private map_wiki_suggestions(
    results: Awaited<
      ReturnType<
        NonNullable<EditorService["search_service"]>["suggest_wiki_links"]
      >
    >["results"],
  ) {
    return results.map((result_item) => {
      if (result_item.kind === "planned") {
        return {
          kind: "planned" as const,
          title: note_name_from_path(result_item.target_path),
          path: result_item.target_path,
          ref_count: result_item.ref_count,
        };
      }
      return {
        kind: "existing" as const,
        title: result_item.note.name,
        path: result_item.note.path,
      };
    });
  }

  private handle_wiki_suggest_query(generation: number, query: string): void {
    if (!this.is_generation_current(generation)) return;
    const search_service = this.search_service;
    if (!search_service) return;

    void search_service.suggest_wiki_links(query).then((result) => {
      if (!this.is_generation_current(generation)) return;
      if (result.status === "stale") return;
      if (result.status !== "success") {
        this.session?.set_wiki_suggestions?.([]);
        return;
      }

      this.session?.set_wiki_suggestions?.(
        this.map_wiki_suggestions(result.results),
      );
    });
  }

  private create_session_events(generation: number): EditorSessionEvents {
    const events: EditorSessionEvents = {
      on_markdown_change: (markdown: string) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_markdown(id, as_markdown_text(markdown));
        });
      },
      on_dirty_state_change: (is_dirty: boolean) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_dirty(id, is_dirty);
        });
      },
      on_cursor_change: (cursor: CursorInfo) => {
        this.with_active_note_id(generation, (id) => {
          this.editor_store.set_cursor(id, cursor);
        });
      },
      on_internal_link_click: (raw_path: string, base_note_path: string) => {
        if (!this.is_generation_current(generation)) return;
        this.callbacks.on_internal_link_click(raw_path, base_note_path);
      },
      on_external_link_click: (url: string) => {
        if (!this.is_generation_current(generation)) return;
        this.callbacks.on_external_link_click(url);
      },
      on_image_paste_requested: (image: PastedImagePayload) => {
        this.with_active_note_identity(generation, (id, path) => {
          this.callbacks.on_image_paste_requested(id, path, image);
        });
      },
    };

    if (this.search_service) {
      events.on_wiki_suggest_query = (query: string) => {
        this.handle_wiki_suggest_query(generation, query);
      };
    }

    if (this.outline_store) {
      const outline_store = this.outline_store;
      events.on_outline_change = (headings) => {
        if (!this.is_generation_current(generation)) return;
        outline_store.set_headings(headings);
      };
    }

    return events;
  }

  private async recreate_session(): Promise<void> {
    const host_root = this.host_root;
    const active_note = this.active_note;
    if (!host_root || !active_note) return;

    const generation = this.next_session_generation();

    this.teardown_session();
    if (typeof host_root.replaceChildren === "function") {
      host_root.replaceChildren();
    }

    const next_session = await this.editor_port.start_session({
      root: host_root,
      initial_markdown: active_note.markdown,
      note_path: active_note.meta.path,
      vault_id: this.vault_store.vault?.id ?? null,
      events: this.create_session_events(generation),
    });

    if (!this.is_generation_current(generation)) {
      this.destroy_session_instance(next_session);
      return;
    }

    this.session = next_session;
  }

  private teardown_session() {
    const current = this.session;
    if (!current) return;
    this.session = null;
    this.destroy_session_instance(current);
  }

  private destroy_session_instance(session: EditorSession) {
    try {
      session.destroy();
    } catch (error) {
      log.error("Editor teardown failed", { error });
    }
  }
}

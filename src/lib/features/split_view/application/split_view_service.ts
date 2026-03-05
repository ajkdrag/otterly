import { EditorService, EditorStore } from "$lib/features/editor";
import type { EditorPort } from "$lib/features/editor";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("split_view_service");

export class SplitViewService {
  private secondary_editor: EditorService | null = null;
  private secondary_store: EditorStore | null = null;

  constructor(
    private readonly editor_port: EditorPort,
    private readonly vault_store: VaultStore,
    private readonly op_store: OpStore,
    private readonly split_view_store: SplitViewStore,
  ) {}

  get_secondary_editor(): EditorService | null {
    return this.secondary_editor;
  }

  get_secondary_store(): EditorStore | null {
    return this.secondary_store;
  }

  async open_to_side(note: OpenNoteState, root: HTMLDivElement): Promise<void> {
    log.info("Opening note in split view", { note_id: note.meta.id });

    if (!this.secondary_editor) {
      this.secondary_store = new EditorStore();
      this.secondary_editor = new EditorService(
        this.editor_port,
        this.vault_store,
        this.secondary_store,
        this.op_store,
        {
          on_internal_link_click: () => {},
          on_external_link_click: () => {},
          on_image_paste_requested: () => {},
        },
      );
    }

    this.secondary_store?.set_open_note(note);
    await this.secondary_editor.mount({ root, note });
    this.split_view_store.open_secondary(note);
  }

  switch_buffer(note: OpenNoteState): void {
    if (!this.secondary_editor || !this.secondary_store) return;
    this.secondary_store.set_open_note(note);
    this.secondary_editor.open_buffer(note);
    this.split_view_store.set_secondary_note(note);
  }

  close(): void {
    log.info("Closing split view");
    if (this.secondary_editor) {
      this.secondary_editor.unmount();
      this.secondary_editor = null;
    }
    this.secondary_store = null;
    this.split_view_store.close();
  }

  is_active(): boolean {
    return this.split_view_store.active;
  }

  destroy(): void {
    this.close();
  }
}

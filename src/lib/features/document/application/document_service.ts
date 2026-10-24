import type { EditorPort, EditorSession } from "$lib/features/editor";
import type { DocumentPort } from "$lib/features/document/ports";
import type { DocumentStore } from "$lib/features/document/state/document_store.svelte";
import type {
  DocumentFile,
  DocumentSaveResult,
} from "$lib/features/document/types/document";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("document_service");

export type DocumentServiceCallbacks = {
  on_external_link_click: (url: string) => void;
  on_unsupported_link_click: () => void;
};

// Owns the one file and the one editor of a document window.
export class DocumentService {
  private session: EditorSession | null = null;
  // The editor starts with this. The vim_mode reactor sets it.
  private vim_enabled = false;

  constructor(
    private readonly document_port: DocumentPort,
    private readonly editor_port: EditorPort,
    private readonly store: DocumentStore,
    private readonly now_ms: () => number,
    private readonly callbacks: DocumentServiceCallbacks,
  ) {}

  async load(): Promise<void> {
    try {
      this.store.set_loaded(await this.document_port.read_document());
    } catch (error) {
      log.error("Could not read document", { error: error_message(error) });
      this.store.set_load_error(read_error_message(error));
    }
  }

  async mount_editor(root: HTMLElement): Promise<void> {
    const file = this.store.file;
    if (!file || this.session) return;
    this.session = await this.editor_port.start_session({
      root,
      initial_markdown: file.text,
      // The path picks rich or text mode. There is no vault, so links and
      // images resolve through the document window's own handlers.
      note_path: file.path,
      vault_id: null,
      vim_enabled: this.vim_enabled,
      events: {
        on_markdown_change: (markdown) => {
          this.store.note_edit(markdown);
        },
        on_dirty_state_change: (is_dirty) => {
          this.store.set_dirty(is_dirty);
        },
        on_cursor_change: (cursor) => {
          this.store.set_cursor(cursor);
        },
        on_view_mode_change: (mode) => {
          this.store.set_view_mode(mode);
        },
        on_vim_mode_change: (mode) => {
          this.store.set_vim_mode(mode);
        },
        on_external_link_click: (url) => {
          this.callbacks.on_external_link_click(url);
        },
        on_internal_link_click: () => {
          this.callbacks.on_unsupported_link_click();
        },
        on_file_link_click: () => {
          this.callbacks.on_unsupported_link_click();
        },
      },
    });
    // The setting may have changed while the editor started, before
    // this.session could take the call. It does nothing if they match.
    this.session.set_vim_enabled(this.vim_enabled);
    this.session.focus();
  }

  unmount_editor() {
    this.session?.destroy();
    this.session = null;
  }

  // Pass overwrite to replace a file that changed on disk.
  async save(overwrite = false): Promise<DocumentSaveResult> {
    const file = this.store.file;
    const session = this.session;
    if (!file || !session || this.store.is_saving) return { status: "skipped" };
    const text = session.get_markdown();
    this.store.set_saving(true);
    try {
      const mtime_ms = await this.document_port.write_document(
        text,
        overwrite ? null : file.mtime_ms,
      );
      // Typing during the write stays dirty: the baseline is what we wrote.
      session.mark_clean(file.path, text);
      this.store.mark_saved(mtime_ms, this.now_ms());
      return { status: "saved" };
    } catch (error) {
      const message = error_message(error);
      if (message.includes("conflict:")) {
        this.store.set_conflict(true);
        return { status: "conflict" };
      }
      log.error("Could not save document", { error: message });
      return { status: "failed", error: message };
    } finally {
      this.store.set_saving(false);
    }
  }

  // Throws away unsaved edits and shows the file as it is on disk.
  async reload_from_disk(): Promise<void> {
    const session = this.session;
    if (!session) return;
    let file: DocumentFile;
    try {
      file = await this.document_port.read_document();
    } catch (error) {
      log.error("Could not reload document", { error: error_message(error) });
      return;
    }
    session.open_buffer({
      note_path: file.path,
      vault_id: null,
      initial_markdown: file.text,
      restore_policy: "fresh",
    });
    this.store.set_loaded(file);
  }

  // Called when the window gains focus. There is no watcher outside a vault,
  // so this is when we notice edits made by other programs.
  async check_disk_changes(): Promise<void> {
    const known = this.store.file;
    if (!known || !this.session || this.store.is_saving) return;
    let file: DocumentFile;
    try {
      file = await this.document_port.read_document();
    } catch {
      return;
    }
    if (file.mtime_ms === known.mtime_ms) return;
    if (this.store.is_dirty) {
      this.store.set_conflict(true);
      return;
    }
    await this.reload_from_disk();
  }

  toggle_source_mode() {
    this.session?.toggle_source_mode();
  }

  set_vim_enabled(enabled: boolean) {
    this.vim_enabled = enabled;
    this.session?.set_vim_enabled(enabled);
  }

  focus() {
    this.session?.focus();
  }

  update_find_state(query: string, selected_index: number) {
    this.session?.update_find_state?.(query, selected_index);
  }

  // The editor's canonical source, which can be newer than the store's copy.
  get_markdown(): string | null {
    return this.session?.get_markdown() ?? null;
  }

  // Returns false on failure so the action can tell the user.
  async reveal_in_file_manager(): Promise<boolean> {
    try {
      await this.document_port.reveal_document();
      return true;
    } catch (error) {
      log.error("Reveal document failed", { error: error_message(error) });
      return false;
    }
  }
}

function read_error_message(error: unknown): string {
  const message = error_message(error);
  if (message.includes("file_not_text"))
    return "This file is not text, or is too large to edit.";
  return message;
}

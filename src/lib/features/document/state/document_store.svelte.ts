import type { CursorInfo, EditorViewMode } from "$lib/shared/types/editor";
import type { DocumentFile } from "$lib/features/document/types/document";

export type DocumentLoadState = "loading" | "ready" | "error";

export class DocumentStore {
  file = $state<DocumentFile | null>(null);
  // A mirror of the editor text, up to 200 ms behind typing. It is for display
  // and find only. Save and copy read the editor session, which is current.
  markdown = $state("");
  load_state = $state<DocumentLoadState>("loading");
  load_error = $state<string | null>(null);
  is_dirty = $state(false);
  // Bumped on every edit, so autosave restarts its delay while you type.
  edit_revision = $state(0);
  is_saving = $state(false);
  // The file changed on disk while we had unsaved edits.
  has_conflict = $state(false);
  last_saved_at = $state<number | null>(null);
  view_mode = $state<EditorViewMode>("rich");
  cursor = $state<CursorInfo | null>(null);

  set_loaded(file: DocumentFile) {
    this.file = file;
    this.markdown = file.text;
    this.load_state = "ready";
    this.load_error = null;
    this.is_dirty = false;
    this.has_conflict = false;
  }

  set_load_error(error: string) {
    this.load_state = "error";
    this.load_error = error;
  }

  set_dirty(is_dirty: boolean) {
    this.is_dirty = is_dirty;
  }

  note_edit(markdown: string) {
    this.markdown = markdown;
    this.edit_revision += 1;
  }

  set_saving(is_saving: boolean) {
    this.is_saving = is_saving;
  }

  mark_saved(mtime_ms: number, saved_at_ms: number) {
    if (this.file) this.file = { ...this.file, mtime_ms };
    this.has_conflict = false;
    this.last_saved_at = saved_at_ms;
  }

  set_conflict(has_conflict: boolean) {
    this.has_conflict = has_conflict;
  }

  set_view_mode(mode: EditorViewMode) {
    this.view_mode = mode;
  }

  set_cursor(cursor: CursorInfo) {
    this.cursor = cursor;
  }
}

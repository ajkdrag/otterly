import type { OpenNoteState, CursorInfo } from "$lib/shared/types/editor";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";

export class EditorStore {
  open_note = $state<OpenNoteState | null>(null);
  cursor = $state<CursorInfo | null>(null);
  last_saved_at = $state<number | null>(null);

  set_open_note(open_note: OpenNoteState) {
    this.open_note = open_note;
    this.cursor = null;
    this.last_saved_at = open_note.meta.mtime_ms || null;
  }

  clear_open_note() {
    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
  }

  set_markdown(note_id: NoteId, markdown: OpenNoteState["markdown"]) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      markdown,
    };
  }

  set_dirty(note_id: NoteId, is_dirty: boolean) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      is_dirty,
    };
  }

  mark_clean(note_id: NoteId, saved_at_ms?: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      is_dirty: false,
      ...(saved_at_ms !== undefined && {
        meta: { ...this.open_note.meta, mtime_ms: saved_at_ms },
      }),
    };
    if (saved_at_ms !== undefined) {
      this.last_saved_at = saved_at_ms;
    }
  }

  /** Replaces the stored mtime for conflict detection. Set to 0 to disable the mtime guard. */
  update_mtime(note_id: NoteId, mtime_ms: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.open_note = {
      ...this.open_note,
      meta: { ...this.open_note.meta, mtime_ms },
    };
  }

  update_open_note_path(new_path: NotePath) {
    if (!this.open_note) return;
    const name = note_name_from_path(new_path);
    this.open_note = {
      ...this.open_note,
      meta: {
        ...this.open_note.meta,
        id: new_path,
        path: new_path,
        name,
        title: name,
      },
    };
  }

  update_open_note_path_prefix(old_prefix: string, new_prefix: string) {
    if (!this.open_note) return;
    const current_path = this.open_note.meta.path;
    if (!current_path.startsWith(old_prefix)) return;

    const new_path =
      `${new_prefix}${current_path.slice(old_prefix.length)}` as NotePath;
    const name = note_name_from_path(new_path);
    this.open_note = {
      ...this.open_note,
      meta: {
        ...this.open_note.meta,
        id: new_path,
        path: new_path,
        name,
        title: name,
      },
    };
  }

  set_cursor(note_id: NoteId, cursor: CursorInfo | null) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    this.cursor = cursor;
  }

  reset() {
    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
  }
}

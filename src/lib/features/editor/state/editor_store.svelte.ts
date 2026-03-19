import type { OpenNoteState, CursorInfo } from "$lib/shared/types/editor";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";

function are_cursors_equal(
  left: CursorInfo | null,
  right: CursorInfo | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.line === right.line &&
    left.column === right.column &&
    left.total_lines === right.total_lines &&
    left.total_words === right.total_words &&
    left.anchor === right.anchor &&
    left.head === right.head
  );
}

function are_open_notes_equal(
  left: OpenNoteState | null,
  right: OpenNoteState,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left) {
    return false;
  }

  return (
    left.buffer_id === right.buffer_id &&
    left.is_dirty === right.is_dirty &&
    left.markdown === right.markdown &&
    left.meta.id === right.meta.id &&
    left.meta.path === right.meta.path &&
    left.meta.name === right.meta.name &&
    left.meta.title === right.meta.title &&
    left.meta.mtime_ms === right.meta.mtime_ms &&
    left.meta.size_bytes === right.meta.size_bytes
  );
}

export class EditorStore {
  open_note = $state<OpenNoteState | null>(null);
  cursor = $state<CursorInfo | null>(null);
  last_saved_at = $state<number | null>(null);
  session_persist_revision = $state(0);

  private bump_session_persist_revision() {
    this.session_persist_revision += 1;
  }

  set_open_note(open_note: OpenNoteState) {
    const next_last_saved_at = open_note.meta.mtime_ms || null;
    const is_unchanged =
      are_open_notes_equal(this.open_note, open_note) &&
      this.cursor === null &&
      this.last_saved_at === next_last_saved_at;
    if (is_unchanged) {
      return;
    }

    this.open_note = open_note;
    this.cursor = null;
    this.last_saved_at = next_last_saved_at;
    this.bump_session_persist_revision();
  }

  clear_open_note() {
    if (!this.open_note && !this.cursor && this.last_saved_at === null) {
      return;
    }

    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
    this.bump_session_persist_revision();
  }

  set_markdown(note_id: NoteId, markdown: OpenNoteState["markdown"]) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    if (this.open_note.markdown === markdown) return;
    this.open_note = {
      ...this.open_note,
      markdown,
    };
    this.bump_session_persist_revision();
  }

  set_dirty(note_id: NoteId, is_dirty: boolean) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    if (this.open_note.is_dirty === is_dirty) return;
    this.open_note = {
      ...this.open_note,
      is_dirty,
    };
    this.bump_session_persist_revision();
  }

  mark_clean(note_id: NoteId, saved_at_ms?: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    const next_mtime_ms = saved_at_ms ?? this.open_note.meta.mtime_ms;
    const next_last_saved_at =
      saved_at_ms !== undefined ? saved_at_ms : this.last_saved_at;
    if (
      !this.open_note.is_dirty &&
      this.open_note.meta.mtime_ms === next_mtime_ms &&
      this.last_saved_at === next_last_saved_at
    ) {
      return;
    }

    this.open_note = {
      ...this.open_note,
      is_dirty: false,
      ...(saved_at_ms !== undefined && {
        meta: { ...this.open_note.meta, mtime_ms: next_mtime_ms },
      }),
    };
    if (saved_at_ms !== undefined) {
      this.last_saved_at = saved_at_ms;
    }
    this.bump_session_persist_revision();
  }

  update_mtime(note_id: NoteId, mtime_ms: number) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    if (this.open_note.meta.mtime_ms === mtime_ms) return;
    this.open_note = {
      ...this.open_note,
      meta: { ...this.open_note.meta, mtime_ms },
    };
    this.bump_session_persist_revision();
  }

  update_open_note_path(new_path: NotePath) {
    if (!this.open_note) return;
    if (this.open_note.meta.path === new_path) return;
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
    this.bump_session_persist_revision();
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
    this.bump_session_persist_revision();
  }

  set_cursor(note_id: NoteId, cursor: CursorInfo | null) {
    if (!this.open_note) return;
    if (this.open_note.meta.id !== note_id) return;
    if (are_cursors_equal(this.cursor, cursor)) return;
    this.cursor = cursor;
    this.bump_session_persist_revision();
  }

  reset() {
    if (!this.open_note && !this.cursor && this.last_saved_at === null) {
      return;
    }

    this.open_note = null;
    this.cursor = null;
    this.last_saved_at = null;
    this.bump_session_persist_revision();
  }
}

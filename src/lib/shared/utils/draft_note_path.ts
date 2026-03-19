import { as_note_path } from "$lib/shared/types/ids";

const DRAFT_NOTE_PREFIX = "draft:";

export function create_draft_note_path(now_ms: number, title: string) {
  return as_note_path(`${DRAFT_NOTE_PREFIX}${String(now_ms)}:${title}`);
}

export function is_draft_note_path(path: string): boolean {
  return path.startsWith(DRAFT_NOTE_PREFIX);
}

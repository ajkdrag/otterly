import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Vault } from "$lib/shared/types/vault";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

const DRAFT_PREFIX = "draft:";
const UNTITLED_PATTERN = /^Untitled(?:-(\d+))?$/;

function next_untitled_title(open_titles: string[]): string {
  let max = 0;

  for (const title of open_titles) {
    const match = title.match(UNTITLED_PATTERN);
    if (!match) continue;
    const value = match[1] ? Number(match[1]) : 1;
    if (value > max) max = value;
  }

  if (max <= 0) {
    return "Untitled-1";
  }

  return `Untitled-${String(max + 1)}`;
}

function create_draft_path(now_ms: number, title: string) {
  return as_note_path(`${DRAFT_PREFIX}${String(now_ms)}:${title}`);
}

export function is_draft_note_path(path: string): boolean {
  return path.startsWith(DRAFT_PREFIX);
}

export function create_untitled_open_note(args: {
  open_titles: string[];
  now_ms: number;
}): OpenNoteState {
  const title = next_untitled_title(args.open_titles);
  const draft_path = create_draft_path(args.now_ms, title);

  return {
    meta: {
      id: draft_path,
      path: draft_path,
      name: title,
      title,
      mtime_ms: args.now_ms,
      size_bytes: 0,
    },
    markdown: as_markdown_text(""),
    buffer_id: `untitled:${String(args.now_ms)}:${title}`,
    is_dirty: true,
  };
}

export function ensure_open_note(args: {
  vault: Vault | null;
  open_titles: string[];
  open_note: OpenNoteState | null;
  now_ms: number;
}): OpenNoteState | null {
  if (!args.vault) return args.open_note;
  if (args.open_note) return args.open_note;
  return create_untitled_open_note({
    open_titles: args.open_titles,
    now_ms: args.now_ms,
  });
}

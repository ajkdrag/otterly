import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteMatchDetail } from "$lib/shared/types/search";

export type TagCount = {
  tag: string;
  count: number;
};

export type TagNoteQuery = {
  tags: string[];
  // Narrows the tagged notes by name, title, path and body. Empty lists the
  // newest first.
  text: string;
  limit: number;
};

export type TaggedNote = {
  note: NoteMeta;
  // The FTS snippet for a body match, else the excerpt around the first tag.
  snippet: string | null;
  // Which field matched the text. Null without text.
  match_detail: NoteMatchDetail | null;
};

export type TagNotePage = {
  notes: TaggedNote[];
  total: number;
  // More notes match than `limit`, so `total` is a lower bound when there
  // is text.
  truncated: boolean;
};

export type TagNoteSearchResult =
  | { status: "ok"; page: TagNotePage }
  | { status: "failed"; error: string }
  | { status: "skipped" };

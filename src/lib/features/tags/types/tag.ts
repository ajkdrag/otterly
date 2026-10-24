import type { NoteMeta } from "$lib/shared/types/note";

export type TagCount = {
  tag: string;
  count: number;
};

export type TaggedNote = {
  note: NoteMeta;
  excerpt: string | null;
};

import type {
  TagCount,
  TaggedNote,
  TagNotePage,
} from "$lib/features/tags/types/tag";

export type TagsLoadStatus = "idle" | "loading" | "ready" | "error";

export class TagsStore {
  // `tags` and `tagged_notes` are raw: they are replaced, never mutated, and
  // deep proxies over thousands of rows cost time on every reload.
  tags = $state.raw<TagCount[]>([]);
  tags_status = $state<TagsLoadStatus>("idle");

  selected_tag = $state<string | null>(null);
  tagged_notes = $state.raw<TaggedNote[]>([]);
  // How many notes have the tag. tagged_notes holds at most the drill-down
  // limit of them.
  tagged_notes_total = $state(0);
  tagged_notes_status = $state<TagsLoadStatus>("idle");

  // Tags of the open note, from the live editor text.
  note_tags_path = $state<string | null>(null);
  note_tags = $state<string[]>([]);

  // A reload keeps the current list on screen. Only an empty list shows
  // "loading", so the pane does not flicker on every save.
  start_tags_load() {
    if (this.tags.length === 0) this.tags_status = "loading";
  }

  set_tags(tags: TagCount[]) {
    this.tags = tags;
    this.tags_status = "ready";
  }

  set_tags_error() {
    this.tags = [];
    this.tags_status = "error";
  }

  // Same rule as the tag list: reloading the selected tag keeps its notes
  // visible. Switching to another tag starts from an empty list.
  start_tagged_notes_load(tag: string) {
    if (tag !== this.selected_tag) {
      this.selected_tag = tag;
      this.tagged_notes = [];
      this.tagged_notes_total = 0;
    }
    if (this.tagged_notes.length === 0) this.tagged_notes_status = "loading";
  }

  set_tagged_notes(page: TagNotePage) {
    this.tagged_notes = page.notes;
    this.tagged_notes_total = page.total;
    this.tagged_notes_status = "ready";
  }

  set_tagged_notes_error() {
    this.tagged_notes = [];
    this.tagged_notes_total = 0;
    this.tagged_notes_status = "error";
  }

  clear_selected_tag() {
    this.selected_tag = null;
    this.tagged_notes = [];
    this.tagged_notes_total = 0;
    this.tagged_notes_status = "idle";
  }

  set_note_tags(note_path: string, tags: string[]) {
    this.note_tags_path = note_path;
    this.note_tags = tags;
  }

  // The rail computes tags a moment after a note opens, so for that moment the
  // store still holds the previous note's. Hand out tags only for the path
  // they were computed for.
  tags_for_note(note_path: string | null): string[] {
    return this.note_tags_path === note_path ? this.note_tags : [];
  }

  // The note tags reactor calls this on every keystroke in a file that has no
  // tags (CSS, YAML). Skip the write when there is nothing to clear.
  clear_note_tags() {
    if (this.note_tags_path === null) return;
    this.note_tags_path = null;
    this.note_tags = [];
  }

  clear_vault_tags() {
    this.tags = [];
    this.tags_status = "idle";
    this.clear_selected_tag();
  }
}

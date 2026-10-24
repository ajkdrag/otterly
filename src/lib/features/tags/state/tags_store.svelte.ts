import type { TagCount, TaggedNote } from "$lib/features/tags/types/tag";

export type TagsLoadStatus = "idle" | "loading" | "ready" | "error";

export class TagsStore {
  tags = $state<TagCount[]>([]);
  tags_status = $state<TagsLoadStatus>("idle");
  tags_error = $state<string | null>(null);

  selected_tag = $state<string | null>(null);
  tagged_notes = $state<TaggedNote[]>([]);
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
    this.tags_error = null;
  }

  set_tags_error(error: string) {
    this.tags = [];
    this.tags_status = "error";
    this.tags_error = error;
  }

  // Same rule as the tag list: reloading the selected tag keeps its notes
  // visible. Switching to another tag starts from an empty list.
  start_tagged_notes_load(tag: string) {
    if (tag !== this.selected_tag) {
      this.selected_tag = tag;
      this.tagged_notes = [];
    }
    if (this.tagged_notes.length === 0) this.tagged_notes_status = "loading";
  }

  set_tagged_notes(notes: TaggedNote[]) {
    this.tagged_notes = notes;
    this.tagged_notes_status = "ready";
  }

  set_tagged_notes_error() {
    this.tagged_notes = [];
    this.tagged_notes_status = "error";
  }

  clear_selected_tag() {
    this.selected_tag = null;
    this.tagged_notes = [];
    this.tagged_notes_status = "idle";
  }

  set_note_tags(note_path: string, tags: string[]) {
    this.note_tags_path = note_path;
    this.note_tags = tags;
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
    this.tags_error = null;
    this.clear_selected_tag();
  }
}

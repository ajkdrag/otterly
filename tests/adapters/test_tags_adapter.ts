import type { TagsPort } from "$lib/features/tags";

export function create_test_tags_adapter(): TagsPort {
  return {
    list_tags() {
      return Promise.resolve([]);
    },
    list_notes_with_tag() {
      return Promise.resolve([]);
    },
    extract_note_tags() {
      return Promise.resolve([]);
    },
  };
}

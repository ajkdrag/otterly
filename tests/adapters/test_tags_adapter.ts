import type { TagsPort } from "$lib/features/tags";

export function create_test_tags_adapter(): TagsPort {
  return {
    list_tags() {
      return Promise.resolve([]);
    },
    suggest_tags() {
      return Promise.resolve([]);
    },
    search_tagged_notes() {
      return Promise.resolve({ notes: [], total: 0, truncated: false });
    },
    extract_note_tags() {
      return Promise.resolve([]);
    },
  };
}

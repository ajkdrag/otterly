import { untrack } from "svelte";
import { literal_find_spec } from "@otterly/markdown-editor";
import type { UIStore } from "$lib/app";
import type { FindSpec, InFileMatch } from "$lib/shared/types/search";
import type { SearchService, SearchStore } from "$lib/features/search";

// The buffer find runs over. The readers must read reactive state, so the
// reactor reruns when the buffer or its text changes. They are separate so the
// highlight effect tracks the buffer id and not every edit.
export type FindInFileTarget = {
  read_buffer_id: () => string | null;
  read_markdown: () => string;
  update_find_state: (spec: FindSpec, selected_index: number) => void;
};

const NO_FIND = literal_find_spec("");

function read_find_spec(find: UIStore["find_in_file"]): FindSpec {
  return {
    text: find.query,
    regex: find.regex,
    case_sensitive: find.case_sensitive,
    whole_word: find.whole_word,
  };
}

export function create_find_in_file_reactor(
  ui_store: UIStore,
  search_store: SearchStore,
  target: FindInFileTarget,
  search_service: Pick<SearchService, "search_within_file">,
): () => void {
  let last_buffer_id: string | null = null;
  let last_markdown = "";
  let last_spec_key = "";
  let last_applied_key = "";
  let matches: InFileMatch[] = [];
  return $effect.root(() => {
    $effect(() => {
      const find = ui_store.find_in_file;
      const spec = find.open ? read_find_spec(find) : NO_FIND;
      const spec_key = JSON.stringify(spec);
      const buffer_id = target.read_buffer_id();
      const markdown = target.read_markdown();
      if (markdown !== last_markdown || spec_key !== last_spec_key) {
        matches = search_service.search_within_file(markdown, spec);
        last_markdown = markdown;
        last_spec_key = spec_key;
      }
      const buffer_changed = buffer_id !== last_buffer_id;
      last_buffer_id = buffer_id;
      search_store.set_in_file_matches(matches);
      // Moving between matches must not repeat the document search.
      untrack(() => {
        const current = ui_store.find_in_file.selected_match_index;
        const selected = buffer_changed
          ? 0
          : Math.min(current, Math.max(0, matches.length - 1));
        if (find.open && selected !== current)
          ui_store.find_in_file.selected_match_index = selected;
      });
    });

    $effect(() => {
      const find = ui_store.find_in_file;
      // Cached editor buffers carry their previous find state. Apply the active
      // query again after the editor-sync reactor activates another buffer.
      const buffer_id = target.read_buffer_id();
      const spec = find.open && buffer_id ? read_find_spec(find) : NO_FIND;
      const key = JSON.stringify([buffer_id, spec, find.selected_match_index]);
      // Typing a replacement also replaces find_in_file. Applying the same
      // state again would scroll the editor back to the selected match.
      if (key === last_applied_key) return;
      last_applied_key = key;
      target.update_find_state(spec, find.selected_match_index);
    });
  });
}

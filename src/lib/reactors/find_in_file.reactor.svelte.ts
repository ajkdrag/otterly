import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { EditorService, EditorStore } from "$lib/features/editor";
import type { InFileMatch } from "$lib/shared/types/search";
import type { SearchService, SearchStore } from "$lib/features/search";

export function create_find_in_file_reactor(
  ui_store: UIStore,
  editor_store: EditorStore,
  search_store: SearchStore,
  editor_service: EditorService,
  search_service: Pick<SearchService, "search_within_file">,
): () => void {
  let last_buffer_id: string | null = null;
  let last_markdown = "";
  let last_query = "";
  let matches: InFileMatch[] = [];
  return $effect.root(() => {
    $effect(() => {
      const { open, query } = ui_store.find_in_file;
      const note = editor_store.open_note;
      const buffer_id = note?.buffer_id ?? null;
      const markdown = note?.markdown ?? "";
      const active_query = open ? query : "";
      if (markdown !== last_markdown || active_query !== last_query) {
        matches = search_service.search_within_file(markdown, active_query);
        last_markdown = markdown;
        last_query = active_query;
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
        if (open && selected !== current)
          ui_store.find_in_file.selected_match_index = selected;
      });
    });

    $effect(() => {
      const { open, query, selected_match_index } = ui_store.find_in_file;
      // Cached editor buffers carry their previous find state. Apply the active
      // query again after the editor-sync reactor activates another buffer.
      const buffer_id = editor_store.open_note?.buffer_id;
      editor_service.update_find_state(
        open && buffer_id ? query : "",
        selected_match_index,
      );
    });
  });
}

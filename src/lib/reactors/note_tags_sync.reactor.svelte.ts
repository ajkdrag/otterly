import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { TagsService } from "$lib/features/tags";
import { is_markdown_path } from "$lib/shared/utils/path";
import {
  resolve_local_links_sync_decision,
  type LocalLinksSyncState,
} from "$lib/reactors/local_links_sync.reactor.svelte";

const NOTE_TAGS_DEBOUNCE_MS = 220;

// The rail's tag chips reuse the local links rule on purpose, so both rail
// sections update at the same moments: now on note switch or rail open,
// debounced while typing, cleared when no note is open.
//
// Only Markdown files have tags. Other files open as text and the index skips
// them, so we hand the rule "no note" for those and the chips clear.
export function create_note_tags_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  tags_service: TagsService,
): () => void {
  let state: LocalLinksSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_markdown: null,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel_pending() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  return $effect.root(() => {
    $effect(() => {
      const editor_note = editor_store.open_note;
      const open_note =
        editor_note && is_markdown_path(editor_note.meta.path)
          ? editor_note
          : null;
      const decision = resolve_local_links_sync_decision(state, {
        open_note_path: open_note?.meta.path ?? null,
        panel_open: ui_store.context_rail_open,
        markdown: open_note?.markdown ?? null,
      });
      state = decision.next_state;
      cancel_pending();

      if (decision.action === "clear") {
        tags_service.clear_note_tags();
        return;
      }

      const note_path = decision.note_path;
      if (!open_note || !note_path) return;

      if (decision.action === "compute_now") {
        void tags_service.update_note_tags(note_path, open_note.markdown);
        return;
      }

      if (decision.action !== "compute_debounced") return;
      timer = setTimeout(() => {
        timer = null;
        const current = editor_store.open_note;
        if (!current || current.meta.path !== note_path) return;
        void tags_service.update_note_tags(note_path, current.markdown);
      }, NOTE_TAGS_DEBOUNCE_MS);
    });

    return () => {
      cancel_pending();
    };
  });
}

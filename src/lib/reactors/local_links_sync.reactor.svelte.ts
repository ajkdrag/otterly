import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { LinksService } from "$lib/features/links";

const LOCAL_LINKS_DEBOUNCE_MS = 220;

export type LocalLinksSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_markdown: string | null;
};

type LocalLinksSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  markdown: string | null;
};

type LocalLinksSyncDecision = {
  action: "clear" | "cancel" | "compute_now" | "compute_debounced" | "noop";
  note_path: string | null;
  next_state: LocalLinksSyncState;
};

export function resolve_local_links_sync_decision(
  state: LocalLinksSyncState,
  input: LocalLinksSyncInput,
): LocalLinksSyncDecision {
  const next_state: LocalLinksSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_markdown: input.markdown,
  };

  if (!input.open_note_path || input.markdown === null) {
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open) {
    return { action: "cancel", note_path: input.open_note_path, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const markdown_changed = input.markdown !== state.last_markdown;

  if (path_changed || panel_opened) {
    return {
      action: "compute_now",
      note_path: input.open_note_path,
      next_state,
    };
  }

  if (markdown_changed) {
    return {
      action: "compute_debounced",
      note_path: input.open_note_path,
      next_state,
    };
  }

  return { action: "noop", note_path: input.open_note_path, next_state };
}

export function create_local_links_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  links_service: LinksService,
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
      const open_note = editor_store.open_note;
      const decision = resolve_local_links_sync_decision(state, {
        open_note_path: open_note?.meta.path ?? null,
        panel_open: ui_store.context_rail_open,
        markdown: open_note?.markdown ?? null,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        cancel_pending();
        links_service.clear();
        return;
      }

      // A save changes open_note (the mtime) but not the markdown, and that
      // lands here as noop. Leave an armed timer alone, or the pending
      // recompute for the last edit never runs.
      if (decision.action === "noop") return;

      if (decision.action === "cancel") {
        cancel_pending();
        return;
      }

      const note_path = decision.note_path;
      if (!note_path) {
        cancel_pending();
        return;
      }

      if (decision.action === "compute_now") {
        cancel_pending();
        const markdown = editor_store.open_note?.markdown;
        if (!markdown) return;
        void links_service.update_local_note_links(note_path, markdown);
        return;
      }

      cancel_pending();
      timer = setTimeout(() => {
        timer = null;
        const current = editor_store.open_note;
        if (!current || current.meta.path !== note_path) return;
        void links_service.update_local_note_links(note_path, current.markdown);
      }, LOCAL_LINKS_DEBOUNCE_MS);
    });

    return () => {
      cancel_pending();
    };
  });
}

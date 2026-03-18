import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { SearchStore } from "$lib/features/search";
import type { LinksService } from "$lib/features/links";
import type { LinksStore } from "$lib/features/links";
import type { TabStore } from "$lib/features/tab";

type BacklinksSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_index_status: SearchStore["index_progress"]["status"];
  last_is_dirty: boolean;
  index_epoch: number;
  save_epoch: number;
  loaded_note_path: string | null;
  loaded_index_epoch: number;
  loaded_save_epoch: number;
};

type BacklinksSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  index_status: SearchStore["index_progress"]["status"];
  is_dirty: boolean;
  snapshot_note_path: string | null;
  global_status: LinksStore["global_status"];
};

type BacklinksSyncDecision = {
  action: "clear" | "load" | "noop";
  note_path: string | null;
  next_state: BacklinksSyncState;
};

export function resolve_backlinks_sync_decision(
  state: BacklinksSyncState,
  input: BacklinksSyncInput,
): BacklinksSyncDecision {
  const index_completed =
    input.index_status === "completed" &&
    state.last_index_status !== "completed";
  const save_completed =
    !input.is_dirty &&
    state.last_is_dirty &&
    input.open_note_path === state.last_note_path;

  const next_index_epoch = state.index_epoch + (index_completed ? 1 : 0);
  const next_save_epoch = state.save_epoch + (save_completed ? 1 : 0);

  const next_state: BacklinksSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_index_status: input.index_status,
    last_is_dirty: input.is_dirty,
    index_epoch: next_index_epoch,
    save_epoch: next_save_epoch,
    loaded_note_path: state.loaded_note_path,
    loaded_index_epoch: state.loaded_index_epoch,
    loaded_save_epoch: state.loaded_save_epoch,
  };

  if (!input.open_note_path) {
    next_state.loaded_note_path = null;
    return { action: "clear", note_path: null, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const has_loaded_current = state.loaded_note_path === input.open_note_path;
  const has_ready_snapshot =
    input.snapshot_note_path === input.open_note_path &&
    input.global_status === "ready";
  const stale_from_index = next_index_epoch > state.loaded_index_epoch;
  const stale_from_save = next_save_epoch > state.loaded_save_epoch;
  const stale_or_unloaded =
    !has_loaded_current ||
    stale_from_index ||
    stale_from_save ||
    !has_ready_snapshot;

  const should_load = input.panel_open
    ? path_changed ||
      (panel_opened && stale_or_unloaded) ||
      ((index_completed || save_completed) && stale_or_unloaded)
    : false;

  if (should_load) {
    next_state.loaded_note_path = input.open_note_path;
    next_state.loaded_index_epoch = next_index_epoch;
    next_state.loaded_save_epoch = next_save_epoch;
  }

  return {
    action: should_load ? "load" : "noop",
    note_path: input.open_note_path,
    next_state,
  };
}

export function create_backlinks_sync_reactor(
  editor_store: EditorStore,
  tab_store: TabStore,
  ui_store: UIStore,
  search_store: SearchStore,
  links_store: LinksStore,
  links_service: LinksService,
): () => void {
  let state: BacklinksSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_index_status: "idle",
    last_is_dirty: false,
    index_epoch: 0,
    save_epoch: 0,
    loaded_note_path: null,
    loaded_index_epoch: 0,
    loaded_save_epoch: 0,
  };

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_backlinks_sync_decision(state, {
        open_note_path: editor_store.open_note?.meta.path ?? null,
        panel_open: ui_store.context_rail_open,
        index_status: search_store.index_progress.status,
        is_dirty: tab_store.is_open_note_dirty(editor_store.open_note),
        snapshot_note_path: links_store.active_note_path,
        global_status: links_store.global_status,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        links_service.clear();
        return;
      }
      if (decision.action === "load" && decision.note_path) {
        void links_service.load_note_links(decision.note_path);
      }
    });
  });
}

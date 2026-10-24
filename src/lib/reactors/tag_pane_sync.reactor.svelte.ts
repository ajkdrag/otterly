import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { EditorStore } from "$lib/features/editor";
import type { SearchStore } from "$lib/features/search";
import type { TagsService } from "$lib/features/tags";
import type { VaultStore } from "$lib/features/vault";

type IndexStatus = SearchStore["index_progress"]["status"];

type TagPaneSyncState = {
  last_vault_id: string | null;
  last_pane_visible: boolean;
  last_index_status: IndexStatus;
  last_note_path: string | null;
  last_note_mtime_ms: number | null;
};

type TagPaneSyncInput = {
  vault_id: string | null;
  pane_visible: boolean;
  index_status: IndexStatus;
  open_note_path: string | null;
  open_note_mtime_ms: number | null;
};

type TagPaneSyncDecision = {
  clear: boolean;
  reload: boolean;
  next_state: TagPaneSyncState;
};

// While the pane is hidden we do nothing, and showing it always reloads (the
// query is cheap). Like backlinks, a note changed by another program shows up
// after the next index sync.
export function resolve_tag_pane_sync_decision(
  state: TagPaneSyncState,
  input: TagPaneSyncInput,
): TagPaneSyncDecision {
  const next_state: TagPaneSyncState = {
    last_vault_id: input.vault_id,
    last_pane_visible: input.pane_visible,
    last_index_status: input.index_status,
    last_note_path: input.open_note_path,
    last_note_mtime_ms: input.open_note_mtime_ms,
  };

  const vault_changed = input.vault_id !== state.last_vault_id;
  const became_visible = input.pane_visible && !state.last_pane_visible;
  const index_completed =
    input.index_status === "completed" &&
    state.last_index_status !== "completed";
  // Open, rename, delete and a draft's first save all change the path.
  const note_switched = input.open_note_path !== state.last_note_path;
  // A save and a watcher reload of an external edit both upsert the note into
  // the index and give the open note a new mtime. Typing does neither.
  //
  // @Robustness: A reload sets the mtime just before it sends the upsert. We
  // rely on the backend running both commands in the order sent, so the list
  // query sees the new tags. I have not checked this under load.
  const note_rewritten =
    !note_switched && input.open_note_mtime_ms !== state.last_note_mtime_ms;

  const reload =
    input.vault_id !== null &&
    input.pane_visible &&
    (vault_changed ||
      became_visible ||
      index_completed ||
      note_switched ||
      note_rewritten);

  return { clear: vault_changed, reload, next_state };
}

export function create_tag_pane_sync_reactor(
  vault_store: VaultStore,
  ui_store: UIStore,
  search_store: SearchStore,
  editor_store: EditorStore,
  tags_service: TagsService,
): () => void {
  let state: TagPaneSyncState = {
    last_vault_id: null,
    last_pane_visible: false,
    last_index_status: "idle",
    last_note_path: null,
    last_note_mtime_ms: null,
  };

  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;
      const decision = resolve_tag_pane_sync_decision(state, {
        vault_id: vault_store.vault?.id ?? null,
        pane_visible: ui_store.sidebar_open && ui_store.sidebar_view === "tags",
        index_status: search_store.index_progress.status,
        open_note_path: open_note?.meta.path ?? null,
        open_note_mtime_ms: open_note?.meta.mtime_ms ?? null,
      });
      state = decision.next_state;

      // The service reads and writes the tags store while starting a load.
      // Keep that out of this effect's dependencies.
      untrack(() => {
        if (decision.clear) tags_service.clear();
        if (decision.reload) void tags_service.reload();
      });
    });
  });
}

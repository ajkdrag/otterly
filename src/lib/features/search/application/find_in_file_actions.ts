import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry, UIStore } from "$lib/app";
import type { SearchStore } from "$lib/features/search/state/search_store.svelte";

// The vault app and the document window both register these, so the input is
// only what find needs.
export type FindInFileActionInput = {
  registry: ActionRegistry;
  stores: { ui: UIStore; search: SearchStore };
  services: { editor: { focus: () => void } };
};

export function register_find_in_file_actions(input: FindInFileActionInput) {
  const { registry, stores, services } = input;
  const CLOSED_FIND_STATE = {
    open: false,
    query: "",
    selected_match_index: 0,
  } as const;

  function update_find_state(patch: Partial<UIStore["find_in_file"]>) {
    stores.ui.find_in_file = {
      ...stores.ui.find_in_file,
      ...patch,
    };
  }

  function close_find() {
    stores.ui.find_in_file = { ...CLOSED_FIND_STATE };
    stores.search.clear_in_file_matches();
    services.editor.focus();
  }

  function move_selection(step: 1 | -1) {
    const total_matches = stores.search.in_file_matches.length;
    if (total_matches === 0) {
      return;
    }
    const current_index = stores.ui.find_in_file.selected_match_index;
    const next_index = (current_index + step + total_matches) % total_matches;
    update_find_state({ selected_match_index: next_index });
  }

  function update_query(query: string) {
    update_find_state({
      query,
      selected_match_index: 0,
    });
  }

  registry.register({
    id: ACTION_IDS.find_in_file_toggle,
    label: "Toggle Find in File",
    shortcut: "CmdOrCtrl+F",
    execute: () => {
      update_find_state({ open: !stores.ui.find_in_file.open });
      if (!stores.ui.find_in_file.open) {
        stores.search.clear_in_file_matches();
        services.editor.focus();
      }
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_open,
    label: "Open Find in File",
    execute: () => {
      update_find_state({ open: true });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_close,
    label: "Close Find in File",
    execute: () => {
      close_find();
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_set_query,
    label: "Set Find in File Query",
    execute: (query: unknown) => {
      update_query(String(query));
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_next,
    label: "Find Next",
    shortcut: "CmdOrCtrl+G",
    execute: () => {
      move_selection(1);
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_prev,
    label: "Find Previous",
    shortcut: "Shift+CmdOrCtrl+G",
    execute: () => {
      move_selection(-1);
    },
  });
}

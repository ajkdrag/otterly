import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry, UIStore } from "$lib/app";
import type { SearchStore } from "$lib/features/search/state/search_store.svelte";

type FindOptions = Pick<
  UIStore["find_in_file"],
  "regex" | "case_sensitive" | "whole_word"
>;

// The vault app and the document window both register these, so the input is
// only what find needs.
export type FindInFileActionInput = {
  registry: ActionRegistry;
  stores: { ui: UIStore; search: SearchStore };
  services: {
    editor: {
      focus: () => void;
      replace_find_match: (replacement: string) => number | null;
      replace_all_find_matches: (replacement: string) => number;
    };
  };
};

export function register_find_in_file_actions(input: FindInFileActionInput) {
  const { registry, stores, services } = input;
  // Closing clears the query and the replace row. The option toggles stay.
  const CLOSED_FIND_STATE = {
    open: false,
    query: "",
    selected_match_index: 0,
    replace_open: false,
    replacement: "",
  } as const;

  function update_find_state(patch: Partial<UIStore["find_in_file"]>) {
    stores.ui.find_in_file = {
      ...stores.ui.find_in_file,
      ...patch,
    };
  }

  function close_find() {
    stores.ui.find_in_file = {
      ...stores.ui.find_in_file,
      ...CLOSED_FIND_STATE,
    };
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
    id: ACTION_IDS.find_in_file_toggle_replace,
    label: "Find and Replace in File",
    shortcut: "CmdOrCtrl+Alt+F",
    execute: () => {
      const { open, replace_open } = stores.ui.find_in_file;
      update_find_state(
        open
          ? { replace_open: !replace_open }
          : { open: true, replace_open: true },
      );
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_set_options,
    label: "Set Find in File Options",
    execute: (options: unknown) => {
      const { regex, case_sensitive, whole_word } = {
        ...stores.ui.find_in_file,
        ...(options as Partial<FindOptions>),
      };
      update_find_state({
        regex,
        case_sensitive,
        whole_word,
        selected_match_index: 0,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_set_replacement,
    label: "Set Find in File Replacement",
    execute: (replacement: unknown) => {
      update_find_state({ replacement: String(replacement) });
    },
  });

  // The editor selects the next match after a replace. Follow it, so the
  // "n of m" in the bar and the highlighted match stay the same match.
  registry.register({
    id: ACTION_IDS.find_in_file_replace,
    label: "Replace Match in File",
    execute: () => {
      const next_index = services.editor.replace_find_match(
        stores.ui.find_in_file.replacement,
      );
      if (next_index !== null)
        update_find_state({ selected_match_index: next_index });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_replace_all,
    label: "Replace All Matches in File",
    execute: () => {
      const replaced_count = services.editor.replace_all_find_matches(
        stores.ui.find_in_file.replacement,
      );
      if (replaced_count > 0) update_find_state({ selected_match_index: 0 });
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

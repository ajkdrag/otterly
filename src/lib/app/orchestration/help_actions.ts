import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export type HelpActionInput = {
  registry: ActionRegistry;
  stores: { ui: UIStore };
};

export function register_help_actions(input: HelpActionInput) {
  const { registry, stores } = input;

  function set_help_open(open: boolean) {
    stores.ui.help_dialog = { open };
  }

  registry.register({
    id: ACTION_IDS.help_open,
    label: "Open Help",
    execute: () => {
      set_help_open(true);
    },
  });

  registry.register({
    id: ACTION_IDS.help_close,
    label: "Close Help",
    execute: () => {
      set_help_open(false);
    },
  });
}

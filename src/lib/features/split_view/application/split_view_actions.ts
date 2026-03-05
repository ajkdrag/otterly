import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { SplitViewService } from "$lib/features/split_view/application/split_view_service";
import type { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";

export function register_split_view_actions(
  input: ActionRegistrationInput & {
    split_view_store: SplitViewStore;
    split_view_service: SplitViewService;
  },
) {
  const { registry, split_view_store, split_view_service } = input;

  registry.register({
    id: ACTION_IDS.split_view_toggle,
    label: "Toggle Split View",
    execute: () => {
      if (split_view_store.active) {
        split_view_service.close();
      }
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_close,
    label: "Close Split View",
    execute: () => {
      split_view_service.close();
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_mount,
    label: "Split View Mount",
    execute: async (root: unknown, note: unknown) => {
      await split_view_service.open_to_side(
        note as OpenNoteState,
        root as HTMLDivElement,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_unmount,
    label: "Split View Unmount",
    execute: () => {
      split_view_service.close();
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_set_active_pane,
    label: "Set Active Pane",
    execute: (pane: unknown) => {
      split_view_store.set_active_pane(pane as "primary" | "secondary");
    },
  });
}

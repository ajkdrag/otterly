import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { SplitViewService } from "$lib/features/split_view/application/split_view_service";
import type { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { to_open_note_state } from "$lib/shared/types/editor";
import type { NotesPort } from "$lib/features/note";
import type { NotePath } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { toast } from "svelte-sonner";

const log = create_logger("split_view_actions");

export function register_split_view_actions(
  input: ActionRegistrationInput & {
    split_view_store: SplitViewStore;
    split_view_service: SplitViewService;
    notes_port: NotesPort;
  },
) {
  const { registry, split_view_store, split_view_service, notes_port, stores } =
    input;

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
      await split_view_service.mount_secondary(
        note as OpenNoteState,
        root as HTMLDivElement,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_unmount,
    label: "Split View Unmount",
    execute: () => {
      split_view_service.unmount_secondary();
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_set_active_pane,
    label: "Set Active Pane",
    execute: (pane: unknown) => {
      split_view_store.set_active_pane(pane as "primary" | "secondary");
    },
  });

  registry.register({
    id: ACTION_IDS.split_view_open_to_side,
    label: "Open to Side",
    execute: async (note_path_raw: unknown) => {
      const note_path = note_path_raw as NotePath;
      const vault = stores.vault.vault;
      if (!vault) return;

      try {
        const doc = await notes_port.read_note(vault.id, note_path);
        const open_note = to_open_note_state(doc);
        split_view_service.activate(open_note);
      } catch (error) {
        log.error("Failed to open note in split view", {
          error: String(error),
        });
        toast.error("Failed to open note in split view");
      }
    },
  });
}

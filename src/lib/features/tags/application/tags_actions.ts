import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

export function register_tags_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  registry.register({
    id: ACTION_IDS.tags_open_tag,
    label: "Open Tag",
    execute: async (tag: unknown) => {
      if (typeof tag !== "string") return;
      stores.ui.set_sidebar_view("tags");
      await services.tags.select_tag(tag);
    },
  });

  // Drill-down rows come from the index, which can still list a note deleted
  // elsewhere. Opening a missing note removes its index rows but changes no
  // store the tag pane watches, so the dead row stays until we reload.
  registry.register({
    id: ACTION_IDS.tags_open_note,
    label: "Open Tagged Note",
    execute: async (note_path: unknown) => {
      if (typeof note_path !== "string") return;
      await registry.execute(ACTION_IDS.note_open, {
        note_path,
        cleanup_if_missing: true,
      });
      await services.tags.reload();
    },
  });

  registry.register({
    id: ACTION_IDS.tags_close_tag,
    label: "Close Tag",
    execute: () => {
      services.tags.clear_selected_tag();
    },
  });
}

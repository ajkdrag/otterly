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

  registry.register({
    id: ACTION_IDS.tags_close_tag,
    label: "Close Tag",
    execute: () => {
      services.tags.clear_selected_tag();
    },
  });
}

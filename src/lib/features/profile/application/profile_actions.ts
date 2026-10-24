import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

export function register_profile_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  function close_profile_dialog() {
    stores.ui.profile_dialog = { open: false, new_name: "" };
  }

  registry.register({
    id: ACTION_IDS.profile_open_dialog,
    label: "Open Profiles",
    execute: async () => {
      stores.op.reset("profile.open");
      await services.profile.load_profiles();
      stores.ui.profile_dialog = { open: true, new_name: "" };
    },
  });

  registry.register({
    id: ACTION_IDS.profile_close_dialog,
    label: "Close Profiles",
    execute: () => {
      close_profile_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.profile_update_new_name,
    label: "Update New Profile Name",
    execute: (new_name: unknown) => {
      stores.ui.profile_dialog.new_name = String(new_name);
    },
  });

  // Takes an id, not what the user typed. The dialog normalizes the name with
  // normalize_profile_name first.
  registry.register({
    id: ACTION_IDS.profile_open,
    label: "Open Profile",
    execute: async (profile_id: unknown) => {
      const opened = await services.profile.open_profile(String(profile_id));
      if (opened) close_profile_dialog();
    },
  });

  // The Dock's "New Profile…" leaves a request in the backend. Both the
  // backend event and app.mounted run this, and taking the request clears it,
  // so the dialog opens once.
  registry.register({
    id: ACTION_IDS.profile_check_dialog_request,
    label: "Check Profiles Dialog Request",
    execute: async () => {
      if (await services.profile.take_dialog_request()) {
        await registry.execute(ACTION_IDS.profile_open_dialog);
      }
    },
  });
}

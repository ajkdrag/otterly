import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { UserPreferences } from "$lib/features/user/types/user_profile";
import { as_user_id } from "$lib/features/user/types/user_profile";

export function register_user_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  registry.register({
    id: ACTION_IDS.user_load,
    label: "Load User Profile",
    execute: async () => {
      const result = await services.user.load_or_create_active_user();
      if (result.status === "success" || result.status === "created") {
        stores.user.set_active_profile(result.profile);
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.user_update_name,
    label: "Update User Display Name",
    execute: async (name: unknown) => {
      const profile = stores.user.active_profile;
      if (!profile || typeof name !== "string") return;
      const updated = await services.user.update_display_name(profile, name);
      stores.user.set_active_profile(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.user_update_avatar,
    label: "Update User Avatar",
    execute: async (emoji: unknown) => {
      const profile = stores.user.active_profile;
      if (!profile || typeof emoji !== "string") return;
      const updated = await services.user.update_avatar(profile, emoji);
      stores.user.set_active_profile(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.user_update_preferences,
    label: "Update User Preferences",
    execute: async (prefs: unknown) => {
      const profile = stores.user.active_profile;
      if (!profile || typeof prefs !== "object" || !prefs) return;
      const updated = await services.user.update_preferences(
        profile,
        prefs as Partial<UserPreferences>,
      );
      stores.user.set_active_profile(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.user_switch,
    label: "Switch User",
    execute: async (user_id: unknown) => {
      if (typeof user_id !== "string") return;
      const result = await services.user.switch_user(as_user_id(user_id));
      if (result.status === "success") {
        stores.user.set_active_profile(result.profile);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.user_create,
    label: "Create User",
    execute: async (payload: unknown) => {
      const data = payload as { name: string; emoji: string } | undefined;
      if (!data || typeof data.name !== "string") return;
      const result = await services.user.create_user(
        data.name,
        data.emoji ?? "👤",
      );
      if (result.status === "created") {
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
    },
  });
}

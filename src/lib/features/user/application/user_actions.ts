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
      const data = payload as
        | { name: string; emoji: string; password?: string }
        | undefined;
      if (!data || typeof data.name !== "string") return;
      const result = await services.user.create_user(
        data.name,
        data.emoji ?? "👤",
        data.password,
      );
      if (result.status === "created") {
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.user_change_password,
    label: "Change User Password",
    execute: async (payload: unknown) => {
      const data = payload as
        | { current_password: string; new_password: string; resolve?: (result: { success: boolean; error?: string }) => void }
        | undefined;
      if (!data) return;
      const profile = stores.user.active_profile;
      if (!profile) return;
      const result = await services.user.change_password(
        profile,
        data.current_password,
        data.new_password,
      );
      if (result.success) {
        const updated_result = await services.user.load_or_create_active_user();
        if (
          updated_result.status === "success" ||
          updated_result.status === "created"
        ) {
          stores.user.set_active_profile(updated_result.profile);
        }
      }
      if (data.resolve) data.resolve(result);
    },
  });

  registry.register({
    id: ACTION_IDS.user_verify_password,
    label: "Verify User Password",
    execute: async (payload: unknown) => {
      const data = payload as
        | { user_id: string; password: string; resolve?: (valid: boolean) => void }
        | undefined;
      if (!data) return;
      const valid = await services.user.verify_user_password(
        as_user_id(data.user_id),
        data.password,
      );
      if (data.resolve) data.resolve(valid);
    },
  });

  registry.register({
    id: ACTION_IDS.user_delete,
    label: "Delete User",
    execute: async (user_id: unknown) => {
      if (typeof user_id !== "string") return;
      const current = stores.user.active_profile;
      if (current && current.id === user_id) return; // cannot delete active user
      await services.user.delete_user(as_user_id(user_id));
      const all = await services.user.list_users();
      stores.user.set_all_profiles(all);
    },
  });

  // ── Auth actions ──────────────────────────────────────────────

  registry.register({
    id: ACTION_IDS.auth_login_guest,
    label: "Login as Guest",
    execute: async () => {
      const result = await services.user.login_as_guest();
      if (result.status === "success" || result.status === "created") {
        stores.user.set_active_profile(result.profile);
        stores.user.set_auth_screen("authenticated");
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.auth_login_credentials,
    label: "Login with Credentials",
    execute: async (payload: unknown) => {
      const data = payload as
        | { username: string; password: string; resolve?: (result: { status: string; error?: string }) => void }
        | undefined;
      if (!data) return;
      const result = await services.user.login_with_credentials(
        data.username,
        data.password,
      );
      if (result.status === "success") {
        stores.user.set_active_profile(result.profile);
        stores.user.set_auth_screen("authenticated");
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
      if (data.resolve) data.resolve(result);
    },
  });

  registry.register({
    id: ACTION_IDS.auth_register,
    label: "Register Account",
    execute: async (payload: unknown) => {
      const data = payload as
        | { username: string; password: string; display_name?: string; resolve?: (result: { status: string; error?: string }) => void }
        | undefined;
      if (!data) return;
      const result = await services.user.register_account(
        data.username,
        data.password,
        data.display_name,
      );
      if (result.status === "success") {
        stores.user.set_active_profile(result.profile);
        stores.user.set_auth_screen("authenticated");
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
      if (data.resolve) data.resolve(result);
    },
  });

  registry.register({
    id: ACTION_IDS.auth_bind_account,
    label: "Bind Guest Account",
    execute: async (payload: unknown) => {
      const data = payload as
        | { username: string; password: string; resolve?: (result: { status: string; error?: string }) => void }
        | undefined;
      if (!data) return;
      const profile = stores.user.active_profile;
      if (!profile) return;
      const result = await services.user.bind_account(
        profile,
        data.username,
        data.password,
      );
      if (result.status === "success") {
        stores.user.set_active_profile(result.profile);
        const all = await services.user.list_users();
        stores.user.set_all_profiles(all);
      }
      if (data.resolve) data.resolve(result);
    },
  });

  registry.register({
    id: ACTION_IDS.auth_logout,
    label: "Logout",
    execute: () => {
      stores.user.set_auth_screen("login");
    },
  });
}

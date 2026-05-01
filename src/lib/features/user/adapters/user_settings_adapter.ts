import type { UserPort } from "$lib/features/user/ports";
import type { SettingsPort } from "$lib/features/settings";
import type {
  UserProfile,
  UserId,
} from "$lib/features/user/types/user_profile";

const USERS_KEY = "user_profiles";
const ACTIVE_USER_KEY = "active_user_id";

export function create_user_settings_adapter(
  settings_port: SettingsPort,
): UserPort {
  return {
    async load_user_profile(user_id: UserId): Promise<UserProfile | null> {
      const profiles = await load_all_profiles(settings_port);
      return profiles.find((p) => p.id === user_id) ?? null;
    },

    async save_user_profile(profile: UserProfile): Promise<void> {
      const profiles = await load_all_profiles(settings_port);
      const index = profiles.findIndex((p) => p.id === profile.id);
      if (index >= 0) {
        profiles[index] = profile;
      } else {
        profiles.push(profile);
      }
      await settings_port.set_setting(USERS_KEY, profiles);
    },

    async list_user_profiles(): Promise<UserProfile[]> {
      return load_all_profiles(settings_port);
    },

    async create_user_profile(profile: UserProfile): Promise<void> {
      const profiles = await load_all_profiles(settings_port);
      profiles.push(profile);
      await settings_port.set_setting(USERS_KEY, profiles);
    },

    async delete_user_profile(user_id: UserId): Promise<void> {
      const profiles = await load_all_profiles(settings_port);
      const filtered = profiles.filter((p) => p.id !== user_id);
      await settings_port.set_setting(USERS_KEY, filtered);
    },

    async get_active_user_id(): Promise<UserId | null> {
      const stored = await settings_port.get_setting<string>(ACTIVE_USER_KEY);
      return (stored as UserId) ?? null;
    },

    async set_active_user_id(user_id: UserId): Promise<void> {
      await settings_port.set_setting(ACTIVE_USER_KEY, user_id);
    },
  };
}

async function load_all_profiles(
  settings_port: SettingsPort,
): Promise<UserProfile[]> {
  const stored = await settings_port.get_setting<unknown>(USERS_KEY);
  if (!stored || !Array.isArray(stored)) return [];
  return stored.filter(is_user_profile).map(migrate_profile);
}

function is_user_profile(entry: unknown): entry is UserProfile {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.display_name === "string"
  );
}

/** Ensure old profiles without password_hash or auth_identity fields are compatible */
function migrate_profile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    password_hash: profile.password_hash ?? "",
    auth_identity: profile.auth_identity ?? { kind: "guest" },
  };
}

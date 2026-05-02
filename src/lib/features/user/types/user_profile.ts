export type UserId = string & { readonly __brand: "UserId" };

/**
 * Authentication identity type.
 * - "guest": anonymous user with a local-only ID, no credentials
 * - "registered": user with username and password
 */
export type AuthIdentity =
  | { kind: "guest" }
  | { kind: "registered"; username: string };

export type Badge = {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked_at: string;
};

export type UserProfile = {
  id: UserId;
  display_name: string;
  password_hash: string;
  avatar_emoji: string;
  auth_identity: AuthIdentity;
  level: number;
  level_title: string;
  level_icon: string;
  total_points: number;
  streak_days: number;
  badges: Badge[];
  recent_folders: string[];
  preferences: UserPreferences;
  created_at: string;
  last_active_at: string;
};

export type UserPreferences = {
  language: string;
  default_sidebar_view:
    | "explorer"
    | "dashboard"
    | "starred"
    | "stats"
    | "modules";
  startup_action: "last_vault" | "vault_picker" | "empty";
  notifications_enabled: boolean;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  language: "zh-CN",
  default_sidebar_view: "explorer",
  startup_action: "last_vault",
  notifications_enabled: true,
};

export const DEFAULT_GUEST_IDENTITY: AuthIdentity = { kind: "guest" };

export const DEFAULT_USER_PROFILE: Omit<UserProfile, "id"> = {
  display_name: "游客",
  password_hash: "",
  avatar_emoji: "👤",
  auth_identity: { kind: "guest" },
  level: 0,
  level_title: "知识新生儿",
  level_icon: "👶",
  total_points: 0,
  streak_days: 0,
  badges: [],
  recent_folders: [],
  preferences: { ...DEFAULT_USER_PREFERENCES },
  created_at: new Date().toISOString(),
  last_active_at: new Date().toISOString(),
};

export const MAX_RECENT_FOLDERS = 10;

export function as_user_id(value: string): UserId {
  return value as UserId;
}

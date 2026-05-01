import type { UserPort } from "$lib/features/user/ports";
import type { OpStore } from "$lib/app";
import type {
  UserProfile,
  UserId,
  UserPreferences,
  Badge,
  AuthIdentity,
} from "$lib/features/user/types/user_profile";
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_PREFERENCES,
  MAX_RECENT_FOLDERS,
  as_user_id,
} from "$lib/features/user/types/user_profile";
import { hash_password, verify_password } from "$lib/features/user/utils/password";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("user_service");

export type UserLoadResult =
  | { status: "success"; profile: UserProfile }
  | { status: "created"; profile: UserProfile }
  | { status: "failed"; error: string };

export type LoginResult =
  | { status: "success"; profile: UserProfile }
  | { status: "failed"; error: string };

export type BindAccountResult =
  | { status: "success"; profile: UserProfile }
  | { status: "failed"; error: string };

export class UserService {
  constructor(
    private readonly user_port: UserPort,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  async load_or_create_active_user(): Promise<UserLoadResult> {
    this.op_store.start("user.load", this.now_ms());

    try {
      let user_id = await this.user_port.get_active_user_id();

      if (user_id) {
        const profile = await this.user_port.load_user_profile(user_id);
        if (profile) {
          const updated = {
            ...profile,
            last_active_at: new Date().toISOString(),
          };
          await this.user_port.save_user_profile(updated);
          this.op_store.succeed("user.load");
          return { status: "success", profile: updated };
        }
      }

      const new_profile = create_default_profile();
      await this.user_port.create_user_profile(new_profile);
      await this.user_port.set_active_user_id(new_profile.id);
      this.op_store.succeed("user.load");
      return { status: "created", profile: new_profile };
    } catch (error) {
      const msg = error_message(error);
      log.error("Load user profile failed", { error: msg });
      this.op_store.fail("user.load", msg);
      return { status: "failed", error: msg };
    }
  }

  /**
   * Login as guest — creates a new guest profile or loads an existing one.
   */
  async login_as_guest(): Promise<UserLoadResult> {
    this.op_store.start("user.guest_login", this.now_ms());

    try {
      // Check if there's already an active guest user
      const active_id = await this.user_port.get_active_user_id();
      if (active_id) {
        const existing = await this.user_port.load_user_profile(active_id);
        if (existing && existing.auth_identity?.kind === "guest") {
          const updated = {
            ...existing,
            last_active_at: new Date().toISOString(),
          };
          await this.user_port.save_user_profile(updated);
          this.op_store.succeed("user.guest_login");
          return { status: "success", profile: updated };
        }
      }

      // Create a new guest profile
      const guest_profile = create_default_profile();
      await this.user_port.create_user_profile(guest_profile);
      await this.user_port.set_active_user_id(guest_profile.id);
      this.op_store.succeed("user.guest_login");
      return { status: "created", profile: guest_profile };
    } catch (error) {
      const msg = error_message(error);
      log.error("Guest login failed", { error: msg });
      this.op_store.fail("user.guest_login", msg);
      return { status: "failed", error: msg };
    }
  }

  /**
   * Login with username and password.
   * Finds the registered user profile matching the username, verifies the password.
   */
  async login_with_credentials(
    username: string,
    password: string,
  ): Promise<LoginResult> {
    this.op_store.start("user.login", this.now_ms());

    try {
      const all_profiles = await this.user_port.list_user_profiles();
      const target = all_profiles.find(
        (p) =>
          p.auth_identity?.kind === "registered" &&
          p.auth_identity.username.toUpperCase() === username.toUpperCase(),
      );

      if (!target) {
        this.op_store.fail("user.login", "用户名不存在");
        return { status: "failed", error: "用户名不存在" };
      }

      const valid = await verify_password(password, target.password_hash);
      if (!valid) {
        this.op_store.fail("user.login", "密码不正确");
        return { status: "failed", error: "密码不正确" };
      }

      const updated = {
        ...target,
        last_active_at: new Date().toISOString(),
      };
      await this.user_port.save_user_profile(updated);
      await this.user_port.set_active_user_id(updated.id);
      this.op_store.succeed("user.login");
      return { status: "success", profile: updated };
    } catch (error) {
      const msg = error_message(error);
      log.error("Login failed", { error: msg });
      this.op_store.fail("user.login", msg);
      return { status: "failed", error: msg };
    }
  }

  /**
   * Register a new account with username and password.
   * Creates a brand new registered user profile.
   */
  async register_account(
    username: string,
    password: string,
    display_name?: string,
  ): Promise<LoginResult> {
    this.op_store.start("user.register", this.now_ms());

    try {
      // Check if username already exists
      const all_profiles = await this.user_port.list_user_profiles();
      const exists = all_profiles.some(
        (p) =>
          p.auth_identity?.kind === "registered" &&
          p.auth_identity.username.toUpperCase() === username.toUpperCase(),
      );

      if (exists) {
        this.op_store.fail("user.register", "用户名已存在");
        return { status: "failed", error: "用户名已存在" };
      }

      const password_hash = await hash_password(password);
      const profile: UserProfile = {
        ...DEFAULT_USER_PROFILE,
        id: as_user_id(generate_user_id()),
        display_name: display_name || username,
        password_hash,
        auth_identity: { kind: "registered", username },
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      await this.user_port.create_user_profile(profile);
      await this.user_port.set_active_user_id(profile.id);
      this.op_store.succeed("user.register");
      return { status: "success", profile };
    } catch (error) {
      const msg = error_message(error);
      log.error("Register failed", { error: msg });
      this.op_store.fail("user.register", msg);
      return { status: "failed", error: msg };
    }
  }

  /**
   * Bind a guest account to a username and password.
   * Upgrades the current guest profile to a registered profile.
   * All existing data (points, badges, notes, etc.) is preserved.
   */
  async bind_account(
    profile: UserProfile,
    username: string,
    password: string,
  ): Promise<BindAccountResult> {
    this.op_store.start("user.bind_account", this.now_ms());

    try {
      if (profile.auth_identity?.kind !== "guest") {
        this.op_store.fail("user.bind_account", "当前账号已绑定");
        return { status: "failed", error: "当前账号已绑定" };
      }

      // Check if username already exists
      const all_profiles = await this.user_port.list_user_profiles();
      const exists = all_profiles.some(
        (p) =>
          p.id !== profile.id &&
          p.auth_identity?.kind === "registered" &&
          p.auth_identity.username.toUpperCase() === username.toUpperCase(),
      );

      if (exists) {
        this.op_store.fail("user.bind_account", "用户名已被占用");
        return { status: "failed", error: "用户名已被占用" };
      }

      const password_hash = await hash_password(password);
      const updated: UserProfile = {
        ...profile,
        display_name: profile.display_name === "游客" ? username : profile.display_name,
        password_hash,
        auth_identity: { kind: "registered", username },
        last_active_at: new Date().toISOString(),
      };

      await this.user_port.save_user_profile(updated);
      this.op_store.succeed("user.bind_account");
      return { status: "success", profile: updated };
    } catch (error) {
      const msg = error_message(error);
      log.error("Bind account failed", { error: msg });
      this.op_store.fail("user.bind_account", msg);
      return { status: "failed", error: msg };
    }
  }

  async update_display_name(
    profile: UserProfile,
    display_name: string,
  ): Promise<UserProfile> {
    const updated = { ...profile, display_name };
    await this.save_profile(updated);
    return updated;
  }

  async update_avatar(
    profile: UserProfile,
    avatar_emoji: string,
  ): Promise<UserProfile> {
    const updated = { ...profile, avatar_emoji };
    await this.save_profile(updated);
    return updated;
  }

  async update_preferences(
    profile: UserProfile,
    preferences: Partial<UserPreferences>,
  ): Promise<UserProfile> {
    const updated = {
      ...profile,
      preferences: { ...profile.preferences, ...preferences },
    };
    await this.save_profile(updated);
    return updated;
  }

  async add_recent_folder(
    profile: UserProfile,
    folder_path: string,
  ): Promise<UserProfile> {
    const filtered = profile.recent_folders.filter((f) => f !== folder_path);
    const recent_folders = [folder_path, ...filtered].slice(
      0,
      MAX_RECENT_FOLDERS,
    );
    const updated = { ...profile, recent_folders };
    await this.save_profile(updated);
    return updated;
  }

  async add_badge(profile: UserProfile, badge: Badge): Promise<UserProfile> {
    if (profile.badges.some((b) => b.id === badge.id)) {
      return profile;
    }
    const updated = {
      ...profile,
      badges: [...profile.badges, badge],
    };
    await this.save_profile(updated);
    return updated;
  }

  async update_level(
    profile: UserProfile,
    level: number,
    level_title: string,
    level_icon: string,
    total_points: number,
  ): Promise<UserProfile> {
    const updated = {
      ...profile,
      level,
      level_title,
      level_icon,
      total_points,
    };
    await this.save_profile(updated);
    return updated;
  }

  async update_streak(
    profile: UserProfile,
    streak_days: number,
  ): Promise<UserProfile> {
    const updated = { ...profile, streak_days };
    await this.save_profile(updated);
    return updated;
  }

  async switch_user(user_id: UserId): Promise<UserLoadResult> {
    this.op_store.start("user.switch", this.now_ms());

    try {
      const profile = await this.user_port.load_user_profile(user_id);
      if (!profile) {
        this.op_store.fail("user.switch", "User not found");
        return { status: "failed", error: "User not found" };
      }
      await this.user_port.set_active_user_id(user_id);
      const updated = {
        ...profile,
        last_active_at: new Date().toISOString(),
      };
      await this.user_port.save_user_profile(updated);
      this.op_store.succeed("user.switch");
      return { status: "success", profile: updated };
    } catch (error) {
      const msg = error_message(error);
      log.error("Switch user failed", { error: msg });
      this.op_store.fail("user.switch", msg);
      return { status: "failed", error: msg };
    }
  }

  async list_users(): Promise<UserProfile[]> {
    try {
      return await this.user_port.list_user_profiles();
    } catch (error) {
      log.error("List users failed", { error: error_message(error) });
      return [];
    }
  }

  async create_user(
    display_name: string,
    avatar_emoji: string,
    password?: string,
  ): Promise<UserLoadResult> {
    this.op_store.start("user.create", this.now_ms());

    try {
      const password_hash = password ? await hash_password(password) : "";
      const auth_identity: AuthIdentity = password
        ? { kind: "registered", username: display_name }
        : { kind: "guest" };
      const profile: UserProfile = {
        ...DEFAULT_USER_PROFILE,
        id: as_user_id(generate_user_id()),
        display_name,
        password_hash,
        avatar_emoji,
        auth_identity,
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };
      await this.user_port.create_user_profile(profile);
      this.op_store.succeed("user.create");
      return { status: "created", profile };
    } catch (error) {
      const msg = error_message(error);
      log.error("Create user failed", { error: msg });
      this.op_store.fail("user.create", msg);
      return { status: "failed", error: msg };
    }
  }

  async change_password(
    profile: UserProfile,
    current_password: string,
    new_password: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Verify current password if one is set
    if (profile.password_hash) {
      const valid = await verify_password(current_password, profile.password_hash);
      if (!valid) {
        return { success: false, error: "当前密码不正确" };
      }
    }

    const new_hash = new_password ? await hash_password(new_password) : "";
    const updated = { ...profile, password_hash: new_hash };
    await this.save_profile(updated);
    return { success: true };
  }

  async verify_user_password(
    user_id: UserId,
    password: string,
  ): Promise<boolean> {
    try {
      const profile = await this.user_port.load_user_profile(user_id);
      if (!profile) return false;
      return verify_password(password, profile.password_hash);
    } catch {
      return false;
    }
  }

  has_password(profile: UserProfile): boolean {
    return !!profile.password_hash;
  }

  async delete_user(user_id: UserId): Promise<void> {
    try {
      await this.user_port.delete_user_profile(user_id);
    } catch (error) {
      log.error("Delete user failed", { error: error_message(error) });
    }
  }

  private async save_profile(profile: UserProfile): Promise<void> {
    try {
      await this.user_port.save_user_profile(profile);
    } catch (error) {
      log.error("Save user profile failed", {
        error: error_message(error),
      });
    }
  }
}

function generate_user_id(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function create_default_profile(): UserProfile {
  return {
    ...DEFAULT_USER_PROFILE,
    id: as_user_id(generate_user_id()),
    preferences: { ...DEFAULT_USER_PREFERENCES },
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  };
}

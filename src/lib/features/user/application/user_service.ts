import type { UserPort } from "$lib/features/user/ports";
import type { OpStore } from "$lib/app";
import type {
  UserProfile,
  UserId,
  UserPreferences,
  Badge,
} from "$lib/features/user/types/user_profile";
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_PREFERENCES,
  MAX_RECENT_FOLDERS,
  as_user_id,
} from "$lib/features/user/types/user_profile";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("user_service");

export type UserLoadResult =
  | { status: "success"; profile: UserProfile }
  | { status: "created"; profile: UserProfile }
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
  ): Promise<UserLoadResult> {
    this.op_store.start("user.create", this.now_ms());

    try {
      const profile: UserProfile = {
        ...DEFAULT_USER_PROFILE,
        id: as_user_id(generate_user_id()),
        display_name,
        avatar_emoji,
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

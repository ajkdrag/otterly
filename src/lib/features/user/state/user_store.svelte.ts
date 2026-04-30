import type {
  UserProfile,
  UserId,
  Badge,
  UserPreferences,
} from "$lib/features/user/types/user_profile";

export class UserStore {
  active_profile = $state<UserProfile | null>(null);
  all_profiles = $state<UserProfile[]>([]);

  get active_user_id(): UserId | null {
    return this.active_profile?.id ?? null;
  }

  get display_name(): string {
    return this.active_profile?.display_name ?? "User";
  }

  get avatar_emoji(): string {
    return this.active_profile?.avatar_emoji ?? "👤";
  }

  get level(): number {
    return this.active_profile?.level ?? 0;
  }

  get level_title(): string {
    return this.active_profile?.level_title ?? "知识新生儿";
  }

  get level_icon(): string {
    return this.active_profile?.level_icon ?? "👶";
  }

  get total_points(): number {
    return this.active_profile?.total_points ?? 0;
  }

  get streak_days(): number {
    return this.active_profile?.streak_days ?? 0;
  }

  get badges(): Badge[] {
    return this.active_profile?.badges ?? [];
  }

  get recent_folders(): string[] {
    return this.active_profile?.recent_folders ?? [];
  }

  get preferences(): UserPreferences | null {
    return this.active_profile?.preferences ?? null;
  }

  set_active_profile(profile: UserProfile): void {
    this.active_profile = profile;
  }

  set_all_profiles(profiles: UserProfile[]): void {
    this.all_profiles = profiles;
  }

  clear(): void {
    this.active_profile = null;
    this.all_profiles = [];
  }
}

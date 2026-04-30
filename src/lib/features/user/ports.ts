import type {
  UserProfile,
  UserId,
} from "$lib/features/user/types/user_profile";

export interface UserPort {
  load_user_profile(user_id: UserId): Promise<UserProfile | null>;
  save_user_profile(profile: UserProfile): Promise<void>;
  list_user_profiles(): Promise<UserProfile[]>;
  create_user_profile(profile: UserProfile): Promise<void>;
  delete_user_profile(user_id: UserId): Promise<void>;
  get_active_user_id(): Promise<UserId | null>;
  set_active_user_id(user_id: UserId): Promise<void>;
}

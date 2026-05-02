export { UserService } from "$lib/features/user/application/user_service";
export type {
  UserLoadResult,
  LoginResult,
  BindAccountResult,
} from "$lib/features/user/application/user_service";
export type { UserPort } from "$lib/features/user/ports";
export { UserStore } from "$lib/features/user/state/user_store.svelte";
export type { AuthScreenState } from "$lib/features/user/state/user_store.svelte";
export { create_user_settings_adapter } from "$lib/features/user/adapters/user_settings_adapter";
export type {
  UserProfile,
  UserId,
  Badge,
  UserPreferences,
  AuthIdentity,
} from "$lib/features/user/types/user_profile";
export {
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_GUEST_IDENTITY,
  MAX_RECENT_FOLDERS,
  as_user_id,
} from "$lib/features/user/types/user_profile";
export type { GrowthLevel } from "$lib/features/user/types/growth_levels";
export {
  GROWTH_LEVELS,
  get_level_progress,
} from "$lib/features/user/types/growth_levels";
export {
  hash_password,
  verify_password,
} from "$lib/features/user/utils/password";
export { default as UserProfilePanel } from "$lib/features/user/ui/user_profile_panel.svelte";
export { default as LoginScreen } from "$lib/features/user/ui/login_screen.svelte";
export { default as BindAccountDialog } from "$lib/features/user/ui/bind_account_dialog.svelte";

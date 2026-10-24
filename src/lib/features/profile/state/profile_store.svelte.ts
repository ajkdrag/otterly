import { DEFAULT_PROFILE_ID } from "$lib/features/profile/types/profile";

export class ProfileStore {
  // null until app.mounted loads it.
  current_id = $state<string | null>(null);
  profile_ids = $state<string[]>([]);
  is_default = $derived(this.current_id === DEFAULT_PROFILE_ID);

  set_current_id(profile_id: string) {
    this.current_id = profile_id;
  }

  set_profile_ids(profile_ids: string[]) {
    this.profile_ids = profile_ids;
  }
}

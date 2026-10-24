export interface ProfilePort {
  get_current_profile(): Promise<string>;
  // "default" first, then the other profiles sorted by id.
  list_profiles(): Promise<string[]>;
  // Starts the profile in its own process, or focuses it when it runs already.
  open_profile(profile_id: string): Promise<void>;
  // True once after the Dock's "New Profile…". Reading it clears it.
  take_dialog_request(): Promise<boolean>;
  subscribe_dialog_requests(callback: () => void): () => void;
}

import type { ProfilePort } from "$lib/features/profile/ports";
import type { ProfileStore } from "$lib/features/profile/state/profile_store.svelte";
import type { OpStore } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("profile_service");

const OPEN_PROFILE_OP_KEY = "profile.open";

export class ProfileService {
  constructor(
    private readonly profile_port: ProfilePort,
    private readonly profile_store: ProfileStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  async load_current_profile(): Promise<void> {
    try {
      const profile_id = await this.profile_port.get_current_profile();
      this.profile_store.set_current_id(profile_id);
    } catch (error) {
      log.error("Load current profile failed", { error: error_message(error) });
    }
  }

  async load_profiles(): Promise<void> {
    try {
      const profile_ids = await this.profile_port.list_profiles();
      this.profile_store.set_profile_ids(profile_ids);
    } catch (error) {
      log.error("List profiles failed", { error: error_message(error) });
    }
  }

  // Returns false on failure. The error is in OpStore under "profile.open".
  async open_profile(profile_id: string): Promise<boolean> {
    this.op_store.start(OPEN_PROFILE_OP_KEY, this.now_ms());
    try {
      await this.profile_port.open_profile(profile_id);
      this.op_store.succeed(OPEN_PROFILE_OP_KEY);
      return true;
    } catch (error) {
      const message = error_message(error);
      log.error("Open profile failed", { profile_id, error: message });
      this.op_store.fail(OPEN_PROFILE_OP_KEY, message);
      return false;
    }
  }

  async take_dialog_request(): Promise<boolean> {
    try {
      return await this.profile_port.take_dialog_request();
    } catch (error) {
      log.error("Profiles dialog request check failed", {
        error: error_message(error),
      });
      return false;
    }
  }

  subscribe_dialog_requests(callback: () => void): () => void {
    return this.profile_port.subscribe_dialog_requests(callback);
  }
}

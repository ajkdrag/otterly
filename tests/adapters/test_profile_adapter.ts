import type { ProfilePort } from "$lib/features/profile";

export function create_test_profile_adapter(): ProfilePort {
  return {
    get_current_profile() {
      return Promise.resolve("default");
    },
    list_profiles() {
      return Promise.resolve(["default"]);
    },
    open_profile() {
      return Promise.resolve();
    },
    take_dialog_request() {
      return Promise.resolve(false);
    },
    subscribe_dialog_requests() {
      return () => {};
    },
  };
}

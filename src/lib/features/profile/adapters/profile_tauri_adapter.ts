import type { ProfilePort } from "$lib/features/profile/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";

function subscribe_profile_dialog_requests(callback: () => void): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen("profile_dialog_requested", () => {
    if (is_disposed) {
      return;
    }
    callback();
  }).then((fn_ref) => {
    if (is_disposed) {
      fn_ref();
      return;
    }
    unlisten_fn = fn_ref;
  });

  return () => {
    is_disposed = true;
    unlisten_fn?.();
    unlisten_fn = null;
  };
}

export function create_profile_tauri_adapter(): ProfilePort {
  return {
    get_current_profile: () => tauri_invoke<string>("get_current_profile"),
    list_profiles: () => tauri_invoke<string[]>("list_profiles"),
    async open_profile(profile_id: string): Promise<void> {
      await tauri_invoke<undefined>("open_profile", { profileId: profile_id });
    },
    take_dialog_request: () =>
      tauri_invoke<boolean>("take_profile_dialog_request"),
    subscribe_dialog_requests: subscribe_profile_dialog_requests,
  };
}

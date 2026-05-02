import type { UserStore } from "$lib/features/user";
import type { UserService } from "$lib/features/user";
import type { UIStore } from "$lib/app";

const PERSIST_DELAY_MS = 2000;

export function create_user_folder_persist_reactor(
  ui_store: UIStore,
  user_store: UserStore,
  user_service: UserService,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last_folder: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const folder_path = ui_store.selected_folder_path;

      // Only read folder_path reactively, avoid tracking active_profile
      // to prevent re-triggering when profile is updated
      if (!folder_path || folder_path === last_folder) {
        return;
      }

      last_folder = folder_path;

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        const current_profile = user_store.active_profile;
        if (!current_profile) return;
        void user_service
          .add_recent_folder(current_profile, folder_path)
          .then((updated) => {
            user_store.set_active_profile(updated);
          });
      }, PERSIST_DELAY_MS);
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  });
}

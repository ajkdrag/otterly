import { PetService } from "$lib/features/pets";
import type { PetStore } from "$lib/features/pets";
import type { VaultStore } from "$lib/features/vault";
import type { UserStore } from "$lib/features/user";

/**
 * 宠物同步 Reactor
 *
 * 职责:
 * - 当 vault 打开时自动加载宠物
 * - 定期更新宠物心情 (每5分钟)
 * - 定期刷新宠物状态 (每2分钟)
 */
export function create_pet_sync_reactor(
  pet_store: PetStore,
  vault_store: VaultStore,
  user_store: UserStore,
  pet_service: PetService,
): () => void {
  let mood_timer: ReturnType<typeof setInterval> | null = null;
  let refresh_timer: ReturnType<typeof setInterval> | null = null;
  let prev_vault_id: string | null = null;

  const effect = $effect.root(() => {
    // 监听 vault 变化，自动加载宠物
    $effect(() => {
      const vault_id = vault_store.vault?.id ?? null;
      const owner_id = user_store.active_user_id;

      if (vault_id && owner_id && vault_id !== prev_vault_id) {
        prev_vault_id = vault_id;
        void pet_service.load_pet();
        void pet_service.load_inventory();
      }

      if (!vault_id) {
        prev_vault_id = null;
        pet_store.set_pet(null);
      }
    });

    // 定时更新心情 (每5分钟)
    mood_timer = setInterval(() => {
      if (pet_store.has_pet) {
        void pet_service.update_mood();
      }
    }, 5 * 60 * 1000);

    // 定时刷新状态 (每2分钟)
    refresh_timer = setInterval(() => {
      if (pet_store.has_pet) {
        void pet_service.refresh_state();
      }
    }, 2 * 60 * 1000);
  });

  return () => {
    effect();
    if (mood_timer) clearInterval(mood_timer);
    if (refresh_timer) clearInterval(refresh_timer);
  };
}

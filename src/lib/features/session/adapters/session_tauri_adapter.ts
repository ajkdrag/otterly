import type { SessionPort } from "$lib/features/session/ports";
import type { VaultId } from "$lib/shared/types/ids";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_session_tauri_adapter(): SessionPort {
  return {
    async load_latest_session<T>(vault_id: VaultId): Promise<T | null> {
      const session = await tauri_invoke<T | null>(
        "load_latest_vault_session",
        {
          vaultId: vault_id,
        },
      );
      return session ?? null;
    },

    async save_latest_session(
      vault_id: VaultId,
      session: unknown,
    ): Promise<void> {
      await tauri_invoke<undefined>("save_latest_vault_session", {
        vaultId: vault_id,
        session,
      });
    },
  };
}

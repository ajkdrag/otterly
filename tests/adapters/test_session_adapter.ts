import type { SessionPort } from "$lib/features/session";
import type { VaultId } from "$lib/shared/types/ids";

export function create_test_session_adapter(): SessionPort {
  const storage = new Map<VaultId, unknown>();

  return {
    load_latest_session<T>(vault_id: VaultId): Promise<T | null> {
      const value = storage.get(vault_id);
      return Promise.resolve(value !== undefined ? (value as T) : null);
    },

    save_latest_session(vault_id: VaultId, session: unknown): Promise<void> {
      storage.set(vault_id, session);
      return Promise.resolve();
    },
  };
}

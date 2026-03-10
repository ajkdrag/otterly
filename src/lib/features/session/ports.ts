import type { VaultId } from "$lib/shared/types/ids";

export interface SessionPort {
  load_latest_session<T>(vault_id: VaultId): Promise<T | null>;
  save_latest_session(vault_id: VaultId, session: unknown): Promise<void>;
}

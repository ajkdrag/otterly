import type { VaultId } from "$lib/shared/types/ids";

export interface ShellPort {
  open_url: (url: string) => Promise<void>;
  reveal_in_file_manager: (vault_id: VaultId, path: string) => Promise<void>;
  open_in_default_app: (vault_id: VaultId, path: string) => Promise<void>;
}

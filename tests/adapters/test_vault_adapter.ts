import type { VaultPort } from "$lib/features/vault";
import {
  as_vault_id,
  as_vault_path,
  type VaultId,
  type VaultPath,
} from "$lib/shared/types/ids";
import type { Vault } from "$lib/shared/types/vault";

const TEST_VAULT_PATH = as_vault_path("test-vault");
const TEST_VAULT_ID = as_vault_id("test_vault_001");
const TEST_VAULT_NAME = "Test Vault";

const TEST_VAULT_2_PATH = as_vault_path("another-vault");
const TEST_VAULT_2_ID = as_vault_id("test_vault_002");
const TEST_VAULT_2_NAME = "Another Vault";

const LAST_VAULT_KEY = "leapgrownotes_test_last_vault_id";

export function create_test_vault_adapter(): VaultPort {
  let last_vault_id: VaultId | null = null;
  const vault_a: Vault = {
    id: TEST_VAULT_ID,
    path: TEST_VAULT_PATH,
    name: TEST_VAULT_NAME,
    created_at: Date.now(),
    last_opened_at: Date.now(),
    note_count: 12,
    is_available: true,
  };
  const vault_b: Vault = {
    id: TEST_VAULT_2_ID,
    path: TEST_VAULT_2_PATH,
    name: TEST_VAULT_2_NAME,
    created_at: Date.now(),
    last_opened_at: Date.now(),
    note_count: 8,
    is_available: true,
  };
  const vaults: Vault[] = [vault_a, vault_b];

  return {
    choose_vault(): Promise<VaultPath | null> {
      return Promise.resolve(TEST_VAULT_PATH);
    },

    open_vault(vault_path: VaultPath): Promise<Vault> {
      if (vault_path === TEST_VAULT_PATH) {
        return Promise.resolve({
          ...vault_a,
          created_at: Date.now(),
          last_opened_at: Date.now(),
        });
      }

      if (vault_path === TEST_VAULT_2_PATH) {
        return Promise.resolve({
          ...vault_b,
          created_at: Date.now(),
          last_opened_at: Date.now(),
        });
      }

      return Promise.reject(
        new Error(
          `Test adapter only supports paths: ${TEST_VAULT_PATH}, ${TEST_VAULT_2_PATH}`,
        ),
      );
    },

    open_vault_by_id(vault_id: VaultId): Promise<Vault> {
      if (vault_id === TEST_VAULT_ID) {
        return Promise.resolve({
          ...vault_a,
          created_at: Date.now(),
          last_opened_at: Date.now(),
        });
      }

      if (vault_id === TEST_VAULT_2_ID) {
        return Promise.resolve({
          ...vault_b,
          created_at: Date.now(),
          last_opened_at: Date.now(),
        });
      }

      return Promise.reject(
        new Error(
          `Test adapter only supports vault IDs: ${TEST_VAULT_ID}, ${TEST_VAULT_2_ID}`,
        ),
      );
    },

    list_vaults(): Promise<Vault[]> {
      return Promise.resolve(vaults);
    },

    remove_vault(vault_id: VaultId): Promise<void> {
      const index = vaults.findIndex((vault) => vault.id === vault_id);
      if (index >= 0) {
        vaults.splice(index, 1);
      }
      if (last_vault_id === vault_id) {
        last_vault_id = null;
      }
      return Promise.resolve();
    },

    remember_last_vault(vault_id: VaultId): Promise<void> {
      last_vault_id = vault_id;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(LAST_VAULT_KEY, vault_id);
      }
      return Promise.resolve();
    },

    get_last_vault_id(): Promise<VaultId | null> {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(LAST_VAULT_KEY);
        return Promise.resolve(stored ? as_vault_id(stored) : null);
      }
      return Promise.resolve(last_vault_id);
    },
  };
}

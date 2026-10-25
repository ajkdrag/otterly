import { Channel } from "@tauri-apps/api/core";
import { summarize_query_error } from "$lib/features/search/domain/query_error_message";
import type { VaultFindPort } from "$lib/features/search/ports";
import type {
  VaultFindError,
  VaultFindFile,
  VaultFindMatch,
  VaultFindStats,
  VaultReplaceResponse,
} from "$lib/features/search/types/vault_find";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { error_message } from "$lib/shared/utils/error_message";

type TauriVaultFindFile = Omit<VaultFindFile, "matches"> & {
  matches: Omit<VaultFindMatch, "index">[];
};

type TauriVaultFindEvent =
  | {
      type: "files";
      files: TauriVaultFindFile[];
      group_names: (string | null)[];
    }
  | ({ type: "done" } & VaultFindStats);

type TauriVaultReplaceResponse = {
  replaced: {
    path: string;
    count: number;
    remaining: TauriVaultFindFile | null;
  }[];
  skipped: VaultReplaceResponse["skipped"];
};

// Rust sends each file's matches in order. Their position is the ordinal
// that vault_replace takes back.
function to_vault_find_file(file: TauriVaultFindFile): VaultFindFile {
  return {
    ...file,
    matches: file.matches.map((match, index) => ({ ...match, index })),
  };
}

// vault_find_start rejects a bad query or glob with "invalid_query:<msg>" or
// "invalid_glob:<msg>". tauri_invoke wraps that in its own prefix.
function parse_invalid_input(error: unknown): VaultFindError | null {
  const found = /(invalid_query|invalid_glob):([\s\S]*)$/.exec(
    error_message(error),
  );
  if (!found) return null;
  const message = (found[2] ?? "").trim();
  if (found[1] === "invalid_glob") return { kind: "invalid_glob", message };
  return {
    kind: "invalid_query",
    message: summarize_query_error(message),
    details: message,
  };
}

export function create_vault_find_tauri_adapter(): VaultFindPort {
  return {
    async start_find(vault_id, request, on_event) {
      const channel = new Channel<TauriVaultFindEvent>((event) => {
        on_event(
          event.type === "files"
            ? { ...event, files: event.files.map(to_vault_find_file) }
            : event,
        );
      });
      try {
        await tauri_invoke<void>("vault_find_start", {
          vaultId: vault_id,
          request,
          onEvent: channel,
        });
        return { status: "started" };
      } catch (error) {
        const invalid = parse_invalid_input(error);
        if (!invalid) throw error;
        return { status: "invalid", error: invalid };
      }
    },

    async cancel_find() {
      await tauri_invoke<void>("vault_find_cancel");
    },

    async replace(vault_id, request) {
      const response = await tauri_invoke<TauriVaultReplaceResponse>(
        "vault_replace",
        { vaultId: vault_id, request },
      );
      return {
        replaced: response.replaced.map((file) => ({
          ...file,
          remaining: file.remaining ? to_vault_find_file(file.remaining) : null,
        })),
        skipped: response.skipped,
      };
    },
  };
}

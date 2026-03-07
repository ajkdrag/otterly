import { invoke } from "@tauri-apps/api/core";
import type { DocumentPort } from "$lib/features/document/ports";

export function create_document_tauri_adapter(): DocumentPort {
  return {
    async read_file(vault_id: string, relative_path: string): Promise<string> {
      return invoke<string>("read_vault_file", { vault_id, relative_path });
    },
    resolve_asset_url(vault_id: string, relative_path: string): string {
      return `otterly-asset://vault/${vault_id}/${relative_path}`;
    },
  };
}

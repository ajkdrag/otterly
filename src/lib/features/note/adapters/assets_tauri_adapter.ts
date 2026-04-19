import type { AssetsPort } from "$lib/features/note/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { otterly_asset_url } from "$lib/features/note/domain/asset_url";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { as_asset_path } from "$lib/shared/types/ids";

function build_write_image_asset_args(
  vault_id: VaultId,
  input: Parameters<AssetsPort["write_image_asset"]>[1],
) {
  return {
    vault_id,
    note_path: input.note_path,
    mime_type: input.image.mime_type,
    file_name: input.image.file_name,
    bytes: Array.from(input.image.bytes),
    custom_filename: input.custom_filename,
    attachment_folder: input.attachment_folder,
    store_with_note: input.store_with_note,
  };
}

export function create_assets_tauri_adapter(): AssetsPort {
  return {
    resolve_asset_url(vault_id: VaultId, asset_path: AssetPath) {
      return otterly_asset_url(vault_id, asset_path);
    },
    async write_image_asset(vault_id, input) {
      const asset_path = await tauri_invoke<string>("write_image_asset", {
        args: build_write_image_asset_args(vault_id, input),
      });

      return as_asset_path(asset_path);
    },
  };
}

import type { AssetsPort } from "$lib/features/note";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { as_asset_path } from "$lib/shared/types/ids";

export function create_test_assets_adapter(): AssetsPort {
  const blob_url_cache = new Map<string, string>();
  let write_count = 0;

  return {
    resolve_asset_url(
      vault_id: VaultId,
      asset_path: AssetPath,
    ): Promise<string> {
      const cache_key = `${vault_id}:${asset_path}`;

      const cached_url = blob_url_cache.get(cache_key);
      if (cached_url) {
        return Promise.resolve(cached_url);
      }

      return Promise.reject(new Error(`Asset not found: ${asset_path}`));
    },
    write_image_asset(vault_id, input) {
      write_count += 1;

      const note_path = String(input.note_path);
      const parts = note_path.split("/").filter(Boolean);

      let filename: string;
      if (input.custom_filename) {
        filename = input.custom_filename;
      } else {
        const note_name = (parts.at(-1) ?? "note.md").replace(/\.md$/i, "");
        filename = `${note_name}-${String(write_count)}.png`;
      }

      const note_dir_parts = parts.slice(0, -1);
      const dir_prefix =
        note_dir_parts.length > 0 ? `${note_dir_parts.join("/")}/` : "";

      let asset_path: ReturnType<typeof as_asset_path>;
      if (input.store_with_note) {
        asset_path = as_asset_path(`${dir_prefix}${filename}`);
      } else {
        const attachment_folder = input.attachment_folder || ".assets";
        asset_path = as_asset_path(
          `${dir_prefix}${attachment_folder}/${filename}`,
        );
      }
      const cache_key = `${vault_id}:${asset_path}`;
      blob_url_cache.set(
        cache_key,
        `test://assets/${encodeURIComponent(String(asset_path))}`,
      );
      return Promise.resolve(asset_path);
    },
  };
}

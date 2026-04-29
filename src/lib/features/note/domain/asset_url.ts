import type { AssetPath, VaultId } from "$lib/shared/types/ids";

export function leapgrownotes_asset_url(
  vault_id: VaultId,
  asset_path: AssetPath,
): string {
  const encoded = String(asset_path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `leapgrownotes-asset://vault/${vault_id}/${encoded}`;
}

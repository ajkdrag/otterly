import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import { custom_scheme_base } from "$lib/shared/utils/custom_scheme_url";

export function otterly_asset_url(
  vault_id: VaultId,
  asset_path: AssetPath,
  platform?: string,
): string {
  const encoded = String(asset_path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${custom_scheme_base("otterly-asset", platform)}vault/${vault_id}/${encoded}`;
}

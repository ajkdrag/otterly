import { describe, it, expect } from "vitest";
import { otterly_asset_url } from "$lib/features/note/domain/asset_url";
import { as_asset_path, as_vault_id } from "$lib/shared/types/ids";

describe("otterly_asset_url", () => {
  it("encodes asset paths for custom scheme", () => {
    const vault_id = as_vault_id("vault-1");
    const asset_path = as_asset_path(".assets/folder name/image 1.png");

    const result = otterly_asset_url(vault_id, asset_path, "MacIntel");

    expect(result).toBe(
      "otterly-asset://vault/vault-1/.assets/folder%20name/image%201.png",
    );
  });

  it("uses the localhost form WebView2 can load on Windows", () => {
    const result = otterly_asset_url(
      as_vault_id("vault-1"),
      as_asset_path("pic.png"),
      "Win32",
    );

    expect(result).toBe("http://otterly-asset.localhost/vault/vault-1/pic.png");
  });
});

import { describe, it, expect } from "vitest";
import { leapgrownotes_asset_url } from "$lib/features/note/domain/asset_url";
import { as_asset_path, as_vault_id } from "$lib/shared/types/ids";

describe("leapgrownotes_asset_url", () => {
  it("encodes asset paths for custom scheme", () => {
    const vault_id = as_vault_id("vault-1");
    const asset_path = as_asset_path(".assets/folder name/image 1.png");

    const result = leapgrownotes_asset_url(vault_id, asset_path);

    expect(result).toBe(
      "leapgrownotes-asset://vault/vault-1/.assets/folder%20name/image%201.png",
    );
  });
});

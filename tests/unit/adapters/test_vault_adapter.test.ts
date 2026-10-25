import { describe, it, expect } from "vitest";
import { create_test_vault_adapter } from "../../adapters/test_vault_adapter";
import { as_vault_path } from "$lib/shared/types/ids";

describe("test_vault_adapter", () => {
  it("opens vault by path", async () => {
    const adapter = create_test_vault_adapter();
    const vault = await adapter.open_vault(as_vault_path("test-vault"));

    expect(vault.id).toBeDefined();
    expect(vault.path).toBe(as_vault_path("test-vault"));
  });
});

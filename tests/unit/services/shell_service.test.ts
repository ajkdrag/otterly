import { describe, expect, it } from "vitest";
import { ShellService } from "$lib/features/shell/application/shell_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_shell_adapter } from "../../adapters/test_shell_adapter";
import { create_test_vault } from "../helpers/test_fixtures";

function create_harness({ with_vault = true } = {}) {
  const port = create_test_shell_adapter();
  const vault_store = new VaultStore();
  if (with_vault) vault_store.set_vault(create_test_vault());
  return { port, service: new ShellService(port, vault_store) };
}

describe("ShellService.reveal_in_file_manager", () => {
  it("reveals the vault item", async () => {
    const { port, service } = create_harness();

    expect(await service.reveal_in_file_manager("docs/a.md")).toBe(true);
    expect(port._calls.reveal_in_file_manager).toEqual(["docs/a.md"]);
  });

  it("does nothing without an open vault", async () => {
    const { port, service } = create_harness({ with_vault: false });

    expect(await service.reveal_in_file_manager("docs/a.md")).toBe(false);
    expect(port._calls.reveal_in_file_manager).toEqual([]);
  });

  it("reports failure when the port throws", async () => {
    const { port, service } = create_harness();
    port.reveal_in_file_manager = () => Promise.reject(new Error("gone"));

    expect(await service.reveal_in_file_manager("docs/a.md")).toBe(false);
  });
});

describe("ShellService.open_in_default_app", () => {
  it("opens the vault item", async () => {
    const { port, service } = create_harness();

    expect(await service.open_in_default_app("docs/a.md")).toBe(true);
    expect(port._calls.open_in_default_app).toEqual(["docs/a.md"]);
  });

  it("does nothing without an open vault", async () => {
    const { port, service } = create_harness({ with_vault: false });

    expect(await service.open_in_default_app("docs/a.md")).toBe(false);
    expect(port._calls.open_in_default_app).toEqual([]);
  });

  it("reports failure when the port throws", async () => {
    const { port, service } = create_harness();
    port.open_in_default_app = () => Promise.reject(new Error("gone"));

    expect(await service.open_in_default_app("docs/a.md")).toBe(false);
  });
});

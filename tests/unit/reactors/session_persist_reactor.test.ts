import { describe, expect, it, vi } from "vitest";
import { resolve_saved_session_signature } from "$lib/reactors/session_persist.reactor.svelte";
import { as_vault_id } from "$lib/shared/types/ids";

describe("session_persist.reactor", () => {
  it("captures the post-save signature when the save finishes for the active vault", () => {
    const build_session_signature = vi.fn(() => "post-save-signature");

    expect(
      resolve_saved_session_signature({
        active_vault_id: as_vault_id("vault-a"),
        saving_vault_id: as_vault_id("vault-a"),
        build_session_signature,
      }),
    ).toBe("post-save-signature");
    expect(build_session_signature).toHaveBeenCalledTimes(1);
  });

  it("does not stamp a signature when the save finishes after a vault switch", () => {
    const build_session_signature = vi.fn(() => "post-save-signature");

    expect(
      resolve_saved_session_signature({
        active_vault_id: as_vault_id("vault-b"),
        saving_vault_id: as_vault_id("vault-a"),
        build_session_signature,
      }),
    ).toBeNull();
    expect(build_session_signature).not.toHaveBeenCalled();
  });
});

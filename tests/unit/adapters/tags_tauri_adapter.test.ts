import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_tags_tauri_adapter } from "$lib/features/tags/adapters/tags_tauri_adapter";
import { as_vault_id } from "$lib/shared/types/ids";

const { tauri_invoke_mock } = vi.hoisted(() => ({
  tauri_invoke_mock: vi.fn(),
}));

vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: tauri_invoke_mock,
}));

describe("tags_tauri_adapter", () => {
  beforeEach(() => {
    tauri_invoke_mock.mockReset();
  });

  it("sends camelCase argument names that match the Rust commands", async () => {
    tauri_invoke_mock.mockResolvedValue([]);
    const adapter = create_tags_tauri_adapter();

    await adapter.list_tags(as_vault_id("vault-1"));
    await adapter.list_notes_with_tag(as_vault_id("vault-1"), "work");
    await adapter.extract_note_tags("#work");

    expect(tauri_invoke_mock.mock.calls).toEqual([
      ["index_list_tags", { vaultId: "vault-1" }],
      ["index_list_notes_with_tag", { vaultId: "vault-1", tag: "work" }],
      ["extract_note_tags", { markdown: "#work" }],
    ]);
  });
});

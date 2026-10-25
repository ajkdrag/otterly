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
    const vault_id = as_vault_id("vault-1");
    const query = {
      tags: ["work"],
      match: "any" as const,
      text: "plan",
      limit: 50,
    };

    await adapter.list_tags(vault_id);
    await adapter.suggest_tags(vault_id, "wo", ["home"], 20);
    tauri_invoke_mock.mockResolvedValueOnce({
      notes: [],
      total: 0,
      truncated: false,
    });
    await adapter.search_tagged_notes(vault_id, query);
    await adapter.extract_note_tags("#work");

    expect(tauri_invoke_mock.mock.calls).toEqual([
      ["index_list_tags", { vaultId: "vault-1" }],
      [
        "index_suggest_tags",
        { vaultId: "vault-1", partial: "wo", exclude: ["home"], limit: 20 },
      ],
      ["index_search_tagged_notes", { vaultId: "vault-1", query }],
      ["extract_note_tags", { markdown: "#work" }],
    ]);
  });
});

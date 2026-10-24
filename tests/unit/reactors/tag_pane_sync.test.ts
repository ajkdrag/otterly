import { describe, expect, it } from "vitest";
import { resolve_tag_pane_sync_decision } from "$lib/reactors/tag_pane_sync.reactor.svelte";

type IndexStatus = "idle" | "indexing" | "completed" | "failed";

function state(
  value?: Partial<{
    last_vault_id: string | null;
    last_pane_visible: boolean;
    last_index_status: IndexStatus;
    last_note_path: string | null;
    last_note_dirty: boolean;
  }>,
) {
  return {
    last_vault_id: "vault-1",
    last_pane_visible: true,
    last_index_status: "completed" as IndexStatus,
    last_note_path: "a.md",
    last_note_dirty: false,
    ...value,
  };
}

function input(
  value?: Partial<{
    vault_id: string | null;
    pane_visible: boolean;
    index_status: IndexStatus;
    open_note_path: string | null;
    open_note_dirty: boolean;
  }>,
) {
  return {
    vault_id: "vault-1",
    pane_visible: true,
    index_status: "completed" as IndexStatus,
    open_note_path: "a.md",
    open_note_dirty: false,
    ...value,
  };
}

describe("tag_pane_sync.reactor", () => {
  it("does nothing when nothing changed", () => {
    const result = resolve_tag_pane_sync_decision(state(), input());

    expect(result.clear).toBe(false);
    expect(result.reload).toBe(false);
  });

  it("reloads when the pane becomes visible", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_pane_visible: false }),
      input(),
    );

    expect(result.reload).toBe(true);
  });

  it("reloads when indexing completes while the pane is visible", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_index_status: "indexing" }),
      input({ index_status: "completed" }),
    );

    expect(result.reload).toBe(true);
  });

  it("reloads when the open note finishes saving", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_dirty: true }),
      input({ open_note_dirty: false }),
    );

    expect(result.reload).toBe(true);
  });

  it("does not treat switching away from a dirty note as a save", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_dirty: true, last_note_path: "a.md" }),
      input({ open_note_dirty: false, open_note_path: "b.md" }),
    );

    expect(result.reload).toBe(false);
  });

  it("reloads when a draft is saved under its new path", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_dirty: true, last_note_path: "draft:1:Untitled" }),
      input({ open_note_dirty: false, open_note_path: "ideas.md" }),
    );

    expect(result.reload).toBe(true);
  });

  it("ignores index and save changes while the pane is hidden", () => {
    const result = resolve_tag_pane_sync_decision(
      state({
        last_pane_visible: false,
        last_index_status: "indexing",
        last_note_dirty: true,
      }),
      input({ pane_visible: false }),
    );

    expect(result.reload).toBe(false);
  });

  it("clears and reloads on a vault switch while the pane is visible", () => {
    const result = resolve_tag_pane_sync_decision(
      state(),
      input({ vault_id: "vault-2" }),
    );

    expect(result.clear).toBe(true);
    expect(result.reload).toBe(true);
  });

  it("clears without reloading when the vault closes", () => {
    const result = resolve_tag_pane_sync_decision(
      state(),
      input({ vault_id: null }),
    );

    expect(result.clear).toBe(true);
    expect(result.reload).toBe(false);
  });
});

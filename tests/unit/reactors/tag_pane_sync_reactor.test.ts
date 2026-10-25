import { describe, expect, it } from "vitest";
import { resolve_tag_pane_sync_decision } from "$lib/reactors/tag_pane_sync.reactor.svelte";

type IndexStatus = "idle" | "indexing" | "completed" | "failed";

function state(
  value?: Partial<{
    last_vault_id: string | null;
    last_pane_visible: boolean;
    last_index_status: IndexStatus;
    last_note_path: string | null;
    last_note_mtime_ms: number | null;
  }>,
) {
  return {
    last_vault_id: "vault-1",
    last_pane_visible: true,
    last_index_status: "completed" as IndexStatus,
    last_note_path: "a.md",
    last_note_mtime_ms: 100,
    ...value,
  };
}

function input(
  value?: Partial<{
    vault_id: string | null;
    pane_visible: boolean;
    index_status: IndexStatus;
    open_note_path: string | null;
    open_note_mtime_ms: number | null;
  }>,
) {
  return {
    vault_id: "vault-1",
    pane_visible: true,
    index_status: "completed" as IndexStatus,
    open_note_path: "a.md",
    open_note_mtime_ms: 100,
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

  it("reloads when the open note gets a new mtime from a save or an external edit", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_mtime_ms: 100 }),
      input({ open_note_mtime_ms: 250 }),
    );

    expect(result.reload).toBe(true);
  });

  it("reloads when the open note is renamed", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_path: "a.md" }),
      input({ open_note_path: "renamed.md" }),
    );

    expect(result.reload).toBe(true);
  });

  it("reloads when the open note is deleted", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_path: "a.md" }),
      input({ open_note_path: null }),
    );

    expect(result.reload).toBe(true);
  });

  it("reloads when a draft is saved under its new path", () => {
    const result = resolve_tag_pane_sync_decision(
      state({ last_note_path: "draft:1:Untitled", last_note_mtime_ms: 0 }),
      input({ open_note_path: "ideas.md", open_note_mtime_ms: 250 }),
    );

    expect(result.reload).toBe(true);
  });

  it("ignores index and save changes while the pane is hidden", () => {
    const result = resolve_tag_pane_sync_decision(
      state({
        last_pane_visible: false,
        last_index_status: "indexing",
        last_note_mtime_ms: 0,
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

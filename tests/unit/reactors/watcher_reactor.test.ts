import { describe, expect, it } from "vitest";
import { resolve_watcher_event_decision } from "$lib/reactors/watcher.reactor.svelte";
import type { VaultFsEvent } from "$lib/features/watcher";
import type { BackgroundTabInfo } from "$lib/reactors/watcher.reactor.svelte";

const VAULT_ID = "vault-1";
const NO_BG_TAB = () => null;

function changed_event(note_path: string): VaultFsEvent {
  return { type: "note_changed_externally", vault_id: VAULT_ID, note_path };
}

function added_event(note_path: string): VaultFsEvent {
  return { type: "note_added", vault_id: VAULT_ID, note_path };
}

function removed_event(note_path: string): VaultFsEvent {
  return { type: "note_removed", vault_id: VAULT_ID, note_path };
}

function asset_event(asset_path: string): VaultFsEvent {
  return { type: "asset_changed", vault_id: VAULT_ID, asset_path };
}

function bg_tab(is_dirty: boolean): () => BackgroundTabInfo {
  return () => ({ is_dirty });
}

describe("watcher_reactor", () => {
  describe("note_changed_externally", () => {
    it("reloads clean open note", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "notes/a.md",
      });
    });

    it("shows conflict toast for dirty open note", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        true,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "conflict_toast",
        note_path: "notes/a.md",
      });
    });

    it("ignores when no note is open", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });

    it("ignores when different note is open and no background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/b.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });

    it("matches paths case-insensitively", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("Notes/A.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "Notes/A.md",
      });
    });
  });

  describe("background tabs", () => {
    it("invalidates cache for clean background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(false),
      );
      expect(decision).toEqual({
        action: "invalidate_tab_cache",
        note_path: "notes/bg.md",
      });
    });

    it("shows background conflict toast for dirty background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "background_conflict_toast",
        note_path: "notes/bg.md",
      });
    });

    it("prefers active note match over background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "notes/a.md",
      });
    });

    it("ignores when no note is open and no background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/x.md"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });
  });

  describe("note_added", () => {
    it("triggers debounced tree refresh", () => {
      const decision = resolve_watcher_event_decision(
        added_event("notes/new.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "refresh_tree" });
    });
  });

  describe("note_removed", () => {
    it("clears editor and refreshes tree for open note", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "clear_and_refresh",
        note_path: "notes/a.md",
      });
    });

    it("just refreshes tree for non-open note without background tab", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/other.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "refresh_tree" });
    });

    it("removes background tab and refreshes tree for deleted background note", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(false),
      );
      expect(decision).toEqual({
        action: "remove_background_tab_and_refresh",
        note_path: "notes/bg.md",
      });
    });
  });

  describe("asset_changed", () => {
    it("returns log_only", () => {
      const decision = resolve_watcher_event_decision(
        asset_event(".assets/img.png"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "log_only",
        path: ".assets/img.png",
      });
    });
  });

  describe("stale vault_id", () => {
    it("ignores events from different vault", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        "other-vault",
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });

    it("ignores when no vault is active", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        null,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });
  });
});

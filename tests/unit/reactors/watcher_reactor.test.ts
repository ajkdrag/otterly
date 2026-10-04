import { describe, expect, it, vi } from "vitest";
import {
  create_watcher_reactor,
  resolve_watcher_event_decision,
} from "$lib/reactors/watcher.reactor.svelte";
import type { VaultFsEvent } from "$lib/features/watcher";
import { WatcherService } from "$lib/features/watcher/application/watcher_service";
import type { BackgroundTabInfo } from "$lib/reactors/watcher.reactor.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_mock_watcher_port } from "../helpers/mock_ports";
import { create_test_vault } from "../helpers/test_fixtures";

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

function bg_tab(is_dirty: boolean): () => BackgroundTabInfo {
  return () => ({ is_dirty });
}

async function flush_effects() {
  await Promise.resolve();
  await Promise.resolve();
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

    it("marks conflict for dirty open note", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        true,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "mark_conflict",
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

    it("marks conflict for dirty background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "mark_conflict",
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

  it("ignores repeated self-write events while suppression is active", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };

    vault_store.set_vault(create_test_vault());
    editor_store.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a",
        title: "A",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("# A"),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/a.md");
    watcher_port._emit(changed_event("notes/a.md"));
    watcher_port._emit(changed_event("notes/a.md"));

    await flush_effects();

    expect(note_service.open_note).not.toHaveBeenCalled();
    expect(tab_service.mark_conflict).not.toHaveBeenCalled();

    unmount();
  });

  it("ignores suppressed note_added events", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };

    vault_store.set_vault(create_test_vault());

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/new.md");
    watcher_port._emit(added_event("notes/new.md"));

    await flush_effects();

    expect(action_registry.execute).not.toHaveBeenCalled();

    unmount();
  });

  it("ignores suppressed note_removed events", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };

    vault_store.set_vault(create_test_vault());

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/deleted.md");
    watcher_port._emit(removed_event("notes/deleted.md"));

    await flush_effects();

    expect(action_registry.execute).not.toHaveBeenCalled();
    expect(note_service.clear_open_note).not.toHaveBeenCalled();
    expect(tab_service.remove_tab).not.toHaveBeenCalled();

    unmount();
  });
});

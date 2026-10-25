import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { is_valid_hotkey } from "$lib/features/hotkey";
import type { HotkeyCategory } from "$lib/features/hotkey";

describe("DEFAULT_HOTKEYS", () => {
  it("has at least 15 default bindings", () => {
    expect(DEFAULT_HOTKEYS.length).toBeGreaterThanOrEqual(15);
  });

  it("all default hotkeys are valid", () => {
    for (const binding of DEFAULT_HOTKEYS) {
      expect(binding.key).not.toBeNull();
      if (binding.key === null) continue;
      const result = is_valid_hotkey(binding.key);
      expect(result.valid, `${binding.label} (${binding.key})`).toBe(true);
    }
  });

  it("all bindings have required fields", () => {
    for (const binding of DEFAULT_HOTKEYS) {
      expect(binding.action_id).toBeTruthy();
      expect(binding.key).toBeTruthy();
      expect(binding.label).toBeTruthy();
      expect(binding.description).toBeTruthy();
      expect(binding.phase).toMatch(/^(capture|bubble)$/);
      expect(binding.category).toBeTruthy();
    }
  });

  it("has no duplicate action_id entries for same key", () => {
    const key_phase_pairs = new Set<string>();
    for (const binding of DEFAULT_HOTKEYS) {
      if (binding.key === null) continue;
      const pair = `${binding.key}:${binding.phase}`;
      expect(key_phase_pairs.has(pair), `Duplicate key+phase: ${pair}`).toBe(
        false,
      );
      key_phase_pairs.add(pair);
    }
  });

  it("covers expected categories", () => {
    const categories = new Set(DEFAULT_HOTKEYS.map((b) => b.category));
    const expected: HotkeyCategory[] = [
      "general",
      "navigation",
      "tabs",
      "editing",
    ];
    for (const cat of expected) {
      expect(categories.has(cat), `Missing category: ${cat}`).toBe(true);
    }
  });

  it("has no duplicate action_ids", () => {
    const seen = new Set<string>();
    for (const binding of DEFAULT_HOTKEYS) {
      expect(
        seen.has(binding.action_id),
        `Duplicate action_id: ${binding.action_id} ("${binding.label}")`,
      ).toBe(false);
      seen.add(binding.action_id);
    }
  });

  it("includes essential shortcuts", () => {
    const action_ids = new Set(DEFAULT_HOTKEYS.map((b) => b.action_id));
    expect(action_ids.has("note.request_save")).toBe(true);
    expect(action_ids.has("omnibar.toggle")).toBe(true);
    expect(action_ids.has("omnibar.open")).toBe(true);
    expect(action_ids.has("omnibar.open_all_vaults")).toBe(true);
    expect(action_ids.has("ui.toggle_sidebar")).toBe(true);
    expect(action_ids.has("tab.close")).toBe(true);
    expect(action_ids.has("find_in_file.toggle")).toBe(true);
  });

  it("binds find in vault to Cmd+Shift+F and moves all-vault search off it", () => {
    const key_of = (action_id: string) =>
      DEFAULT_HOTKEYS.find((b) => b.action_id === action_id)?.key;
    expect(key_of("omnibar.open_find")).toBe("CmdOrCtrl+Shift+F");
    expect(key_of("omnibar.open_all_vaults")).toBe("CmdOrCtrl+Alt+Shift+F");
    expect(key_of("find_in_file.toggle_replace")).toBe("CmdOrCtrl+Alt+F");
  });

  it("defaults are loaded on first launch (no overrides)", () => {
    expect(DEFAULT_HOTKEYS.length).toBeGreaterThan(0);
    const save = DEFAULT_HOTKEYS.find(
      (b) => b.action_id === "note.request_save",
    );
    expect(save?.key).toBe("CmdOrCtrl+S");
  });
});

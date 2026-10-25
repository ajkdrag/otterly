import { describe, expect, it } from "vitest";
import {
  resolve_window_title,
  create_window_title_reactor,
} from "$lib/reactors/window_title.reactor.svelte";
import type { Vault } from "$lib/shared/types/vault";
import type { Tab } from "$lib/features/tab";
import {
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";

function mock_vault(name: string): Vault {
  return {
    id: as_vault_id(name),
    path: as_vault_path(`/vaults/${name}`),
    name,
    created_at: 0,
  };
}

function mock_tab(title: string, is_dirty = false): Tab {
  return {
    id: title,
    note_path: as_note_path(`${title}.md`),
    title,
    is_pinned: false,
    is_dirty,
  };
}

describe("window_title.reactor", () => {
  describe("resolve_window_title", () => {
    it("returns app name when no vault is open", () => {
      expect(resolve_window_title(null, null)).toBe("otterly");
    });

    it("returns app name when no vault is open even with active tab", () => {
      expect(resolve_window_title(null, mock_tab("notes"))).toBe("otterly");
    });

    it("returns vault name when vault is open but no note", () => {
      expect(resolve_window_title(mock_vault("My Notes"), null)).toBe(
        "My Notes",
      );
    });

    it("returns note title and vault name when note is open", () => {
      expect(
        resolve_window_title(mock_vault("My Notes"), mock_tab("hello")),
      ).toBe("hello — My Notes");
    });

    it("prefixes with dirty indicator when note has unsaved changes", () => {
      expect(
        resolve_window_title(mock_vault("My Notes"), mock_tab("hello", true)),
      ).toBe("∘ hello — My Notes");
    });

    it("has no dirty indicator when note is clean", () => {
      expect(
        resolve_window_title(mock_vault("My Notes"), mock_tab("hello", false)),
      ).toBe("hello — My Notes");
    });
  });

  it("returns a cleanup function", () => {
    const unmount = create_window_title_reactor(
      { vault: null } as never,
      { active_tab: null } as never,
      () => {},
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});

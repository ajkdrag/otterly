import { describe, expect, test } from "vitest";
import {
  ensure_open_note,
  create_untitled_open_note,
} from "$lib/features/note";
import type { Vault } from "$lib/shared/types/vault";
import type { VaultId, VaultPath, NotePath } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_note_path, as_markdown_text } from "$lib/shared/types/ids";

describe("ensure_open_note", () => {
  test("does nothing without vault", () => {
    const result = ensure_open_note({
      vault: null as Vault | null,
      open_titles: [],
      open_note: null as OpenNoteState | null,
      now_ms: 123,
    });

    expect(result).toBe(null);
  });

  test("creates a draft Untitled-1 note when vault exists and open_note missing", () => {
    const vault: Vault = {
      id: "v" as VaultId,
      name: "Vault",
      path: "/vault" as VaultPath,
      created_at: 0,
    };

    const result = ensure_open_note({
      vault,
      open_titles: [],
      open_note: null as OpenNoteState | null,
      now_ms: 1000,
    });

    expect(result?.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
    expect(result?.meta.title).toBe("Untitled-1");
    expect(result?.is_dirty).toBe(true);
    expect(result?.markdown).toBe(as_markdown_text(""));
  });

  test("creates next Untitled-N avoiding existing open titles", () => {
    const vault: Vault = {
      id: "v" as VaultId,
      name: "Vault",
      path: "/vault" as VaultPath,
      created_at: 0,
    };

    const result = ensure_open_note({
      vault,
      open_titles: ["Untitled-2", "welcome"],
      open_note: null as OpenNoteState | null,
      now_ms: 1000,
    });

    expect(result?.meta.path).toBe(as_note_path("draft:1000:Untitled-3"));
    expect(result?.meta.title).toBe("Untitled-3");
  });

  test("does not overwrite existing open_note", () => {
    const vault: Vault = {
      id: "v" as VaultId,
      name: "Vault",
      path: "/vault" as VaultPath,
      created_at: 0,
    };

    const existing: OpenNoteState = {
      meta: {
        id: as_note_path("welcome.md"),
        path: as_note_path("welcome.md"),
        name: "welcome",
        title: "Welcome",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("hello"),
      buffer_id: "welcome-buffer",
      is_dirty: false,
    };

    const result = ensure_open_note({
      vault,
      open_titles: [],
      open_note: existing,
      now_ms: 1000,
    });

    expect(result).toBe(existing);
  });
});

describe("create_untitled_open_note", () => {
  test("creates Untitled-1 when no open titles exist", () => {
    const result = create_untitled_open_note({
      open_titles: [],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
    expect(result.meta.title).toBe("Untitled-1");
    expect(result.is_dirty).toBe(true);
    expect(result.markdown).toBe(as_markdown_text(""));
  });

  test("creates Untitled-2 when Untitled-1 is open", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-2" as NotePath);
    expect(result.meta.title).toBe("Untitled-2");
  });

  test("picks max+1 without gap-filling", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1", "Untitled-3"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-4" as NotePath);
    expect(result.meta.title).toBe("Untitled-4");
  });

  test("ignores non-untitled names", () => {
    const result = create_untitled_open_note({
      open_titles: ["foo", "bar", "welcome"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
  });

  test("ignores names that partially match untitled pattern", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1-draft", "My-Untitled-2", "Untitled-abc"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
  });
});

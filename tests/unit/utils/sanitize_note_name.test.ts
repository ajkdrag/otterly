import { describe, it, expect } from "vitest";
import { sanitize_note_name } from "$lib/features/note/domain/sanitize_note_name";

describe("sanitize_note_name", () => {
  it("returns Untitled.md for empty input", () => {
    expect(sanitize_note_name("")).toBe("Untitled.md");
    expect(sanitize_note_name("   ")).toBe("Untitled.md");
  });

  it("trims whitespace", () => {
    expect(sanitize_note_name("  my-note  ")).toBe("my-note.md");
  });

  it("replaces slashes with dashes", () => {
    expect(sanitize_note_name("foo/bar")).toBe("foo-bar.md");
    expect(sanitize_note_name("a/b/c")).toBe("a-b-c.md");
  });

  it("replaces leading dot with underscore", () => {
    expect(sanitize_note_name(".hidden")).toBe("_hidden.md");
    expect(sanitize_note_name(".gitignore")).toBe("_gitignore.md");
  });

  it("truncates to max length", () => {
    const long_name = "a".repeat(250);
    const result = sanitize_note_name(long_name);
    expect(result.length).toBeLessThanOrEqual(203);
  });

  it("appends underscore to Windows reserved names", () => {
    expect(sanitize_note_name("con")).toBe("con_.md");
    expect(sanitize_note_name("PRN")).toBe("PRN_.md");
    expect(sanitize_note_name("aux")).toBe("aux_.md");
    expect(sanitize_note_name("nul")).toBe("nul_.md");
    expect(sanitize_note_name("com1")).toBe("com1_.md");
    expect(sanitize_note_name("lpt1")).toBe("lpt1_.md");
  });

  it("adds .md extension if missing", () => {
    expect(sanitize_note_name("my-note")).toBe("my-note.md");
  });

  it("strips any existing extension and adds .md", () => {
    expect(sanitize_note_name("my-note.txt")).toBe("my-note.md");
    expect(sanitize_note_name("my-note.md")).toBe("my-note.md");
    expect(sanitize_note_name("my-note.MD")).toBe("my-note.md");
  });
});

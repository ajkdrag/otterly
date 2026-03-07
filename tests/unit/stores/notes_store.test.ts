import { describe, expect, it } from "vitest";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import type { FolderContents } from "$lib/shared/types/filetree";

function note(path: string): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    mtime_ms: 0,
    size_bytes: 0,
  };
}

function folder_contents(
  notes: NoteMeta[],
  subfolders: string[],
): FolderContents {
  return {
    notes,
    subfolders,
    files: [],
    total_count: notes.length + subfolders.length,
    has_more: false,
  };
}

describe("NotesStore.merge_folder_contents", () => {
  it("adds notes and folders on first load", () => {
    const store = new NotesStore();

    store.merge_folder_contents(
      "",
      folder_contents([note("readme.md")], ["docs", "tests"]),
    );

    expect(store.notes.map((n) => n.path)).toEqual(["readme.md"]);
    expect(store.folder_paths).toEqual(["docs", "tests"]);
  });

  it("removes stale root-level folders on refresh", () => {
    const store = new NotesStore();

    store.merge_folder_contents("", folder_contents([], ["old_folder"]));
    expect(store.folder_paths).toEqual(["old_folder"]);

    store.merge_folder_contents("", folder_contents([], ["new_folder"]));
    expect(store.folder_paths).toEqual(["new_folder"]);
  });

  it("removes stale descendants when parent folder disappears", () => {
    const store = new NotesStore();

    store.merge_folder_contents("", folder_contents([], ["sss"]));
    store.merge_folder_contents(
      "sss",
      folder_contents([note("sss/note.md")], ["sss/deep"]),
    );

    expect(store.folder_paths).toEqual(["sss", "sss/deep"]);
    expect(store.notes.map((n) => n.path)).toEqual(["sss/note.md"]);

    store.merge_folder_contents("", folder_contents([], ["ddd"]));

    expect(store.folder_paths).toEqual(["ddd"]);
    expect(store.notes).toEqual([]);
  });

  it("preserves entries from unrelated folders", () => {
    const store = new NotesStore();

    store.merge_folder_contents(
      "",
      folder_contents([note("root.md")], ["alpha", "beta"]),
    );
    store.merge_folder_contents(
      "alpha",
      folder_contents([note("alpha/note.md")], []),
    );

    store.merge_folder_contents(
      "",
      folder_contents([note("root.md")], ["alpha", "gamma"]),
    );

    expect(store.folder_paths).toEqual(["alpha", "gamma"]);
    expect(store.notes.map((n) => n.path)).toEqual([
      "alpha/note.md",
      "root.md",
    ]);
  });

  it("updates existing notes with fresh metadata", () => {
    const store = new NotesStore();

    store.merge_folder_contents(
      "",
      folder_contents([{ ...note("readme.md"), mtime_ms: 100 }], []),
    );

    store.merge_folder_contents(
      "",
      folder_contents([{ ...note("readme.md"), mtime_ms: 200 }], []),
    );

    expect(store.notes).toHaveLength(1);
    expect(store.notes[0]?.mtime_ms).toBe(200);
  });

  it("removes stale notes that are direct children of loaded folder", () => {
    const store = new NotesStore();

    store.merge_folder_contents(
      "docs",
      folder_contents([note("docs/old.md"), note("docs/keep.md")], []),
    );

    store.merge_folder_contents(
      "docs",
      folder_contents([note("docs/keep.md")], []),
    );

    expect(store.notes.map((n) => n.path)).toEqual(["docs/keep.md"]);
  });

  it("handles nested folder refresh correctly", () => {
    const store = new NotesStore();

    store.merge_folder_contents("", folder_contents([], ["a"]));
    store.merge_folder_contents("a", folder_contents([], ["a/b", "a/c"]));
    store.merge_folder_contents(
      "a/b",
      folder_contents([note("a/b/note.md")], []),
    );

    store.merge_folder_contents("a", folder_contents([], ["a/c", "a/d"]));

    expect(store.folder_paths).toEqual(["a", "a/c", "a/d"]);
    expect(store.notes).toEqual([]);
  });

  it("includes folder_path itself in folder_paths", () => {
    const store = new NotesStore();

    store.merge_folder_contents("sub", folder_contents([], ["sub/child"]));

    expect(store.folder_paths).toContain("sub");
    expect(store.folder_paths).toContain("sub/child");
  });
});

describe("NotesStore.append_folder_page", () => {
  it("appends additional items without removing prior page data", () => {
    const store = new NotesStore();

    store.append_folder_page("", {
      notes: [note("b.md")],
      subfolders: ["alpha"],
      files: [],
      total_count: 4,
      has_more: true,
    });

    store.append_folder_page("", {
      notes: [note("c.md")],
      subfolders: ["beta"],
      files: [],
      total_count: 4,
      has_more: false,
    });

    expect(store.notes.map((entry) => entry.path)).toEqual(["b.md", "c.md"]);
    expect(store.folder_paths).toEqual(["alpha", "beta"]);
  });

  it("deduplicates repeated items across pages", () => {
    const store = new NotesStore();

    store.append_folder_page("", {
      notes: [note("b.md")],
      subfolders: ["alpha"],
      files: [],
      total_count: 3,
      has_more: true,
    });

    store.append_folder_page("", {
      notes: [note("b.md")],
      subfolders: ["alpha"],
      files: [],
      total_count: 3,
      has_more: false,
    });

    expect(store.notes.map((entry) => entry.path)).toEqual(["b.md"]);
    expect(store.folder_paths).toEqual(["alpha"]);
  });
});

describe("NotesStore recent notes", () => {
  it("adds recent notes with deduplication and cap", () => {
    const store = new NotesStore();

    store.add_recent_note(note("a.md"));
    store.add_recent_note(note("b.md"));
    store.add_recent_note(note("a.md"));

    expect(store.recent_notes.map((entry) => entry.id)).toEqual([
      "a.md",
      "b.md",
    ]);

    for (let i = 0; i < 12; i++) {
      store.add_recent_note(note(`note-${String(i)}.md`));
    }

    expect(store.recent_notes).toHaveLength(10);
    expect(store.recent_notes[0]?.id).toBe("note-11.md");
  });

  it("deduplicates recent notes case-insensitively", () => {
    const store = new NotesStore();

    store.add_recent_note(note("docs/alpha.md"));
    store.add_recent_note(note("docs/beta.md"));
    store.add_recent_note(note("DOCS/ALPHA.md"));

    expect(store.recent_notes.map((entry) => entry.id)).toEqual([
      "DOCS/ALPHA.md",
      "docs/beta.md",
    ]);
  });

  it("removes recent notes by id", () => {
    const store = new NotesStore();

    store.add_recent_note(note("a.md"));
    store.add_recent_note(note("b.md"));
    store.remove_recent_note("a.md" as NoteId);

    expect(store.recent_notes.map((entry) => entry.id)).toEqual(["b.md"]);
  });

  it("renames recent notes without reordering", () => {
    const store = new NotesStore();

    store.add_recent_note(note("a.md"));
    store.add_recent_note(note("b.md"));
    store.add_recent_note(note("c.md"));

    store.rename_recent_note("b.md" as NoteId, note("renamed.md"));

    expect(store.recent_notes.map((entry) => entry.id)).toEqual([
      "c.md",
      "renamed.md",
      "a.md",
    ]);
  });

  it("renames recent notes case-insensitively", () => {
    const store = new NotesStore();

    store.add_recent_note(note("docs/alpha.md"));
    store.add_recent_note(note("docs/beta.md"));

    store.rename_recent_note(
      "DOCS/ALPHA.md" as NoteId,
      note("docs/RENAMED.md"),
    );

    expect(store.recent_notes.map((entry) => entry.id)).toEqual([
      "docs/beta.md",
      "docs/RENAMED.md",
    ]);
  });

  it("updates recent notes when a folder path prefix changes", () => {
    const store = new NotesStore();

    store.add_recent_note(note("docs/a.md"));
    store.add_recent_note(note("docs/b.md"));
    store.add_recent_note(note("misc/c.md"));

    store.update_recent_note_path_prefix("docs/", "archive/");

    expect(store.recent_notes.map((entry) => entry.path)).toEqual([
      "misc/c.md",
      "archive/b.md",
      "archive/a.md",
    ]);
  });

  it("remove_recent_notes_by_prefix filters matching notes in one pass", () => {
    const store = new NotesStore();
    store.add_recent_note(note("docs/a.md"));
    store.add_recent_note(note("docs/sub/b.md"));
    store.add_recent_note(note("misc/c.md"));

    store.remove_recent_notes_by_prefix("docs/");

    expect(store.recent_notes.map((entry) => entry.path)).toEqual([
      "misc/c.md",
    ]);
  });

  it("remove_recent_notes_by_prefix is a no-op when prefix matches nothing", () => {
    const store = new NotesStore();
    store.add_recent_note(note("misc/a.md"));
    store.add_recent_note(note("misc/b.md"));

    store.remove_recent_notes_by_prefix("docs/");

    expect(store.recent_notes).toHaveLength(2);
  });
});

describe("NotesStore starred paths", () => {
  it("toggles starred paths with normalization and dedupe", () => {
    const store = new NotesStore();

    store.set_starred_paths(["docs", "docs", " docs/guide.md ", ""]);
    expect(store.starred_paths).toEqual(["docs", "docs/guide.md"]);

    store.toggle_star_path("docs");
    expect(store.starred_paths).toEqual(["docs/guide.md"]);

    store.toggle_star_path(" docs ");
    expect(store.starred_paths).toEqual(["docs/guide.md", "docs"]);
  });

  it("deduplicates starred paths case-insensitively", () => {
    const store = new NotesStore();

    store.set_starred_paths(["Docs", "DOCS", "docs/guide.md"]);
    expect(store.starred_paths).toEqual(["Docs", "docs/guide.md"]);
  });

  it("checks starred paths case-insensitively", () => {
    const store = new NotesStore();

    store.set_starred_paths(["docs/guide.md"]);

    expect(store.is_starred_path("docs/guide.md")).toBe(true);
    expect(store.is_starred_path("DOCS/GUIDE.md")).toBe(true);
    expect(store.is_starred_path("Docs/Guide.md")).toBe(true);
    expect(store.is_starred_path("docs/other.md")).toBe(false);
  });

  it("toggles starred paths case-insensitively", () => {
    const store = new NotesStore();

    store.toggle_star_path("docs/guide.md");
    expect(store.starred_paths).toEqual(["docs/guide.md"]);

    store.toggle_star_path("DOCS/GUIDE.md");
    expect(store.starred_paths).toEqual([]);

    store.toggle_star_path("Docs/Guide.md");
    expect(store.starred_paths).toEqual(["Docs/Guide.md"]);
  });

  it("updates starred paths when note is renamed or deleted", () => {
    const store = new NotesStore();
    store.set_notes([note("docs/guide.md")]);
    store.set_starred_paths(["docs/guide.md"]);

    store.rename_note("docs/guide.md" as NotePath, "docs/new.md" as NotePath);
    expect(store.starred_paths).toEqual(["docs/new.md"]);

    store.remove_note("docs/new.md" as NoteId);
    expect(store.starred_paths).toEqual([]);
  });

  it("updates starred descendants for folder rename and delete", () => {
    const store = new NotesStore();
    store.set_folder_paths(["docs", "docs/sub"]);
    store.set_notes([note("docs/readme.md"), note("docs/sub/guide.md")]);
    store.set_starred_paths(["docs", "docs/sub/guide.md", "misc.md"]);

    store.rename_folder("docs", "archive");
    expect(store.starred_paths).toEqual([
      "archive",
      "archive/sub/guide.md",
      "misc.md",
    ]);

    store.remove_folder("archive");
    expect(store.starred_paths).toEqual(["misc.md"]);
  });
});

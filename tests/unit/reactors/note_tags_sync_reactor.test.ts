/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TagsService } from "$lib/features/tags/application/tags_service";
import { TagsStore } from "$lib/features/tags/state/tags_store.svelte";
import type { TagsPort } from "$lib/features/tags/ports";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_note_tags_sync_reactor } from "$lib/reactors/note_tags_sync.reactor.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function open_file(editor: EditorStore, path: string, markdown: string) {
  const meta = { ...create_test_note(path, path), path: as_note_path(path) };
  editor.set_open_note(create_open_note_state(meta, markdown));
}

function create_reactor_setup() {
  const ui = new UIStore();
  ui.context_rail_open = true;
  const editor = new EditorStore();
  const extract_note_tags = vi.fn().mockResolvedValue(["work"]);
  const tags_port: TagsPort = {
    list_tags: vi.fn().mockResolvedValue([]),
    suggest_tags: vi.fn().mockResolvedValue([]),
    search_tagged_notes: vi.fn(),
    extract_note_tags,
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const tags_store = new TagsStore();
  const service = new TagsService(tags_port, vault_store, tags_store);
  cleanups.push(create_note_tags_sync_reactor(editor, ui, service));
  return { editor, tags_store, extract_note_tags };
}

describe("note tags sync reactor", () => {
  it("clears the chips and skips the parser for a file that is not Markdown", async () => {
    const { editor, tags_store, extract_note_tags } = create_reactor_setup();

    open_file(editor, "a.md", "#work");
    await tick();
    await vi.waitFor(() => {
      expect(tags_store.tags_for_note("a.md")).toEqual(["work"]);
    });

    open_file(editor, "style.css", "#header { color: #fff; }");
    await tick();

    expect(tags_store.note_tags_path).toBeNull();
    expect(tags_store.tags_for_note("style.css")).toEqual([]);
    expect(extract_note_tags).toHaveBeenCalledTimes(1);
  });

  it("still recomputes after a save changes the mtime inside the debounce window", async () => {
    vi.useFakeTimers();
    try {
      const { editor, extract_note_tags } = create_reactor_setup();

      open_file(editor, "a.md", "#work");
      await tick();
      expect(extract_note_tags).toHaveBeenCalledTimes(1);

      open_file(editor, "a.md", "#work #more");
      await tick();
      editor.update_mtime(as_note_path("a.md"), 500);
      await tick();
      await vi.advanceTimersByTimeAsync(1000);

      expect(extract_note_tags).toHaveBeenCalledTimes(2);
      expect(extract_note_tags).toHaveBeenLastCalledWith("#work #more");
    } finally {
      vi.useRealTimers();
    }
  });
});

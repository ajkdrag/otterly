import { describe, expect, it } from "vitest";
import { TabService } from "$lib/features/tab/application/tab_service";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

function create_setup() {
  const tab_store = new TabStore();
  const service = new TabService(tab_store);

  return {
    service,
    tab_store,
  };
}

describe("TabService", () => {
  it("delegates dirty state updates to the tab store", () => {
    const { service, tab_store } = create_setup();
    const note_path = as_note_path("docs/alpha.md");
    tab_store.open_tab(note_path, "alpha");

    service.sync_dirty_state(note_path, true);

    expect(tab_store.find_tab_by_path(note_path)?.is_dirty).toBe(true);
  });

  it("clears conflicts when a tab becomes clean", () => {
    const { service, tab_store } = create_setup();
    const note_path = as_note_path("docs/alpha.md");
    tab_store.open_tab(note_path, "alpha");
    tab_store.set_dirty(note_path, true);
    tab_store.mark_conflict(note_path);

    service.sync_dirty_state(note_path, false);

    expect(tab_store.has_conflict(note_path)).toBe(false);
  });

  it("marks and clears conflicts through the tab store", () => {
    const { service, tab_store } = create_setup();
    const note_path = as_note_path("docs/alpha.md");

    service.mark_conflict(note_path);
    expect(tab_store.has_conflict(note_path)).toBe(true);
    expect(service.has_conflict(note_path)).toBe(true);

    service.clear_conflict(note_path);
    expect(tab_store.has_conflict(note_path)).toBe(false);
    expect(service.has_conflict(note_path)).toBe(false);
  });

  it("invalidates cached note state for a path", () => {
    const { service, tab_store } = create_setup();
    const note_path = as_note_path("docs/alpha.md");
    tab_store.open_tab(note_path, "alpha");
    tab_store.set_cached_note(note_path, {
      meta: {
        id: note_path,
        path: note_path,
        name: "alpha.md",
        title: "alpha",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text(""),
      buffer_id: note_path,
      is_dirty: false,
    });

    service.invalidate_cache(note_path);

    expect(tab_store.get_cached_note(note_path)).toBeNull();
  });

  it("removes a tab by note path", () => {
    const { service, tab_store } = create_setup();
    const note_path = as_note_path("docs/alpha.md");
    tab_store.open_tab(note_path, "alpha");

    service.remove_tab(note_path);

    expect(tab_store.tabs).toEqual([]);
  });
});

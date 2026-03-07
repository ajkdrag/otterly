import { describe, expect, it } from "vitest";
import { DocumentStore } from "$lib/features/document/state/document_store.svelte";
import type { DocumentViewerState } from "$lib/features/document/state/document_store.svelte";

function make_state(tab_id: string): DocumentViewerState {
  return {
    tab_id,
    file_path: `vault/docs/${tab_id}.pdf`,
    file_type: "pdf",
    zoom: 1,
    scroll_top: 0,
    pdf_page: 1,
    content: null,
    asset_url: null,
  };
}

describe("DocumentStore", () => {
  it("sets and gets viewer state", () => {
    const store = new DocumentStore();
    const state = make_state("tab-1");
    store.set_viewer_state("tab-1", state);
    expect(store.get_viewer_state("tab-1")).toEqual(state);
  });

  it("removes viewer state", () => {
    const store = new DocumentStore();
    store.set_viewer_state("tab-1", make_state("tab-1"));
    store.remove_viewer_state("tab-1");
    expect(store.get_viewer_state("tab-1")).toBeUndefined();
  });

  it("updates zoom for existing tab", () => {
    const store = new DocumentStore();
    store.set_viewer_state("tab-1", make_state("tab-1"));
    store.update_zoom("tab-1", 1.5);
    expect(store.get_viewer_state("tab-1")?.zoom).toBe(1.5);
  });

  it("updates scroll_top for existing tab", () => {
    const store = new DocumentStore();
    store.set_viewer_state("tab-1", make_state("tab-1"));
    store.update_scroll("tab-1", 200);
    expect(store.get_viewer_state("tab-1")?.scroll_top).toBe(200);
  });

  it("updates pdf_page for existing tab", () => {
    const store = new DocumentStore();
    store.set_viewer_state("tab-1", make_state("tab-1"));
    store.update_pdf_page("tab-1", 5);
    expect(store.get_viewer_state("tab-1")?.pdf_page).toBe(5);
  });

  it("returns undefined for non-existent tab", () => {
    const store = new DocumentStore();
    expect(store.get_viewer_state("ghost-tab")).toBeUndefined();
  });

  it("update_zoom is a no-op for non-existent tab", () => {
    const store = new DocumentStore();
    expect(() => {
      store.update_zoom("ghost", 2);
    }).not.toThrow();
    expect(store.viewer_states.size).toBe(0);
  });

  it("update_scroll is a no-op for non-existent tab", () => {
    const store = new DocumentStore();
    expect(() => {
      store.update_scroll("ghost", 100);
    }).not.toThrow();
    expect(store.viewer_states.size).toBe(0);
  });

  it("update_pdf_page is a no-op for non-existent tab", () => {
    const store = new DocumentStore();
    expect(() => {
      store.update_pdf_page("ghost", 3);
    }).not.toThrow();
    expect(store.viewer_states.size).toBe(0);
  });
});

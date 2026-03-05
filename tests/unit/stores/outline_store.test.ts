import { describe, expect, it } from "vitest";
import { OutlineStore } from "$lib/features/outline";
import type { OutlineHeading } from "$lib/features/outline";

function heading(level: number, text: string, pos: number): OutlineHeading {
  return { id: `h-${String(pos)}`, level, text, pos };
}

describe("OutlineStore", () => {
  it("starts empty", () => {
    const store = new OutlineStore();
    expect(store.headings).toEqual([]);
    expect(store.active_heading_id).toBeNull();
    expect(store.collapsed_ids.size).toBe(0);
  });

  it("sets headings", () => {
    const store = new OutlineStore();
    const headings = [heading(1, "Title", 0), heading(2, "Section", 10)];
    store.set_headings(headings);
    expect(store.headings).toEqual(headings);
  });

  it("prunes stale collapsed IDs on set_headings", () => {
    const store = new OutlineStore();
    store.set_headings([heading(1, "A", 0), heading(2, "B", 10)]);
    store.toggle_collapsed("h-0");
    store.toggle_collapsed("h-10");
    expect(store.collapsed_ids.size).toBe(2);

    store.set_headings([heading(1, "A", 0), heading(2, "C", 20)]);
    expect(store.collapsed_ids.has("h-0")).toBe(true);
    expect(store.collapsed_ids.has("h-10")).toBe(false);
    expect(store.collapsed_ids.size).toBe(1);
  });

  it("sets active heading", () => {
    const store = new OutlineStore();
    store.set_active_heading("h-5");
    expect(store.active_heading_id).toBe("h-5");
  });

  it("sets active heading to null", () => {
    const store = new OutlineStore();
    store.set_active_heading("h-5");
    store.set_active_heading(null);
    expect(store.active_heading_id).toBeNull();
  });

  it("toggles collapsed state", () => {
    const store = new OutlineStore();
    expect(store.collapsed_ids.has("h-0")).toBe(false);

    store.toggle_collapsed("h-0");
    expect(store.collapsed_ids.has("h-0")).toBe(true);

    store.toggle_collapsed("h-0");
    expect(store.collapsed_ids.has("h-0")).toBe(false);
  });

  it("clears all state", () => {
    const store = new OutlineStore();
    store.set_headings([heading(1, "Title", 0)]);
    store.set_active_heading("h-0");
    store.toggle_collapsed("h-0");

    store.clear();

    expect(store.headings).toEqual([]);
    expect(store.active_heading_id).toBeNull();
    expect(store.collapsed_ids.size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app";
import { create_editor_zoom_reactor } from "$lib/reactors/editor_zoom.reactor.svelte";

describe("editor_zoom.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_editor_zoom_reactor(new UIStore());

    expect(typeof unmount).toBe("function");

    unmount();
  });
});

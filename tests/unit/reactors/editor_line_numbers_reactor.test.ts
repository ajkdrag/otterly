/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app";
import { create_editor_line_numbers_reactor } from "$lib/reactors/editor_line_numbers.reactor.svelte";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.documentElement.style.removeProperty("--editor-gutter-display");
});

function gutter_display(): string {
  return document.documentElement.style.getPropertyValue(
    "--editor-gutter-display",
  );
}

describe("editor_line_numbers.reactor", () => {
  it("shows the gutter only while line numbers are on", async () => {
    const ui = new UIStore();
    cleanups.push(create_editor_line_numbers_reactor(ui));
    await tick();
    expect(gutter_display()).toBe("none");

    ui.set_editor_settings({
      ...ui.editor_settings,
      line_numbers_enabled: true,
    });
    await tick();
    expect(gutter_display()).toBe("flex");

    ui.set_editor_settings({
      ...ui.editor_settings,
      line_numbers_enabled: false,
    });
    await tick();
    expect(gutter_display()).toBe("none");
  });
});

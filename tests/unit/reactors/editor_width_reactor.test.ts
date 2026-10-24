/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app";
import { create_editor_width_reactor } from "$lib/reactors/editor_width.reactor.svelte";
import {
  BUILTIN_NORDIC_DARK,
  create_user_theme,
} from "$lib/shared/types/theme";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.documentElement.style.removeProperty("--editor-max-width");
});

// A new effect root runs its effects on a microtask, so wait with tick().
async function mount_with_active_user_theme(theme_width_ch: number | null) {
  const ui = new UIStore();
  ui.editor_settings.editor_max_width_ch = 100;
  const theme = {
    ...create_user_theme("Wide", BUILTIN_NORDIC_DARK),
    editor_max_width_ch: theme_width_ch,
  };
  ui.set_user_themes([theme]);
  ui.set_active_theme_id(theme.id);
  cleanups.push(create_editor_width_reactor(ui));
  await tick();
  return ui;
}

function editor_max_width(): string {
  return document.documentElement.style.getPropertyValue("--editor-max-width");
}

describe("editor_width.reactor", () => {
  it("uses the width of the active theme over the Layout setting", async () => {
    await mount_with_active_user_theme(72);

    expect(editor_max_width()).toContain("72ch");
  });

  it("falls back to the Layout setting when the theme has no width", async () => {
    const ui = await mount_with_active_user_theme(null);

    expect(editor_max_width()).toContain("100ch");

    ui.editor_settings.editor_max_width_ch = 90;
    await tick();

    expect(editor_max_width()).toContain("90ch");
  });
});

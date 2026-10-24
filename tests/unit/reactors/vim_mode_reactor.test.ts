/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { ACTION_IDS, ActionRegistry, UIStore } from "$lib/app";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { create_vim_mode_reactor } from "$lib/reactors/vim_mode.reactor.svelte";

// Vitest resolves Svelte's public entry to the server build, but .svelte.ts
// stores use the client runtime. Use its dependency tracking for these effects.
vi.mock("svelte", async () => {
  const public_api = await vi.importActual<typeof import("svelte")>("svelte");
  const client = await vi.importActual<{
    untrack: (typeof import("svelte"))["untrack"];
  }>("svelte/internal/client");
  return { ...public_api, untrack: client.untrack };
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function create_reactor() {
  const ui = new UIStore();
  const target = { set_vim_enabled: vi.fn() };
  const load_vimrc = vi.fn();
  const registry = new ActionRegistry();
  registry.register({
    id: ACTION_IDS.vim_load_vimrc,
    label: "Reload vimrc",
    execute: load_vimrc,
  });
  cleanups.push(create_vim_mode_reactor(ui, target, registry));
  await tick();
  const set_vim = async (vim_mode_enabled: boolean) => {
    ui.set_editor_settings({ ...ui.editor_settings, vim_mode_enabled });
    await tick();
  };
  return { ui, target, load_vimrc, set_vim };
}

describe("vim_mode reactor", () => {
  it("turns Vim on in the editor and loads the vimrc, and loads again on window focus", async () => {
    const { target, load_vimrc, set_vim } = await create_reactor();
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(false);
    expect(load_vimrc).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    expect(load_vimrc).not.toHaveBeenCalled();

    await set_vim(true);
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(true);
    expect(load_vimrc).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    expect(load_vimrc).toHaveBeenCalledTimes(2);
  });

  it("stops watching focus when Vim turns off", async () => {
    const { target, load_vimrc, set_vim } = await create_reactor();
    await set_vim(true);
    await set_vim(false);
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(false);

    window.dispatchEvent(new Event("focus"));
    expect(load_vimrc).toHaveBeenCalledTimes(1);
  });

  it("ignores other setting changes, like zoom", async () => {
    const { ui, target, load_vimrc, set_vim } = await create_reactor();
    await set_vim(true);
    target.set_vim_enabled.mockClear();
    load_vimrc.mockClear();

    ui.set_editor_settings({
      ...ui.editor_settings,
      editor_zoom: DEFAULT_EDITOR_SETTINGS.editor_zoom + 0.1,
    });
    await tick();

    expect(target.set_vim_enabled).not.toHaveBeenCalled();
    expect(load_vimrc).not.toHaveBeenCalled();
  });
});

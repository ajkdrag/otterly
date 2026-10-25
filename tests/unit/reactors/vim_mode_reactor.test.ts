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
  const vim_service = {
    set_press_and_hold: vi.fn((_enabled: boolean) => Promise.resolve()),
    sync_clipboard: vi.fn(() => Promise.resolve()),
  };
  const load_vimrc = vi.fn();
  const registry = new ActionRegistry();
  registry.register({
    id: ACTION_IDS.vim_load_vimrc,
    label: "Reload vimrc",
    execute: load_vimrc,
  });
  const focus_listeners = new Set<() => void>();
  const focus_window = () => {
    for (const listener of focus_listeners) listener();
  };
  cleanups.push(
    create_vim_mode_reactor(ui, target, vim_service, registry, (on_focus) => {
      focus_listeners.add(on_focus);
      return () => focus_listeners.delete(on_focus);
    }),
  );
  await tick();
  const set_vim = async (vim_mode_enabled: boolean) => {
    ui.set_editor_settings({ ...ui.editor_settings, vim_mode_enabled });
    await tick();
  };
  return {
    ui,
    target,
    vim_service,
    load_vimrc,
    set_vim,
    focus_window,
    focus_listeners,
  };
}

describe("vim_mode reactor", () => {
  it("turns Vim on in the editor and loads the vimrc, and loads again on window focus", async () => {
    const { target, load_vimrc, set_vim, focus_window } =
      await create_reactor();
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(false);
    expect(load_vimrc).not.toHaveBeenCalled();
    focus_window();
    expect(load_vimrc).not.toHaveBeenCalled();

    await set_vim(true);
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(true);
    expect(load_vimrc).toHaveBeenCalledTimes(1);

    focus_window();
    expect(load_vimrc).toHaveBeenCalledTimes(2);
    expect(load_vimrc).toHaveBeenLastCalledWith({ force: false });
  });

  it("pulls the clipboard into the Vim register on window focus, while Vim is on", async () => {
    const { vim_service, set_vim, focus_window } = await create_reactor();
    focus_window();
    expect(vim_service.sync_clipboard).not.toHaveBeenCalled();

    await set_vim(true);
    focus_window();
    expect(vim_service.sync_clipboard).toHaveBeenCalledTimes(1);
  });

  it("stops watching focus when Vim turns off", async () => {
    const { target, load_vimrc, set_vim, focus_window, focus_listeners } =
      await create_reactor();
    await set_vim(true);
    expect(focus_listeners.size).toBe(1);
    await set_vim(false);
    expect(target.set_vim_enabled).toHaveBeenLastCalledWith(false);
    expect(focus_listeners.size).toBe(0);

    focus_window();
    expect(load_vimrc).toHaveBeenCalledTimes(1);
  });

  it("turns the macOS accent menu off only while Vim mode and Repeat held keys are both on", async () => {
    const { ui, vim_service, set_vim } = await create_reactor();
    const accent_menu = () => vim_service.set_press_and_hold.mock.lastCall?.[0];
    expect(accent_menu()).toBe(true);

    await set_vim(true);
    expect(accent_menu()).toBe(false);

    ui.set_editor_settings({
      ...ui.editor_settings,
      vim_repeat_held_keys: false,
    });
    await tick();
    expect(accent_menu()).toBe(true);

    ui.set_editor_settings({
      ...ui.editor_settings,
      vim_repeat_held_keys: true,
    });
    await tick();
    expect(accent_menu()).toBe(false);

    await set_vim(false);
    expect(accent_menu()).toBe(true);
  });

  it("ignores other setting changes, like zoom", async () => {
    const { ui, target, vim_service, load_vimrc, set_vim } =
      await create_reactor();
    await set_vim(true);
    target.set_vim_enabled.mockClear();
    vim_service.set_press_and_hold.mockClear();
    load_vimrc.mockClear();

    ui.set_editor_settings({
      ...ui.editor_settings,
      editor_zoom: DEFAULT_EDITOR_SETTINGS.editor_zoom + 0.1,
    });
    await tick();

    expect(target.set_vim_enabled).not.toHaveBeenCalled();
    expect(vim_service.set_press_and_hold).not.toHaveBeenCalled();
    expect(load_vimrc).not.toHaveBeenCalled();
  });
});

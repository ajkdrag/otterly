import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS, ActionRegistry } from "$lib/app";
import { create_app_settings_reload_reactor } from "$lib/reactors/app_settings_reload.reactor.svelte";

describe("app_settings_reload reactor", () => {
  it("reloads app-wide settings each time the window gains focus, until stopped", () => {
    const registry = new ActionRegistry();
    const reload = vi.fn();
    registry.register({
      id: ACTION_IDS.app_reload_app_settings,
      label: "Reload App Settings",
      execute: reload,
    });
    const focus_listeners = new Set<() => void>();
    const focus_window = () => {
      for (const listener of focus_listeners) listener();
    };

    const stop = create_app_settings_reload_reactor(registry, (on_focus) => {
      focus_listeners.add(on_focus);
      return () => focus_listeners.delete(on_focus);
    });
    expect(reload).not.toHaveBeenCalled();

    focus_window();
    focus_window();
    expect(reload).toHaveBeenCalledTimes(2);

    stop();
    focus_window();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { ThemeService } from "$lib/features/theme";
import { create_theme_file_reactor } from "$lib/reactors/theme_file.reactor.svelte";
import { create_test_theme_file_adapter } from "../../adapters/test_theme_file_adapter";

describe("theme_file.reactor", () => {
  it("reloads the theme file on each change until it is unmounted", () => {
    const port = create_test_theme_file_adapter();
    const theme_service = new ThemeService(
      { get_setting: vi.fn(), set_setting: vi.fn() },
      port,
      new OpStore(),
      () => 0,
    );
    const registry = new ActionRegistry();
    const reload_file = vi.fn();
    registry.register({
      id: ACTION_IDS.theme_reload_file,
      label: "Reload Theme File",
      execute: reload_file,
    });

    const unmount = create_theme_file_reactor(theme_service, registry);
    port._emit_change();
    port._emit_change();

    expect(reload_file).toHaveBeenCalledTimes(2);

    unmount();
    port._emit_change();

    expect(reload_file).toHaveBeenCalledTimes(2);
  });
});

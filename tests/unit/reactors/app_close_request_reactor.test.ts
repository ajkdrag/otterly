import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloseRequestedEvent } from "@tauri-apps/api/window";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import {
  create_app_close_request_reactor,
  should_intercept_close_request,
} from "$lib/reactors/app_close_request.reactor.svelte";
import { as_note_path } from "$lib/shared/types/ids";

const on_close_requested = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: on_close_requested,
  }),
}));

function get_test_window(): Window & { __TAURI__?: object } {
  const maybe_window = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis & { __TAURI__?: object };
  };
  if (!maybe_window.window) {
    maybe_window.window = globalThis as unknown as Window &
      typeof globalThis & { __TAURI__?: object };
  }
  return maybe_window.window;
}

describe("app_close_request.reactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get_test_window().__TAURI__ = {};
  });

  it("identifies when close should be intercepted", () => {
    expect(
      should_intercept_close_request({ tab_count: 1, is_quitting: false }),
    ).toBe(true);
    expect(
      should_intercept_close_request({ tab_count: 0, is_quitting: false }),
    ).toBe(false);
    expect(
      should_intercept_close_request({ tab_count: 2, is_quitting: true }),
    ).toBe(false);
  });

  it("prevents close and dispatches quit request when tabs are open", async () => {
    const registry = new ActionRegistry();
    const execute_request_quit = vi.fn().mockResolvedValue(undefined);
    const tab_store = new TabStore();
    const ui_store = new UIStore();

    tab_store.open_tab(as_note_path("docs/alpha.md"), "alpha");

    registry.register({
      id: ACTION_IDS.app_request_quit,
      label: "Request Quit",
      execute: execute_request_quit,
    });

    on_close_requested.mockImplementationOnce(async (handler) => {
      const prevent_default = vi.fn();
      await (handler as (event: CloseRequestedEvent) => Promise<void> | void)({
        preventDefault: prevent_default,
      } as unknown as CloseRequestedEvent);
      expect(prevent_default).toHaveBeenCalledTimes(1);
      return () => {};
    });

    create_app_close_request_reactor(tab_store, ui_store, registry);
    await Promise.resolve();

    expect(execute_request_quit).toHaveBeenCalledTimes(1);
  });

  it("allows close when there are no open tabs", async () => {
    const registry = new ActionRegistry();
    const execute_request_quit = vi.fn().mockResolvedValue(undefined);
    const tab_store = new TabStore();
    const ui_store = new UIStore();

    registry.register({
      id: ACTION_IDS.app_request_quit,
      label: "Request Quit",
      execute: execute_request_quit,
    });

    on_close_requested.mockImplementationOnce(async (handler) => {
      const prevent_default = vi.fn();
      await (handler as (event: CloseRequestedEvent) => Promise<void> | void)({
        preventDefault: prevent_default,
      } as unknown as CloseRequestedEvent);
      expect(prevent_default).not.toHaveBeenCalled();
      return () => {};
    });

    create_app_close_request_reactor(tab_store, ui_store, registry);
    await Promise.resolve();

    expect(execute_request_quit).not.toHaveBeenCalled();
  });
});

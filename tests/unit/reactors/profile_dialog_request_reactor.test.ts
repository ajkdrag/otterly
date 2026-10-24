import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { ProfileService, ProfileStore } from "$lib/features/profile";
import { create_profile_dialog_request_reactor } from "$lib/reactors/profile_dialog_request.reactor.svelte";
import { create_mock_profile_port } from "../helpers/mock_ports";

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

function create_harness() {
  const port = create_mock_profile_port();
  const service = new ProfileService(
    port,
    new ProfileStore(),
    new OpStore(),
    () => 0,
  );
  const registry = new ActionRegistry();
  const check_request = vi.fn().mockResolvedValue(undefined);
  registry.register({
    id: ACTION_IDS.profile_check_dialog_request,
    label: "Check Profiles Dialog Request",
    execute: check_request,
  });
  return { port, service, registry, check_request };
}

describe("profile_dialog_request.reactor", () => {
  beforeEach(() => {
    get_test_window().__TAURI__ = {};
  });

  it("checks for the request when the backend sends the event", () => {
    const { port, service, registry, check_request } = create_harness();
    const unmount = create_profile_dialog_request_reactor(service, registry);

    port._request_dialog();

    expect(check_request).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("stops listening once unmounted", () => {
    const { port, service, registry, check_request } = create_harness();
    const unmount = create_profile_dialog_request_reactor(service, registry);

    unmount();
    port._request_dialog();

    expect(check_request).not.toHaveBeenCalled();
  });
});

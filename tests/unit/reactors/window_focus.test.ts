import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribe_to_window_focus } from "$lib/reactors/window_focus";

type FocusEvent = { payload: boolean };

const on_focus_changed = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: on_focus_changed }),
}));

describe("subscribe_to_window_focus", () => {
  beforeEach(() => {
    on_focus_changed.mockReset();
  });

  it("calls back when the window gains focus, not when it loses it", async () => {
    let send_focus_event: (event: FocusEvent) => void = () => {};
    on_focus_changed.mockImplementation(
      (handler: (event: FocusEvent) => void) => {
        send_focus_event = handler;
        return Promise.resolve(vi.fn());
      },
    );
    const on_focus = vi.fn();

    subscribe_to_window_focus(on_focus);
    await Promise.resolve();
    send_focus_event({ payload: false });
    expect(on_focus).not.toHaveBeenCalled();
    send_focus_event({ payload: true });
    expect(on_focus).toHaveBeenCalledOnce();
  });

  it("stops listening when unsubscribed before Tauri finished registering", async () => {
    const unlisten = vi.fn();
    on_focus_changed.mockReturnValue(Promise.resolve(unlisten));

    const unsubscribe = subscribe_to_window_focus(vi.fn());
    unsubscribe();
    expect(unlisten).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("unlistens right away when it is already registered", async () => {
    const unlisten = vi.fn();
    on_focus_changed.mockReturnValue(Promise.resolve(unlisten));

    const unsubscribe = subscribe_to_window_focus(vi.fn());
    await Promise.resolve();
    unsubscribe();

    expect(unlisten).toHaveBeenCalledOnce();
  });
});

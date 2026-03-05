import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/shared/utils/detect_platform", () => ({
  is_tauri: false,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { create_file_open_reactor } from "$lib/reactors/file_open.reactor.svelte";

describe("file_open.reactor", () => {
  it("returns a cleanup function when not in tauri", () => {
    const on_file_open = vi.fn();
    const unmount = create_file_open_reactor(on_file_open);
    expect(typeof unmount).toBe("function");
    unmount();
    expect(on_file_open).not.toHaveBeenCalled();
  });
});

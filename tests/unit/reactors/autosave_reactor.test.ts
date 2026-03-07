import { describe, expect, it, vi } from "vitest";
import { create_autosave_reactor } from "$lib/reactors/autosave.reactor.svelte";

describe("autosave.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_autosave_reactor(
      {
        open_note: {
          is_dirty: false,
          meta: { path: "notes/test.md" },
        },
      } as never,
      {
        editor_settings: {
          autosave_enabled: true,
        },
      } as never,
      {
        save_note: vi.fn(),
      } as never,
      { show: vi.fn(), dismiss_all: vi.fn() } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});

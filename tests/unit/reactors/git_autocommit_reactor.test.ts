import { describe, expect, it, vi } from "vitest";
import { create_git_autocommit_reactor } from "$lib/reactors/git_autocommit.reactor.svelte";

describe("git_autocommit.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_git_autocommit_reactor(
      {
        open_note: {
          is_dirty: false,
          meta: { path: "notes/test.md" },
        },
      } as never,
      {
        is_open_note_dirty: vi.fn().mockReturnValue(false),
      } as never,
      { enabled: false, sync_status: "idle" } as never,
      {
        editor_settings: { git_autocommit_enabled: true },
      } as never,
      { auto_commit: vi.fn() } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("does not schedule auto-commit while git is disabled", () => {
    const auto_commit = vi.fn();
    const unmount = create_git_autocommit_reactor(
      {
        open_note: {
          is_dirty: false,
          meta: { path: "notes/test.md" },
        },
      } as never,
      {
        is_open_note_dirty: vi.fn().mockReturnValue(false),
      } as never,
      { enabled: false, sync_status: "idle" } as never,
      {
        editor_settings: { git_autocommit_enabled: true },
      } as never,
      { auto_commit } as never,
    );

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });

  it("does not schedule auto-commit when setting is disabled", () => {
    const auto_commit = vi.fn();
    const unmount = create_git_autocommit_reactor(
      {
        open_note: {
          is_dirty: false,
          meta: { path: "notes/test.md" },
        },
      } as never,
      {
        is_open_note_dirty: vi.fn().mockReturnValue(false),
      } as never,
      { enabled: true, sync_status: "idle" } as never,
      {
        editor_settings: { git_autocommit_enabled: false },
      } as never,
      { auto_commit } as never,
    );

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });
});

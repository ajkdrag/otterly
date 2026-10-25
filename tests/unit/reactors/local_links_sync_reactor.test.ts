/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { LinksService } from "$lib/features/links";
import {
  create_local_links_sync_reactor,
  resolve_local_links_sync_decision,
} from "$lib/reactors/local_links_sync.reactor.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function state(
  input?: Partial<{
    last_note_path: string | null;
    last_panel_open: boolean;
    last_markdown: string | null;
  }>,
) {
  return {
    last_note_path: null,
    last_panel_open: false,
    last_markdown: null,
    ...input,
  };
}

describe("local_links_sync.reactor", () => {
  it("clears when no note is open", () => {
    const result = resolve_local_links_sync_decision(state(), {
      open_note_path: null,
      panel_open: true,
      markdown: null,
    });

    expect(result.action).toBe("clear");
  });

  it("computes immediately when panel opens", () => {
    const result = resolve_local_links_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_markdown: "old",
      }),
      {
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "old",
      },
    );

    expect(result.action).toBe("compute_now");
  });

  it("computes immediately when note path changes", () => {
    const result = resolve_local_links_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown: "same",
      }),
      {
        open_note_path: "docs/b.md",
        panel_open: true,
        markdown: "same",
      },
    );

    expect(result.action).toBe("compute_now");
  });

  it("debounces recompute while typing with panel open", () => {
    const result = resolve_local_links_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown: "old",
      }),
      {
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "new",
      },
    );

    expect(result.action).toBe("compute_debounced");
  });

  it("cancels work while panel is closed", () => {
    const result = resolve_local_links_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown: "old",
      }),
      {
        open_note_path: "docs/a.md",
        panel_open: false,
        markdown: "new",
      },
    );

    expect(result.action).toBe("cancel");
  });

  it("does nothing when state is unchanged", () => {
    const result = resolve_local_links_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown: "same",
      }),
      {
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "same",
      },
    );

    expect(result.action).toBe("noop");
  });
});

describe("local_links_sync reactor", () => {
  it("still recomputes after a save changes the mtime inside the debounce window", async () => {
    vi.useFakeTimers();
    try {
      const ui = new UIStore();
      ui.context_rail_open = true;
      const editor = new EditorStore();
      const update_local_note_links = vi.fn().mockResolvedValue(undefined);
      const links_service = {
        update_local_note_links,
        clear: vi.fn(),
      } as unknown as LinksService;
      cleanups.push(create_local_links_sync_reactor(editor, ui, links_service));
      const meta = {
        ...create_test_note("a.md", "a"),
        path: as_note_path("a.md"),
      };

      editor.set_open_note(create_open_note_state(meta, "[[b]]"));
      await tick();
      expect(update_local_note_links).toHaveBeenCalledTimes(1);

      editor.set_open_note(create_open_note_state(meta, "[[b]] [[c]]"));
      await tick();
      editor.update_mtime(meta.id, 500);
      await tick();
      await vi.advanceTimersByTimeAsync(1000);

      expect(update_local_note_links).toHaveBeenCalledTimes(2);
      expect(update_local_note_links).toHaveBeenLastCalledWith(
        "a.md",
        "[[b]] [[c]]",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

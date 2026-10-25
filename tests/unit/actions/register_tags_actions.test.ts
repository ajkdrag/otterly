import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { register_tags_actions } from "$lib/features/tags/application/tags_actions";
import { as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

function setup() {
  const ui = new UIStore();
  const editor_store = new EditorStore();
  const tags = {
    select_tag: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
  const editor = { focus: vi.fn() };
  const registry = new ActionRegistry();
  register_tags_actions({
    registry,
    stores: { ui, editor: editor_store },
    services: { tags, editor },
  } as never);
  return { ui, editor_store, tags, editor, registry };
}

describe("tags actions", () => {
  it("open_tag shows the tags view and selects the tag", async () => {
    const { ui, tags, registry } = setup();
    ui.sidebar_open = false;

    await registry.execute(ACTION_IDS.tags_open_tag, "project/otterly");

    expect(ui.sidebar_view).toBe("tags");
    expect(ui.sidebar_open).toBe(true);
    expect(tags.select_tag).toHaveBeenCalledWith("project/otterly");
  });

  it("open_note reloads the pane only after the note open finished", async () => {
    const { tags, registry } = setup();
    let finish_open: () => void = () => {};
    const note_open = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish_open = resolve;
        }),
    );
    registry.register({
      id: ACTION_IDS.note_open,
      label: "Open Note",
      execute: note_open,
    });

    const opening = registry.execute(ACTION_IDS.tags_open_note, "gone.md");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(note_open).toHaveBeenCalledWith({
      note_path: "gone.md",
      cleanup_if_missing: true,
    });
    expect(tags.reload).not.toHaveBeenCalled();

    finish_open();
    await opening;
    expect(tags.reload).toHaveBeenCalledOnce();
  });

  it("open_note leaves the reload to the reactor when the note opened", async () => {
    const { editor_store, tags, registry } = setup();
    registry.register({
      id: ACTION_IDS.note_open,
      label: "Open Note",
      execute: () => {
        const meta = {
          ...create_test_note("here.md", "here"),
          path: as_note_path("here.md"),
        };
        editor_store.set_open_note(create_open_note_state(meta, "#t"));
      },
    });

    await registry.execute(ACTION_IDS.tags_open_note, "here.md");

    expect(tags.reload).not.toHaveBeenCalled();
  });

  it("show_pane opens the tags view and asks the pane to take focus", async () => {
    const { ui, registry } = setup();
    ui.sidebar_open = false;

    await registry.execute(ACTION_IDS.tags_show_pane);

    expect(ui.sidebar_view).toBe("tags");
    expect(ui.sidebar_open).toBe(true);
    expect(ui.tags_pane_focus_pending).toBe(true);
  });
});

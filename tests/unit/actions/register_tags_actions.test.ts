import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { register_tags_actions } from "$lib/features/tags/application/tags_actions";

function setup() {
  const ui = new UIStore();
  const tags = {
    select_tag: vi.fn().mockResolvedValue(undefined),
    clear_selected_tag: vi.fn(),
  };
  const registry = new ActionRegistry();
  register_tags_actions({
    registry,
    stores: { ui },
    services: { tags },
  } as never);
  return { ui, tags, registry };
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

  it("open_tag ignores a payload that is not a string", async () => {
    const { ui, tags, registry } = setup();

    await registry.execute(ACTION_IDS.tags_open_tag, { tag: "x" });

    expect(ui.sidebar_view).toBe("explorer");
    expect(tags.select_tag).not.toHaveBeenCalled();
  });

  it("close_tag clears the selected tag", async () => {
    const { tags, registry } = setup();

    await registry.execute(ACTION_IDS.tags_close_tag);

    expect(tags.clear_selected_tag).toHaveBeenCalledOnce();
  });
});

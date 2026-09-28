/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { history } from "@milkdown/kit/plugin/history";
import { task_list_enter_plugin } from "$lib/features/editor/adapters/task_list_enter_plugin";

async function create_editor(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(task_list_enter_plugin)
    .use(gfm)
    .use(history)
    .create();

  return {
    view: editor.ctx.get(editorViewCtx),
    cleanup: async () => {
      await editor.destroy();
      root.remove();
    },
  };
}

function place_cursor_after_text(view: EditorView, text: string) {
  let end = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) end = pos + node.nodeSize;
  });
  expect(end).toBeGreaterThan(0);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  );
}

function press_enter(view: EditorView) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  return view.someProp("handleKeyDown", (handle) => handle(view, event));
}

describe("Milkdown list Enter", () => {
  it.each(["- [x] done", "- [ ] todo"])(
    "starts an unchecked task after %s",
    async (markdown) => {
      const { view, cleanup } = await create_editor(markdown);
      try {
        place_cursor_after_text(
          view,
          markdown.endsWith("done") ? "done" : "todo",
        );
        expect(press_enter(view)).toBe(true);

        const items = view.state.doc.firstChild;
        expect(items?.childCount).toBe(2);
        expect(items?.child(0).attrs.checked).toBe(markdown.includes("[x]"));
        expect(items?.child(1).attrs.checked).toBe(false);
      } finally {
        await cleanup();
      }
    },
  );

  it("leaves ordinary bullet list items ordinary", async () => {
    const { view, cleanup } = await create_editor("- bullet");
    try {
      place_cursor_after_text(view, "bullet");
      expect(press_enter(view)).toBe(true);

      const items = view.state.doc.firstChild;
      expect(items?.childCount).toBe(2);
      expect(items?.child(1).attrs.checked).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("starts an unchecked item when splitting a completed task mid-text", async () => {
    const { view, cleanup } = await create_editor("- [x] done");
    try {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)),
      );
      expect(press_enter(view)).toBe(true);

      const items = view.state.doc.firstChild;
      expect(items?.childCount).toBe(2);
      expect(items?.child(0).attrs.checked).toBe(true);
      expect(items?.child(1).attrs.checked).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("exits a list when Enter is pressed in an empty task", async () => {
    const { view, cleanup } = await create_editor("- [x] task");
    try {
      view.dispatch(view.state.tr.delete(3, 7));
      expect(view.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)),
      );
      expect(press_enter(view)).toBe(true);
      expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally {
      await cleanup();
    }
  });

  it("starts an unchecked child after a nested completed task", async () => {
    const { view, cleanup } = await create_editor(
      "- [x] parent\n  - [x] child",
    );
    try {
      place_cursor_after_text(view, "child");
      expect(press_enter(view)).toBe(true);

      const parent_item = view.state.doc.firstChild?.firstChild;
      const nested_list = parent_item?.child(1);
      expect(nested_list?.type.name).toBe("bullet_list");
      expect(nested_list?.childCount).toBe(2);
      expect(nested_list?.child(0).attrs.checked).toBe(true);
      expect(nested_list?.child(1).attrs.checked).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("undoes the task split in one step", async () => {
    const { view, cleanup } = await create_editor("- [x] done");
    try {
      place_cursor_after_text(view, "done");
      expect(press_enter(view)).toBe(true);
      expect(view.state.doc.firstChild?.childCount).toBe(2);
      expect(undo(view.state, view.dispatch)).toBe(true);
      expect(view.state.doc.firstChild?.childCount).toBe(1);
      expect(view.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("leaves Enter to composition while the editor is composing", async () => {
    const { view, cleanup } = await create_editor("- [x] done");
    try {
      place_cursor_after_text(view, "done");
      view.dom.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      expect(view.composing).toBe(true);

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });
      expect(event.isComposing).toBe(false);
      const plugin = task_list_enter_plugin.plugin();
      expect(plugin.props.handleKeyDown?.call(plugin, view, event)).toBe(false);
      expect(view.state.doc.firstChild?.childCount).toBe(1);
    } finally {
      await cleanup();
    }
  });
});

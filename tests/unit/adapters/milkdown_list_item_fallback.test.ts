/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listItemBlockComponent } from "@milkdown/kit/component/list-item-block";
import { redo, undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import { history } from "@milkdown/kit/plugin/history";
import type { EditorView } from "@milkdown/kit/prose/view";

async function open_list_editor(markdown: string, with_component = true) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const configured_editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(history);
  if (with_component) configured_editor.use(listItemBlockComponent);
  const editor = await configured_editor.create();
  const view = editor.ctx.get(editorViewCtx);

  return {
    root,
    view,
    markdown: () => editor.ctx.get(serializerCtx)(view.state.doc),
    close: async () => {
      await editor.destroy();
      root.remove();
    },
  };
}

function find_list_item(view: EditorView, text: string): number {
  let item_position = -1;
  view.state.doc.descendants((node, position) => {
    if (node.type.name === "list_item" && node.textContent === text) {
      item_position = position;
      return false;
    }
    return true;
  });
  if (item_position < 0) throw new Error(`Expected list item: ${text}`);
  return item_position;
}

function place_cursor_after_text(view: EditorView, text: string): void {
  let end = -1;
  view.state.doc.descendants((node, position) => {
    if (node.isText && node.text === text) end = position + node.nodeSize;
  });
  if (end < 0) throw new Error(`Expected text: ${text}`);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  );
}

function press_enter(view: EditorView): boolean | void | undefined {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  return view.someProp("handleKeyDown", (handle) => handle(view, event));
}

beforeEach(() => {
  // These selection checks are synchronous. Native QA covers deferred focus.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Milkdown ordinary list fallback", () => {
  it("uses schema DOM for plain bullets and nested items", async () => {
    const markdown = "- parent\n  - child\n- sibling";
    const editor = await open_list_editor(markdown);
    try {
      const plain_items = editor.root.querySelectorAll(
        'li[data-list-type="bullet"]',
      );
      expect(plain_items).toHaveLength(3);
      expect(editor.root.querySelector(".milkdown-list-item-block")).toBeNull();
      expect(plain_items[0]?.querySelector("ul > li")?.textContent).toBe(
        "child",
      );
      expect(editor.markdown().trimEnd()).toBe(
        "* parent\n  * child\n* sibling",
      );
    } finally {
      await editor.close();
    }
  });

  it("keeps Vue checkboxes alongside native plain list items", async () => {
    const editor = await open_list_editor("- plain\n- [ ] task\n- tail");
    try {
      expect(editor.root.querySelectorAll("li[data-list-type]")).toHaveLength(
        2,
      );
      expect(
        editor.root.querySelectorAll(".milkdown-list-item-block"),
      ).toHaveLength(1);
      const label = editor.root.querySelector<HTMLElement>(
        ".milkdown-list-item-block .label-wrapper",
      );
      if (!label) throw new Error("Expected task checkbox");
      label.dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true }),
      );
      expect(editor.markdown()).toContain("* [x] task");
    } finally {
      await editor.close();
    }
  });

  it("rebuilds the node view when an item switches between plain and task", async () => {
    const editor = await open_list_editor("- target");
    try {
      const position = find_list_item(editor.view, "target");
      const original_anchor = editor.view.state.selection.anchor;
      editor.view.dispatch(
        editor.view.state.tr.setNodeAttribute(position, "checked", false),
      );
      expect(editor.root.querySelector("li[data-list-type]")).toBeNull();
      expect(
        editor.root.querySelectorAll(".milkdown-list-item-block"),
      ).toHaveLength(1);
      expect(editor.markdown()).toContain("* [ ] target");
      expect(editor.view.state.selection.anchor).toBe(original_anchor);

      editor.view.dispatch(
        editor.view.state.tr.setNodeAttribute(position, "checked", null),
      );
      expect(editor.root.querySelector("li[data-list-type]")).not.toBeNull();
      expect(editor.root.querySelector(".milkdown-list-item-block")).toBeNull();
      expect(editor.markdown().trimEnd()).toBe("* target");
      expect(editor.view.state.selection.anchor).toBe(original_anchor);

      expect(undo(editor.view.state, editor.view.dispatch)).toBe(true);
      expect(
        editor.root.querySelectorAll(".milkdown-list-item-block"),
      ).toHaveLength(1);
      expect(editor.markdown()).toContain("* [ ] target");
      expect(editor.view.state.selection.anchor).toBe(original_anchor);
    } finally {
      await editor.close();
    }
  });

  it("retains ordered labels and starts when tasks mix with plain items", async () => {
    const markdown = "5. first\n6. [x] task\n7. last\n   1. nested";
    const editor = await open_list_editor(markdown);
    try {
      const ordered = editor.root.querySelector("ol");
      expect(ordered?.getAttribute("start")).toBe("5");
      expect(
        ordered
          ?.querySelector('li[data-list-type="ordered"]')
          ?.getAttribute("data-label"),
      ).toBe("5.");
      expect(
        ordered?.querySelectorAll(':scope > li[data-list-type="ordered"]'),
      ).toHaveLength(2);
      expect(
        Array.from(
          ordered?.querySelectorAll<HTMLLIElement>(
            ':scope > li[data-list-type="ordered"]',
          ) ?? [],
          (item) => item.value,
        ),
      ).toEqual([5, 7]);
      expect(
        ordered?.querySelectorAll(":scope > .milkdown-list-item-block"),
      ).toHaveLength(1);
      expect(editor.markdown()).toContain("5. first\n6. [x] task\n7. last");
      expect(editor.markdown()).toContain("1. nested");
    } finally {
      await editor.close();
    }
  });

  it.each([false, true])(
    "renumbers an ordered list after Enter and undo (component: %s)",
    async (with_component) => {
      const editor = await open_list_editor(
        "5. first\n6. second",
        with_component,
      );
      try {
        place_cursor_after_text(editor.view, "first");
        expect(press_enter(editor.view)).toBe(true);

        const labels = () =>
          Array.from(
            editor.root.querySelectorAll<HTMLLIElement>(
              'ol > li[data-list-type="ordered"]',
            ),
            (item) => item.dataset.label,
          );
        const values = () =>
          Array.from(
            editor.root.querySelectorAll<HTMLLIElement>(
              'ol > li[data-list-type="ordered"]',
            ),
            (item) => item.value,
          );
        expect(labels()).toEqual(["5.", "6.", "7."]);
        expect(values()).toEqual([5, 6, 7]);
        expect(editor.markdown()).toContain("7. second");

        expect(undo(editor.view.state, editor.view.dispatch)).toBe(true);
        expect(labels()).toEqual(["5.", "6."]);
        expect(values()).toEqual([5, 6]);
        expect(editor.markdown()).toContain("6. second");
        expect(redo(editor.view.state, editor.view.dispatch)).toBe(true);
        expect(labels()).toEqual(["5.", "6.", "7."]);
        expect(values()).toEqual([5, 6, 7]);
        expect(editor.markdown()).toContain("7. second");
      } finally {
        await editor.close();
      }
    },
  );
});

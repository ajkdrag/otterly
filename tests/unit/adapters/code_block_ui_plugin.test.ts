/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import {
  EditorState,
  type Plugin,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  clamp_code_block_height,
  code_block_ui_key,
  create_code_block_ui_node_view,
  create_code_block_ui_prosemirror_plugin,
  read_code_block_heights,
  replace_code_block_heights,
} from "$lib/features/editor/adapters/code_block_ui_plugin";

function create_schema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: "code_block+" },
      text: { group: "inline" },
      code_block: {
        content: "text*",
        group: "block",
        marks: "",
        code: true,
        attrs: {
          language: { default: "" },
        },
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre" }],
      },
    },
    marks: {},
  });
}

function create_editor_state(
  schema: Schema,
  initial_heights: Array<number | null> = [320],
): EditorState {
  const plugin = create_code_block_ui_prosemirror_plugin({
    get_initial_heights: () => initial_heights,
  }) as Plugin;

  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node(
        "code_block",
        { language: "ts" },
        schema.text("const value = 1;"),
      ),
    ]),
    plugins: [plugin],
  });
}

function create_editor_view(state: EditorState): {
  view: EditorView;
  get_state: () => EditorState;
} {
  let current_state = state;

  const view = {
    state: current_state,
    dispatch: vi.fn((transaction: Transaction) => {
      current_state = current_state.apply(transaction);
      (view as { state: EditorState }).state = current_state;
    }),
  } as unknown as EditorView;

  return {
    view,
    get_state: () => current_state,
  };
}

describe("code_block_ui_plugin", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      value: 1000,
      writable: true,
    });
  });

  it("clamps resized heights to the supported viewport range", () => {
    expect(clamp_code_block_height(10, 1000)).toBe(48);
    expect(clamp_code_block_height(1200, 1000)).toBe(800);
  });

  it("applies the stored height to the rendered code block", () => {
    const schema = create_schema();
    const state = create_editor_state(schema, [320]);
    const { view } = create_editor_view(state);
    const node = state.doc.firstChild;
    if (!node) throw new Error("Expected code block node");

    const node_view = create_code_block_ui_node_view(node, view, () => 0);
    const dom = node_view.dom as HTMLElement;
    const pre = dom.querySelector("pre");

    expect(pre?.style.height).toBe("320px");
    expect(dom.getAttribute("data-visual-height")).toBe("320");
  });

  it("commits a new stored height when the resize handle is dragged", () => {
    const schema = create_schema();
    const state = create_editor_state(schema, [320]);
    const { view, get_state } = create_editor_view(state);
    const node = state.doc.firstChild;
    if (!node) throw new Error("Expected code block node");

    const node_view = create_code_block_ui_node_view(node, view, () => 0);
    const dom = node_view.dom as HTMLElement;
    const pre = dom.querySelector("pre");
    const handle = dom.querySelector(".code-block-resize-handle");
    if (!(pre instanceof HTMLElement) || !(handle instanceof HTMLElement)) {
      throw new Error("Expected code block UI elements");
    }

    vi.spyOn(pre, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 600,
      bottom: 320,
      width: 600,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientY: 320,
        pointerId: 1,
      }),
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientY: 520,
        pointerId: 1,
      }),
    );

    expect(pre.style.height).toBe("520px");

    document.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientY: 520,
        pointerId: 1,
      }),
    );

    expect(view.dispatch).toHaveBeenCalledOnce();
    expect(read_code_block_heights(get_state())).toEqual([520]);
  });

  it("replaces stored heights without changing the document", () => {
    const schema = create_schema();
    const state = create_editor_state(schema, [null]);
    const { view, get_state } = create_editor_view(state);
    const original_doc = get_state().doc;

    replace_code_block_heights(view, [240]);

    expect(get_state().doc).toBe(original_doc);
    expect(read_code_block_heights(get_state())).toEqual([240]);
    expect(code_block_ui_key.getState(get_state())?.positions).toEqual([0]);
  });

  it("does not emit a heights change during initial plugin view setup", () => {
    const schema = create_schema();
    const on_heights_change = vi.fn();
    const plugin = create_code_block_ui_prosemirror_plugin({
      get_initial_heights: () => [320],
      on_heights_change,
    }) as Plugin;
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node(
          "code_block",
          { language: "ts" },
          schema.text("const value = 1;"),
        ),
      ]),
      plugins: [plugin],
    });

    const plugin_view = plugin.spec.view?.({
      state,
      dispatch: vi.fn(),
      nodeDOM: vi.fn(() => {
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";
        const pre = document.createElement("pre");
        pre.appendChild(document.createElement("code"));
        wrapper.appendChild(pre);
        return wrapper;
      }),
    } as unknown as EditorView);

    expect(on_heights_change).not.toHaveBeenCalled();
    plugin_view?.destroy?.();
  });

  it("ignores resize-only DOM mutations but not code content mutations", () => {
    const schema = create_schema();
    const state = create_editor_state(schema, [320]);
    const { view } = create_editor_view(state);
    const node = state.doc.firstChild;
    if (!node) throw new Error("Expected code block node");

    const node_view = create_code_block_ui_node_view(node, view, () => 0);
    const dom = node_view.dom as HTMLElement;
    const header = dom.querySelector(".code-block-header");
    const code = dom.querySelector("code");
    if (!(header instanceof HTMLElement) || !(code instanceof HTMLElement)) {
      throw new Error("Expected code block UI elements");
    }

    expect(
      node_view.ignoreMutation?.({
        type: "attributes",
        target: header,
      } as unknown as MutationRecord),
    ).toBe(true);
    expect(
      node_view.ignoreMutation?.({
        type: "characterData",
        target: code,
      } as unknown as MutationRecord),
    ).toBe(false);
  });
});

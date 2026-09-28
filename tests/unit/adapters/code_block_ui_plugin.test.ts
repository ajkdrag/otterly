/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import {
  EditorState,
  type Plugin,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  create_code_block_ui_prosemirror_plugin,
  read_code_block_view_states,
  replace_code_block_view_states,
} from "$lib/features/editor/adapters/code_block_ui_plugin";
import type { CodeBlockViewStates } from "$lib/shared/types/editor";
import { code_block_view_state } from "../helpers/test_fixtures";

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
        attrs: { language: { default: "" } },
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre" }],
      },
    },
    marks: {},
  });
}

function create_editor({
  initial_view_states = [code_block_view_state(320)] as CodeBlockViewStates,
  language = "ts",
} = {}) {
  const schema = create_schema();
  const on_view_states_change = vi.fn();
  const plugin = create_code_block_ui_prosemirror_plugin({
    get_initial_view_states: () => initial_view_states,
    on_view_states_change,
  }) as Plugin;
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("code_block", { language }, schema.text("graph TD; A-->B")),
    ]),
    plugins: [plugin],
  });
  // Mimics Milkdown's block: a source element the handle measures.
  const dom = document.createElement("div");
  dom.className = "milkdown-code-block";
  const source = document.createElement("div");
  source.className = "codemirror-host";
  dom.appendChild(source);
  const view = {
    get state() {
      return state;
    },
    nodeDOM: () => dom,
    dispatch(transaction: Transaction) {
      const previous = state;
      state = state.apply(transaction);
      plugin_view?.update?.(view, previous);
    },
  } as unknown as EditorView;
  const plugin_view = plugin.spec.view?.(view);

  return {
    view,
    dom,
    source,
    on_view_states_change,
    destroy: () => plugin_view?.destroy?.(),
  };
}

const DEFAULTS = {
  source_height: null,
  diagram_height: null,
  source_hidden: false,
  diagram_zoom: 1,
};

function source_height(dom: HTMLElement): string {
  return dom.style.getPropertyValue("--code-block-source-height");
}

function bar_button(dom: HTMLElement, label: string): HTMLButtonElement {
  const button = dom.querySelector<HTMLButtonElement>(
    `.code-block-diagram-bar [aria-label="${label}"], .code-block-diagram-bar [title="${label}"]`,
  );
  if (!button) throw new Error(`Expected "${label}" button`);
  return button;
}

function dispatch_pointer(
  target: EventTarget,
  type: string,
  pointer_id: number,
  client_y: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientY: client_y,
  });
  Object.defineProperty(event, "pointerId", { value: pointer_id });
  target.dispatchEvent(event);
}

describe("code block source height", () => {
  it("restores height on the source without changing Markdown", () => {
    const { view, dom, on_view_states_change, destroy } = create_editor();

    expect(source_height(dom)).toBe("320px");
    expect(dom.style.height).toBe("");
    expect(on_view_states_change).not.toHaveBeenCalled();

    const original_doc = view.state.doc;
    replace_code_block_view_states(view, [code_block_view_state(240)]);

    expect(view.state.doc).toBe(original_doc);
    expect(read_code_block_view_states(view.state)).toEqual([
      code_block_view_state(240),
    ]);
    expect(source_height(dom)).toBe("240px");
    expect(on_view_states_change).toHaveBeenCalledWith([
      code_block_view_state(240),
    ]);
    destroy();
  });

  it("resizes the source from the handle and commits one height", () => {
    const { view, dom, source, on_view_states_change, destroy } =
      create_editor();
    const handle = dom.querySelector<HTMLButtonElement>(
      ".code-block-resize-handle",
    );
    if (!handle) throw new Error("Expected code block resize handle");
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      height: 320,
    } as DOMRect);
    const original_doc = view.state.doc;

    dispatch_pointer(handle, "pointerdown", 7, 100);
    dispatch_pointer(document, "pointermove", 7, 300);
    expect(source_height(dom)).toBe("520px");
    expect(read_code_block_view_states(view.state)).toEqual([
      code_block_view_state(320),
    ]);

    dispatch_pointer(document, "pointerup", 7, 300);
    expect(read_code_block_view_states(view.state)).toEqual([
      code_block_view_state(520),
    ]);
    expect(on_view_states_change).toHaveBeenCalledOnce();
    expect(view.state.doc).toBe(original_doc);

    dispatch_pointer(handle, "pointerdown", 8, 100);
    dispatch_pointer(document, "pointermove", 8, 400);
    dispatch_pointer(document, "pointercancel", 8, 400);
    expect(source_height(dom)).toBe("520px");
    expect(on_view_states_change).toHaveBeenCalledOnce();
    expect(document.body.style.userSelect).toBe("");
    destroy();
  });

  it("resizes with arrow keys and restores our elements after a remount", async () => {
    const { view, dom, source, destroy } = create_editor();
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      height: 320,
    } as DOMRect);
    const handle = dom.querySelector<HTMLButtonElement>(
      ".code-block-resize-handle",
    );
    if (!handle) throw new Error("Expected code block resize handle");
    expect(handle.getAttribute("aria-label")).toContain("Resize code block");

    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(read_code_block_view_states(view.state)).toEqual([
      code_block_view_state(336),
    ]);

    dom.replaceChildren();
    await Promise.resolve();
    expect(dom.querySelector(".code-block-resize-handle")).toBe(handle);
    expect(dom.querySelector(".code-block-diagram-bar")).not.toBeNull();

    destroy();
    dom.replaceChildren();
    await Promise.resolve();
    expect(dom.querySelector(".code-block-resize-handle")).toBeNull();
    expect(dom.querySelector(".code-block-diagram-bar")).toBeNull();
  });

  it("maps stored state when text before the block changes", () => {
    const schema = create_schema();
    const plugin = create_code_block_ui_prosemirror_plugin({
      get_initial_view_states: () => [
        code_block_view_state(320),
        code_block_view_state(240),
      ],
    }) as Plugin;
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("code_block", null, schema.text("first")),
        schema.node("code_block", null, schema.text("second")),
      ]),
      plugins: [plugin],
    });

    const next = state.apply(state.tr.insertText("new ", 1));
    expect(read_code_block_view_states(next)).toEqual([
      code_block_view_state(320),
      code_block_view_state(240),
    ]);
  });

  it("drops invalid restored state and keeps defaults as null", () => {
    const { view, destroy } = create_editor({
      initial_view_states: [
        320 as unknown as null,
      ] satisfies CodeBlockViewStates,
    });
    expect(read_code_block_view_states(view.state)).toEqual([null]);

    replace_code_block_view_states(view, [{ ...DEFAULTS, diagram_zoom: 99 }]);
    expect(read_code_block_view_states(view.state)).toEqual([
      { ...DEFAULTS, diagram_zoom: 10 },
    ]);
    destroy();
  });
});

describe("diagram bar", () => {
  it("marks only diagram blocks", () => {
    const code = create_editor({ language: "ts" });
    expect(code.dom.dataset.diagram).toBeUndefined();
    code.destroy();

    const diagram = create_editor({ language: "mermaid" });
    expect(diagram.dom.dataset.diagram).toBe("true");
    diagram.destroy();
    expect(diagram.dom.dataset.diagram).toBeUndefined();
  });

  it("hides the source and keeps that in the saved state", () => {
    const { view, dom, on_view_states_change, destroy } = create_editor({
      initial_view_states: [null],
      language: "mermaid",
    });

    bar_button(dom, "Hide source").click();
    expect(dom.dataset.sourceHidden).toBe("true");
    expect(on_view_states_change).toHaveBeenLastCalledWith([
      { ...DEFAULTS, source_hidden: true },
    ]);

    bar_button(dom, "Show source").click();
    expect(dom.dataset.sourceHidden).toBeUndefined();
    expect(read_code_block_view_states(view.state)).toEqual([null]);
    destroy();
  });

  it("walks the zoom levels, stops at the ends, and resets to fit", () => {
    const { view, dom, destroy } = create_editor({
      initial_view_states: [{ ...DEFAULTS, diagram_zoom: 3.5 }],
      language: "mermaid",
    });
    const zoom_in = bar_button(dom, "Zoom in");
    const zoom_out = bar_button(dom, "Zoom out");
    const zoom_reset = bar_button(dom, "Fit to width");

    // A zoom between levels snaps to the next level up.
    zoom_in.click();
    expect(dom.style.getPropertyValue("--diagram-zoom")).toBe("4");
    expect(zoom_reset.textContent).toBe("400%");

    for (let index = 0; index < 5; index += 1) zoom_in.click();
    expect(read_code_block_view_states(view.state)[0]?.diagram_zoom).toBe(10);
    expect(zoom_reset.textContent).toBe("1000%");
    expect(zoom_in.disabled).toBe(true);

    zoom_out.click();
    expect(dom.style.getPropertyValue("--diagram-zoom")).toBe("8");

    zoom_reset.click();
    expect(zoom_reset.textContent).toBe("100%");
    expect(read_code_block_view_states(view.state)).toEqual([null]);

    for (let index = 0; index < 5; index += 1) zoom_out.click();
    expect(read_code_block_view_states(view.state)[0]?.diagram_zoom).toBe(0.25);
    expect(zoom_out.disabled).toBe(true);
    destroy();
  });

  it("resizes the diagram with its own handle", () => {
    const { view, dom, destroy } = create_editor({
      initial_view_states: [null],
      language: "mermaid",
    });
    const panel = document.createElement("div");
    panel.className = "preview-panel";
    dom.appendChild(panel);
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      height: 300,
    } as DOMRect);
    const handle = dom.querySelector<HTMLButtonElement>(
      ".code-block-diagram-resize-handle",
    );
    if (!handle) throw new Error("Expected diagram resize handle");

    dispatch_pointer(handle, "pointerdown", 3, 100);
    dispatch_pointer(document, "pointermove", 3, 150);
    expect(dom.style.getPropertyValue("--diagram-height")).toBe("350px");
    dispatch_pointer(document, "pointerup", 3, 150);

    expect(read_code_block_view_states(view.state)).toEqual([
      { ...DEFAULTS, diagram_height: 350 },
    ]);
    expect(source_height(dom)).toBe("");
    destroy();
  });
});

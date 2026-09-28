/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import {
  EditorState,
  type Plugin,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  create_code_block_ui_prosemirror_plugin,
  read_code_block_heights,
  replace_code_block_heights,
} from "$lib/features/editor/adapters/code_block_ui_plugin";

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];
  readonly observed = new Set<Element>();

  constructor(private callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  emit(target: Element, height: number): void {
    this.callback(
      [{ target, contentRect: { height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

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

function create_editor(initial_heights: Array<number | null> = [320]) {
  const schema = create_schema();
  const on_heights_change = vi.fn();
  const plugin = create_code_block_ui_prosemirror_plugin({
    get_initial_heights: () => initial_heights,
    on_heights_change,
  }) as Plugin;
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("code_block", { language: "ts" }, schema.text("const x = 1")),
    ]),
    plugins: [plugin],
  });
  const dom = document.createElement("div");
  dom.className = "milkdown-code-block";
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
    on_heights_change,
    destroy: () => plugin_view?.destroy?.(),
  };
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

afterEach(() => {
  vi.unstubAllGlobals();
  TestResizeObserver.instances = [];
});

describe("code block height state", () => {
  it("restores height on the maintained code block without changing Markdown", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const { view, dom, on_heights_change, destroy } = create_editor([320]);

    expect(dom.style.height).toBe("320px");
    expect(on_heights_change).not.toHaveBeenCalled();

    const original_doc = view.state.doc;
    replace_code_block_heights(view, [240]);

    expect(view.state.doc).toBe(original_doc);
    expect(read_code_block_heights(view.state)).toEqual([240]);
    expect(dom.style.height).toBe("240px");
    expect(on_heights_change).toHaveBeenCalledWith([240]);
    destroy();
  });

  it("stores a user resize but ignores programmatic and layout observer events", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const { view, dom, on_heights_change, destroy } = create_editor([320]);
    const observer = TestResizeObserver.instances[0];
    if (!observer) throw new Error("Expected resize observer");

    observer.emit(dom, 320);
    expect(on_heights_change).not.toHaveBeenCalled();

    dom.style.height = "520px";
    observer.emit(dom, 520);
    expect(read_code_block_heights(view.state)).toEqual([520]);
    expect(on_heights_change).toHaveBeenCalledOnce();

    observer.emit(dom, 520);
    expect(on_heights_change).toHaveBeenCalledOnce();
    destroy();
    expect(observer.observed.size).toBe(0);
  });

  it("resizes from the visible handle and commits one height without changing content", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const { view, dom, on_heights_change, destroy } = create_editor([320]);
    const handle = dom.querySelector<HTMLButtonElement>(
      ".code-block-resize-handle",
    );
    if (!handle) throw new Error("Expected code block resize handle");
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      height: 320,
    } as DOMRect);
    const original_doc = view.state.doc;

    dispatch_pointer(handle, "pointerdown", 7, 100);
    dispatch_pointer(document, "pointermove", 7, 300);
    expect(dom.style.height).toBe("520px");
    expect(read_code_block_heights(view.state)).toEqual([320]);

    dispatch_pointer(document, "pointerup", 7, 300);
    expect(read_code_block_heights(view.state)).toEqual([520]);
    expect(on_heights_change).toHaveBeenCalledOnce();
    expect(view.state.doc).toBe(original_doc);

    dispatch_pointer(handle, "pointerdown", 8, 100);
    dispatch_pointer(document, "pointermove", 8, 400);
    dispatch_pointer(document, "pointercancel", 8, 400);
    expect(dom.style.height).toBe("520px");
    expect(on_heights_change).toHaveBeenCalledOnce();
    expect(document.body.style.userSelect).toBe("");
    destroy();
  });

  it("resizes with arrow keys and restores the handle after code view remount", async () => {
    const { view, dom, destroy } = create_editor([320]);
    const handle = dom.querySelector<HTMLButtonElement>(
      ".code-block-resize-handle",
    );
    if (!handle) throw new Error("Expected code block resize handle");
    expect(handle.getAttribute("aria-label")).toContain("Resize code block");

    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(read_code_block_heights(view.state)).toEqual([336]);

    dom.replaceChildren();
    await Promise.resolve();
    expect(dom.querySelector(".code-block-resize-handle")).toBe(handle);

    destroy();
    dom.replaceChildren();
    await Promise.resolve();
    expect(dom.querySelector(".code-block-resize-handle")).toBeNull();
  });

  it("maps a stored height when text before the block changes", () => {
    const schema = create_schema();
    const plugin = create_code_block_ui_prosemirror_plugin({
      get_initial_heights: () => [320, 240],
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
    expect(read_code_block_heights(next)).toEqual([320, 240]);
  });
});

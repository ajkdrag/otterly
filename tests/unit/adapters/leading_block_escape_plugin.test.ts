/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { create_leading_block_escape_prose_plugin } from "$lib/features/editor/adapters/leading_block_escape_plugin";

function create_schema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        code: true,
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre", preserveWhitespace: "full" as const }],
      },
      blockquote: {
        group: "block",
        content: "block+",
        toDOM: () => ["blockquote", 0] as const,
        parseDOM: [{ tag: "blockquote" }],
      },
      text: { group: "inline" },
    },
    marks: {},
  });
}

function create_state_with_plugin(
  schema: Schema,
  doc: ReturnType<Schema["node"]>,
  pos: number,
) {
  const plugin = create_leading_block_escape_prose_plugin();
  const state = EditorState.create({ schema, doc, plugins: [plugin] });
  const sel = TextSelection.create(state.doc, pos);
  return state.apply(state.tr.setSelection(sel));
}

function create_view_with_dispatch(state: EditorState) {
  const dispatched: EditorState[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new EditorView(container, {
    state,
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      dispatched.push(next);
      view.updateState(next);
    },
  });
  return {
    view,
    dispatched,
    cleanup: () => {
      view.destroy();
      container.remove();
    },
  };
}

function simulate_key(
  view: EditorView,
  key: string,
  options: KeyboardEventInit = {},
): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    ...options,
  });
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}

function last_dispatched(
  dispatched: EditorState[],
  fallback: EditorState,
): EditorState {
  return dispatched.length > 0
    ? (dispatched[dispatched.length - 1] ?? fallback)
    : fallback;
}

describe("leading_block_escape_plugin", () => {
  describe("code_block as first child", () => {
    it("ArrowUp on first line inserts paragraph before code_block", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("line1\nline2")),
      ]);

      const state = create_state_with_plugin(schema, doc, 1);
      const { view, dispatched, cleanup } = create_view_with_dispatch(state);
      vi.spyOn(view, "endOfTextblock").mockReturnValue(true);

      const handled = simulate_key(view, "ArrowUp");
      expect(handled).toBe(true);

      const final_state = last_dispatched(dispatched, state);
      expect(final_state.doc.firstChild?.type.name).toBe("paragraph");
      expect(final_state.doc.childCount).toBe(2);
      expect(final_state.selection.from).toBe(1);

      cleanup();
    });

    it("ArrowUp on second line does not insert paragraph", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("line1\nline2")),
      ]);

      // pos 7 = after "line1\n", start of "line2"
      const state = create_state_with_plugin(schema, doc, 7);
      const { view, cleanup } = create_view_with_dispatch(state);
      vi.spyOn(view, "endOfTextblock").mockReturnValue(false);

      const handled = simulate_key(view, "ArrowUp");
      expect(handled).toBe(false);

      cleanup();
    });

    it("ArrowLeft at position 1 inserts paragraph before code_block", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("code")),
      ]);

      const state = create_state_with_plugin(schema, doc, 1);
      const { view, dispatched, cleanup } = create_view_with_dispatch(state);

      const handled = simulate_key(view, "ArrowLeft");
      expect(handled).toBe(true);

      const final_state = last_dispatched(dispatched, state);
      expect(final_state.doc.firstChild?.type.name).toBe("paragraph");

      cleanup();
    });

    it("ArrowLeft at position > 1 does not insert paragraph", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("code")),
      ]);

      const state = create_state_with_plugin(schema, doc, 3);
      const { view, cleanup } = create_view_with_dispatch(state);

      const handled = simulate_key(view, "ArrowLeft");
      expect(handled).toBe(false);

      cleanup();
    });

    it.each([
      { name: "Shift+Up", options: { shiftKey: true } },
      { name: "Meta+Up", options: { metaKey: true } },
      { name: "composing Up", options: { isComposing: true } },
    ])("$name does not insert a paragraph", ({ options }) => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("code")),
      ]);
      const state = create_state_with_plugin(schema, doc, 1);
      const { view, cleanup } = create_view_with_dispatch(state);
      vi.spyOn(view, "endOfTextblock").mockReturnValue(true);

      expect(simulate_key(view, "ArrowUp", options)).toBe(false);
      expect(view.state.doc).toBe(doc);
      cleanup();
    });
  });

  describe("paragraph as first child (no-op)", () => {
    it("ArrowUp does not insert paragraph when first child is paragraph", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("paragraph", null, schema.text("hello")),
      ]);

      const state = create_state_with_plugin(schema, doc, 1);
      const { view, cleanup } = create_view_with_dispatch(state);

      const handled = simulate_key(view, "ArrowUp");
      expect(handled).toBe(false);

      cleanup();
    });
  });

  describe("blockquote as first child", () => {
    it("ArrowUp on first line inserts paragraph before blockquote", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node(
          "blockquote",
          null,
          schema.node("paragraph", null, schema.text("quoted")),
        ),
      ]);

      // doc(0) > blockquote(1) > paragraph(2) > "quoted" starts at 3
      const state = create_state_with_plugin(schema, doc, 3);
      const { view, dispatched, cleanup } = create_view_with_dispatch(state);
      vi.spyOn(view, "endOfTextblock").mockReturnValue(true);

      const handled = simulate_key(view, "ArrowUp");
      expect(handled).toBe(true);

      const final_state = last_dispatched(dispatched, state);
      expect(final_state.doc.firstChild?.type.name).toBe("paragraph");

      cleanup();
    });

    it("ArrowUp in the second quoted paragraph stays inside the quote", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("paragraph", null, schema.text("first")),
          schema.node("paragraph", null, schema.text("second")),
        ]),
      ]);
      const state = create_state_with_plugin(schema, doc, 9);
      const { view, cleanup } = create_view_with_dispatch(state);
      const end_of_textblock = vi
        .spyOn(view, "endOfTextblock")
        .mockReturnValue(true);

      expect(simulate_key(view, "ArrowUp")).toBe(false);
      expect(view.state.doc).toBe(doc);
      expect(end_of_textblock).not.toHaveBeenCalled();
      cleanup();
    });

    it("ArrowLeft at the first quoted paragraph inserts before the quote", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("paragraph", null, schema.text("quoted")),
        ]),
      ]);
      const state = create_state_with_plugin(schema, doc, 2);
      const { view, cleanup } = create_view_with_dispatch(state);

      expect(simulate_key(view, "ArrowLeft")).toBe(true);
      expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
      cleanup();
    });
  });

  describe("cursor in second block", () => {
    it("does not trigger when cursor is in second code_block", () => {
      const schema = create_schema();
      const doc = schema.node("doc", null, [
        schema.node("code_block", null, schema.text("first")),
        schema.node("code_block", null, schema.text("second")),
      ]);

      // first code_block occupies: open(0) content(1-5) close(6)
      // second code_block: open(7) content starts at 8
      const state = create_state_with_plugin(schema, doc, 8);
      const { view, cleanup } = create_view_with_dispatch(state);

      const handled = simulate_key(view, "ArrowUp");
      expect(handled).toBe(false);

      cleanup();
    });
  });
});

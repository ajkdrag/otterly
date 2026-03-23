/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { Mark, SchemaSpec } from "@milkdown/kit/prose/model";
import { EditorView } from "@milkdown/kit/prose/view";
import { create_mark_boundary_escape_prose_plugin } from "$lib/features/editor/adapters/mark_boundary_escape_plugin";

function required_mark(schema: Schema, name: string) {
  const mark = schema.marks[name];
  if (!mark) throw new Error(`Missing mark: ${name}`);
  return mark;
}

function link_dom(mark: Mark) {
  const attrs = mark.attrs as Record<string, unknown>;
  const href = attrs["href"];
  return ["a", { href: typeof href === "string" ? href : "" }, 0] as const;
}

function create_schema() {
  const spec: SchemaSpec = {
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
    },
    marks: {
      link: {
        attrs: { href: {} },
        parseDOM: [{ tag: "a[href]" }],
        toDOM: (mark: Mark) => link_dom(mark),
      },
      inlineCode: {
        code: true,
        parseDOM: [{ tag: "code" }],
        toDOM: () => ["code", 0] as const,
      },
      strike_through: {
        parseDOM: [{ tag: "del" }],
        toDOM: () => ["del", 0] as const,
      },
      strong: {
        parseDOM: [{ tag: "strong" }],
        toDOM: () => ["strong", 0] as const,
      },
    },
  };

  return new Schema(spec);
}

function create_view(state: EditorState) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const view = new EditorView(container, {
    state,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction));
    },
  });

  return {
    view,
    cleanup: () => {
      view.destroy();
      container.remove();
    },
  };
}

function press_escape(view: EditorView): boolean {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  return (
    view.someProp("handleKeyDown", (handle) => handle(view, event)) ?? false
  );
}

function insert_text(view: EditorView, text: string): void {
  view.dispatch(view.state.tr.insertText(text));
}

function get_text_marks(
  doc: EditorState["doc"],
): Array<{ text: string; marks: string[] }> {
  const result: Array<{ text: string; marks: string[] }> = [];
  doc.descendants((node) => {
    if (!node.isText) return true;
    result.push({
      text: node.text ?? "",
      marks: node.marks.map((mark) => mark.type.name).sort(),
    });
    return true;
  });
  return result;
}

function create_state(input: {
  doc: ReturnType<Schema["node"]>;
  selection: number;
}) {
  const plugin = create_mark_boundary_escape_prose_plugin();
  const state = EditorState.create({
    schema: input.doc.type.schema,
    doc: input.doc,
    plugins: [plugin],
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, input.selection)),
  );
}

describe("mark_boundary_escape_plugin", () => {
  it("escapes link marks at the end boundary", () => {
    const schema = create_schema();
    const link = required_mark(schema, "link").create({ href: "note.md" });
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("a", [link])]),
      ]),
      selection: 2,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(true);
    insert_text(view, "x");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "a", marks: ["link"] },
      { text: "x", marks: [] },
    ]);

    cleanup();
  });

  it("keeps typing outside a link after escaping the start boundary", () => {
    const schema = create_schema();
    const link = required_mark(schema, "link").create({ href: "note.md" });
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("a", [link])]),
      ]),
      selection: 1,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(true);
    insert_text(view, "x");
    insert_text(view, "y");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "xy", marks: [] },
      { text: "a", marks: ["link"] },
    ]);

    cleanup();
  });

  it("drops only the link mark and preserves strong at a mixed boundary", () => {
    const schema = create_schema();
    const strong = required_mark(schema, "strong").create();
    const link = required_mark(schema, "link").create({ href: "note.md" });
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("a", [strong]),
          schema.text("b", [strong, link]),
        ]),
      ]),
      selection: 2,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(true);
    insert_text(view, "x");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "ax", marks: ["strong"] },
      { text: "b", marks: ["link", "strong"] },
    ]);

    cleanup();
  });

  it("escapes inline code marks", () => {
    const schema = create_schema();
    const code = required_mark(schema, "inlineCode").create();
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("a", [code])]),
      ]),
      selection: 2,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(true);
    insert_text(view, "x");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "a", marks: ["inlineCode"] },
      { text: "x", marks: [] },
    ]);

    cleanup();
  });

  it("escapes strikethrough marks", () => {
    const schema = create_schema();
    const strike = required_mark(schema, "strike_through").create();
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("a", [strike])]),
      ]),
      selection: 2,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(true);
    insert_text(view, "x");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "a", marks: ["strike_through"] },
      { text: "x", marks: [] },
    ]);

    cleanup();
  });

  it("does nothing when the cursor is inside a link instead of at its boundary", () => {
    const schema = create_schema();
    const link = required_mark(schema, "link").create({ href: "note.md" });
    const state = create_state({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("ab", [link])]),
      ]),
      selection: 2,
    });
    const { view, cleanup } = create_view(state);

    expect(press_escape(view)).toBe(false);
    insert_text(view, "x");

    expect(get_text_marks(view.state.doc)).toEqual([
      { text: "axb", marks: ["link"] },
    ]);

    cleanup();
  });
});

import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import type {
  MarkType,
  Node as ProseNode,
  Mark,
} from "@milkdown/kit/prose/model";
import { build_link_edit_transaction } from "$lib/features/editor/adapters/link_edit_transaction";

function create_schema() {
  const link = {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute("href") }),
      },
    ],
    toDOM: (mark: Mark, _inline: boolean) =>
      ["a", { href: String(mark.attrs["href"] ?? "") }, 0] as const,
  } as const;

  const doc = { content: "block+" } as const;
  const text = { group: "inline" } as const;
  const paragraph = {
    group: "block",
    content: "inline*",
    toDOM: () => ["p", 0] as const,
    parseDOM: [{ tag: "p" }],
  } as const;

  return new Schema({
    nodes: { doc, paragraph, text },
    marks: { link },
  });
}

function get_link_type(schema: Schema): MarkType {
  const link = schema.marks.link;
  if (!link) throw new Error("link mark not found in schema");
  return link;
}

function create_linked_state(
  schema: Schema,
  before: string,
  display_text: string,
  href: string,
  after: string,
) {
  const link_type = get_link_type(schema);
  const link_mark = link_type.create({ href });
  const children = [];
  if (before) children.push(schema.text(before));
  children.push(schema.text(display_text, [link_mark]));
  if (after) children.push(schema.text(after));

  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, children),
  ]);
  return EditorState.create({ schema, doc });
}

function get_link_info(
  doc: ProseNode,
  link_type: MarkType,
): { text: string; href: string } | null {
  let result: { text: string; href: string } | null = null;
  doc.descendants((node: ProseNode) => {
    if (result) return false;
    if (!node.isText) return true;
    const mark = node.marks.find((m: Mark) => m.type === link_type);
    if (!mark) return true;
    result = { text: node.text ?? "", href: String(mark.attrs["href"] ?? "") };
    return false;
  });
  return result;
}

function apply_edit(
  schema: Schema,
  state: EditorState,
  params: Parameters<typeof build_link_edit_transaction>[2],
) {
  const link_type = get_link_type(schema);
  const tr = build_link_edit_transaction(state, link_type, params);
  if (!tr) throw new Error("Expected transaction to be non-null");
  return { next: state.apply(tr), link_type };
}

describe("build_link_edit_transaction", () => {
  it("returns null when nothing changed", () => {
    const schema = create_schema();
    const link_type = get_link_type(schema);
    const state = create_linked_state(
      schema,
      "See ",
      "my link",
      "page.md",
      " end",
    );

    const from = 1 + "See ".length;
    const to = from + "my link".length;

    const tr = build_link_edit_transaction(state, link_type, {
      from,
      to,
      old_display_text: "my link",
      old_href: "page.md",
      new_display_text: "my link",
      new_href: "page.md",
    });

    expect(tr).toBeNull();
  });

  it("returns null when new display text is empty", () => {
    const schema = create_schema();
    const link_type = get_link_type(schema);
    const state = create_linked_state(
      schema,
      "See ",
      "my link",
      "page.md",
      " end",
    );

    const from = 1 + "See ".length;
    const to = from + "my link".length;

    const tr = build_link_edit_transaction(state, link_type, {
      from,
      to,
      old_display_text: "my link",
      old_href: "page.md",
      new_display_text: "",
      new_href: "",
    });

    expect(tr).toBeNull();
  });

  it("updates only href when display text is unchanged", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "See ",
      "my link",
      "old.md",
      " end",
    );

    const from = 1 + "See ".length;
    const to = from + "my link".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "my link",
      old_href: "old.md",
      new_display_text: "my link",
      new_href: "new.md",
    });

    const info = get_link_info(next.doc, link_type);
    expect(info).not.toBeNull();
    expect(info?.text).toBe("my link");
    expect(info?.href).toBe("new.md");
  });

  it("updates only display text when href is unchanged", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "See ",
      "old text",
      "page.md",
      " end",
    );

    const from = 1 + "See ".length;
    const to = from + "old text".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "old text",
      old_href: "page.md",
      new_display_text: "new text",
      new_href: "page.md",
    });

    const info = get_link_info(next.doc, link_type);
    expect(info).not.toBeNull();
    expect(info?.text).toBe("new text");
    expect(info?.href).toBe("page.md");
  });

  it("updates both display text and href simultaneously", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "See ",
      "old text",
      "old.md",
      " end",
    );

    const from = 1 + "See ".length;
    const to = from + "old text".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "old text",
      old_href: "old.md",
      new_display_text: "new text",
      new_href: "new.md",
    });

    const info = get_link_info(next.doc, link_type);
    expect(info).not.toBeNull();
    expect(info?.text).toBe("new text");
    expect(info?.href).toBe("new.md");
  });

  it("handles display text that changes length (shorter)", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "Go ",
      "long display text",
      "page.md",
      ".",
    );

    const from = 1 + "Go ".length;
    const to = from + "long display text".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "long display text",
      old_href: "page.md",
      new_display_text: "short",
      new_href: "page.md",
    });

    const info = get_link_info(next.doc, link_type);
    expect(info).not.toBeNull();
    expect(info?.text).toBe("short");
    expect(next.doc.child(0).textContent).toBe("Go short.");
  });

  it("handles display text that changes length (longer)", () => {
    const schema = create_schema();
    const state = create_linked_state(schema, "", "hi", "page.md", " world");

    const from = 1;
    const to = from + "hi".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "hi",
      old_href: "page.md",
      new_display_text: "hello there",
      new_href: "page.md",
    });

    const info = get_link_info(next.doc, link_type);
    expect(info).not.toBeNull();
    expect(info?.text).toBe("hello there");
    expect(next.doc.child(0).textContent).toBe("hello there world");
  });

  it("preserves surrounding text when updating", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "before ",
      "link",
      "target.md",
      " after",
    );

    const from = 1 + "before ".length;
    const to = from + "link".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "link",
      old_href: "target.md",
      new_display_text: "updated link",
      new_href: "new-target.md",
    });

    const para = next.doc.child(0);
    expect(para.textContent).toBe("before updated link after");
    const info = get_link_info(next.doc, link_type);
    expect(info?.href).toBe("new-target.md");
  });

  it("handles link at start of paragraph", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "",
      "click me",
      "page.md",
      " for more",
    );

    const from = 1;
    const to = from + "click me".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "click me",
      old_href: "page.md",
      new_display_text: "tap here",
      new_href: "other.md",
    });

    expect(next.doc.child(0).textContent).toBe("tap here for more");
    const info = get_link_info(next.doc, link_type);
    expect(info?.text).toBe("tap here");
    expect(info?.href).toBe("other.md");
  });

  it("handles link at end of paragraph", () => {
    const schema = create_schema();
    const state = create_linked_state(
      schema,
      "see ",
      "docs",
      "https://example.com",
      "",
    );

    const from = 1 + "see ".length;
    const to = from + "docs".length;

    const { next, link_type } = apply_edit(schema, state, {
      from,
      to,
      old_display_text: "docs",
      old_href: "https://example.com",
      new_display_text: "documentation",
      new_href: "https://example.com/docs",
    });

    expect(next.doc.child(0).textContent).toBe("see documentation");
    const info = get_link_info(next.doc, link_type);
    expect(info?.text).toBe("documentation");
    expect(info?.href).toBe("https://example.com/docs");
  });
});

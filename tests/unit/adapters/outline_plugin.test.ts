import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { extract_headings } from "$lib/features/editor/adapters/outline_plugin";

function create_schema_with_headings() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      text: { group: "inline" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      heading: {
        group: "block",
        content: "inline*",
        attrs: { level: { default: 1 } },
        toDOM: (node: ProseNode) =>
          [`h${String(node.attrs.level)}`, 0] as unknown as readonly [
            string,
            0,
          ],
        parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
          tag: `h${String(level)}`,
          attrs: { level },
        })),
      },
    },
    marks: {},
  });
}

function make_heading(schema: Schema, level: number, text: string): ProseNode {
  return schema.node("heading", { level }, text ? [schema.text(text)] : []);
}

function make_paragraph(schema: Schema, text: string): ProseNode {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

describe("extract_headings", () => {
  it("returns empty array for doc with no headings", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_paragraph(schema, "Hello world"),
    ]);
    expect(extract_headings(doc)).toEqual([]);
  });

  it("extracts single heading", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [make_heading(schema, 1, "Title")]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].level).toBe(1);
    expect(headings[0].text).toBe("Title");
    expect(headings[0].id).toMatch(/^h-\d+$/);
  });

  it("extracts multiple headings with correct levels", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "Title"),
      make_paragraph(schema, "Some text"),
      make_heading(schema, 2, "Section A"),
      make_heading(schema, 3, "Subsection"),
      make_heading(schema, 2, "Section B"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(4);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 2]);
    expect(headings.map((h) => h.text)).toEqual([
      "Title",
      "Section A",
      "Subsection",
      "Section B",
    ]);
  });

  it("handles empty headings", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [make_heading(schema, 1, "")]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("");
  });

  it("assigns unique IDs based on position", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "A"),
      make_heading(schema, 1, "B"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(2);
    expect(headings[0].id).not.toBe(headings[1].id);
  });

  it("preserves heading positions", () => {
    const schema = create_schema_with_headings();
    const doc = schema.node("doc", null, [
      make_heading(schema, 1, "First"),
      make_paragraph(schema, "Some text between"),
      make_heading(schema, 2, "Second"),
    ]);
    const headings = extract_headings(doc);
    expect(headings).toHaveLength(2);
    expect(headings[0].pos).toBeLessThan(headings[1].pos);
  });
});

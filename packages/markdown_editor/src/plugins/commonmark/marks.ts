import type { SyntaxNodeRef } from "@lezer/common";
import type { Render } from "../../core/inline_rendering.js";
import type { InlineConstruct } from "../../core/plugin.js";

// Inline marks whose delimiters are child nodes: **strong**, *emphasis*,
// ~~strike~~, `code`. The delimiters hide unless a caret touches the mark.
// A mark that spans lines keeps its delimiters visible, because hiding them
// would join or split lines visually.
export function delimited_mark(options: {
  name: string;
  nodes: readonly string[];
  delimiter: string;
  class_name: (node_name: string) => string;
  tag: (node_name: string) => string;
  literal?: boolean;
}): InlineConstruct {
  return {
    kind: "inline",
    name: options.name,
    nodes: options.nodes,
    ...(options.literal ? { literal: true } : {}),
    decorate(node, render) {
      render.mark(node.from, node.to, options.class_name(node.name));
      decorate_delimiters(node, options.delimiter, render);
    },
    render_static(node, context) {
      const element = document.createElement(options.tag(node.name));
      context.render_children(node, element);
      return element;
    },
  };
}

function decorate_delimiters(
  node: SyntaxNodeRef,
  delimiter: string,
  render: Render,
) {
  const single_line =
    render.state.doc.lineAt(node.from).number ===
    render.state.doc.lineAt(node.to).number;
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.name !== delimiter) continue;
    if (render.reveal || !single_line)
      render.mark(child.from, child.to, "md-syntax");
    else render.hide(child.from, child.to);
  }
}

export const emphasis = delimited_mark({
  name: "emphasis",
  nodes: ["Emphasis", "StrongEmphasis"],
  delimiter: "EmphasisMark",
  class_name: (name) =>
    name === "StrongEmphasis" ? "md-strong" : "md-emphasis",
  tag: (name) => (name === "StrongEmphasis" ? "strong" : "em"),
});

export const inline_code = delimited_mark({
  name: "inline_code",
  nodes: ["InlineCode"],
  delimiter: "CodeMark",
  class_name: () => "md-inline-code",
  tag: () => "code",
  literal: true,
});

export const strikethrough = delimited_mark({
  name: "strikethrough",
  nodes: ["Strikethrough"],
  delimiter: "StrikethroughMark",
  class_name: () => "md-strike",
  tag: () => "del",
});

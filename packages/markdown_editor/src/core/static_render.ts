import type { SyntaxNode } from "@lezer/common";
import type { EditorState } from "@codemirror/state";
import { guard } from "./inline_rendering.js";
import { get_registry, type StaticContext } from "./plugin.js";
import { surface_highlights, type SurfaceHighlight } from "./surface.js";

// Render inline Markdown in [from, to) as plain DOM, for places without a live
// editor such as inactive table cells. Each inline construct supplies its own
// render_static. Unknown nodes render their children, and delimiter nodes
// (names ending in "Mark") are dropped. Surface highlights, such as find
// matches, wrap the text they cover.
export function render_static(
  state: EditorState,
  node: SyntaxNode | null,
  from: number,
  to: number,
  parent: HTMLElement,
) {
  const registry = get_registry(state);
  const highlights = state
    .facet(surface_highlights)
    .flatMap((source) => source(state))
    .filter((highlight) => highlight.from < to && highlight.to > from);

  const append_text = (
    target: HTMLElement,
    text_from: number,
    text_to: number,
  ) => {
    append_highlighted(target, state, text_from, text_to, highlights);
  };
  const render_range = (
    container: SyntaxNode | null,
    range_from: number,
    range_to: number,
    target: HTMLElement,
  ) => {
    let cursor = range_from;
    for (
      let child = container?.firstChild ?? null;
      child;
      child = child.nextSibling
    ) {
      if (child.to <= range_from || child.from >= range_to) continue;
      if (child.from > cursor) append_text(target, cursor, child.from);
      render_node(child, target);
      cursor = child.to;
    }
    if (cursor < range_to) append_text(target, cursor, range_to);
  };
  const context: StaticContext = {
    state,
    render_children: (child, target) => {
      render_range(child.node, child.from, child.to, target);
    },
  };
  const render_node = (current: SyntaxNode, target: HTMLElement) => {
    for (const construct of registry.by_node.get(current.name) ?? []) {
      if (construct.kind !== "inline" || !construct.render_static) continue;
      const render = construct.render_static;
      const output = guard(construct, () => render(current, context));
      if (output) {
        target.append(output);
        return;
      }
    }
    if (current.name.endsWith("Mark")) return;
    render_range(current, current.from, current.to, target);
  };

  if (node && node.from <= from && node.to >= to)
    render_range(node, from, to, parent);
  else append_text(parent, from, to);
}

function append_highlighted(
  target: HTMLElement,
  state: EditorState,
  from: number,
  to: number,
  highlights: readonly SurfaceHighlight[],
) {
  let cursor = from;
  for (const highlight of highlights) {
    if (highlight.to <= cursor || highlight.from >= to) continue;
    const start = Math.max(cursor, highlight.from);
    const end = Math.min(to, highlight.to);
    if (start > cursor)
      target.append(document.createTextNode(state.sliceDoc(cursor, start)));
    const mark = document.createElement("span");
    mark.className = highlight.class_name;
    mark.textContent = state.sliceDoc(start, end);
    target.append(mark);
    cursor = end;
  }
  if (cursor < to)
    target.append(document.createTextNode(state.sliceDoc(cursor, to)));
}

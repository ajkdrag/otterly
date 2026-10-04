import type { SyntaxNode } from "@lezer/common";
import {
  EditorSelection,
  countColumn,
  type ChangeSpec,
  type StateCommand,
} from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import {
  column_at,
  continuation_prefix,
  continues_paragraph,
  is_literal,
  line_container,
  type Layer,
  type LineContainer,
} from "../../core/context.js";
import type { KeyContext } from "../../core/keys.js";
import type { ContainerSpec, LineConstruct } from "../../core/plugin.js";
import type { Render } from "../../core/inline_rendering.js";
import { paragraph_gap, set_gap_after } from "./prose.js";

// "> " with up to three spaces before it and one optional space after.
// @Incomplete: a tab after ">" counts as the optional space. CommonMark treats
// part of the tab as content; we do not split tabs.
const quote_pattern = /^[ \t]{0,3}>[ \t]?/;

const quote_match: ContainerSpec["match_first"] = (text, offset, tab_size) => {
  const marker = quote_pattern.exec(text.slice(offset));
  if (!marker) return null;
  const to = offset + marker[0].length;
  return {
    to,
    marker: marker[0],
    content_column: column_at(text, to, tab_size),
  };
};

export const quote_container: ContainerSpec = {
  match_first: quote_match,
  match_continuation: (text, offset, _open, tab_size) =>
    quote_match(text, offset, tab_size),
  continuation(layer) {
    return layer.opening_marker.replace(/[ \t]*$/, "") + " ";
  },
};

export const blockquote: LineConstruct = {
  kind: "line",
  name: "blockquote",
  nodes: ["Blockquote"],
  container: quote_container,
  decorate(node, render) {
    render.wrap(node.node, "md-quote");
    set_gap_after(render, node.node, paragraph_gap);
  },
  decorate_layer: decorate_quote_layer,
  keys: {
    Enter: (context) => continue_or_lift_quote(context),
    Backspace: (context) => lift_quote_at_text_start(context),
    "Mod-Enter": (context) => insert_paragraph_after_quote(context),
  },
  insert: [
    {
      id: "blockquote",
      label: "Blockquote",
      detail: "Indented quote",
      icon: "❝",
      aliases: ["quote", "blockquote", "cite"],
      lines: ["> "],
    },
  ],
};

// The innermost quote around the line. A blank row inside a quoted list still
// has the list item open inside the quote, so this is not always the
// innermost layer.
function innermost_quote_layer(container: LineContainer): Layer | undefined {
  const layers = container.open_layers;
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index];
    if (layer?.construct.name === "blockquote") return layer;
  }
  return undefined;
}

// Enter on an empty quote line leaves one quote level. Enter elsewhere starts
// a new quoted line. List items inside the quote handle Enter first because
// they are the innermost construct.
function continue_or_lift_quote(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1) return false;
  const container = context.line();
  const layer = innermost_quote_layer(container);
  if (!layer || layer.node.from !== context.node.from) return false;
  if (range.from < container.content_from) return false;
  if (container.blank && !container.lazy && range.empty)
    return lift_quote_line(context, container, layer, true);
  const insert = "\n" + continuation_prefix(container);
  context.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

function lift_quote_at_text_start(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || !range.empty) return false;
  const container = context.line();
  const layer = container.layers.at(-1);
  if (
    layer?.construct.name !== "blockquote" ||
    layer.node.from !== context.node.from
  )
    return false;
  if (range.head !== container.content_from) return false;
  return lift_quote_line(context, container, layer, false);
}

// Remove this quote's marker from the line, along with any blank list
// continuation inside it. The outer containers keep their exact spelling.
// When the line would become a lazy continuation of the quoted paragraph
// above, a blank boundary line goes in first.
function lift_quote_line(
  context: KeyContext,
  container: LineContainer,
  layer: Layer,
  clear_line: boolean,
): boolean {
  const { state } = context;
  const { line, layers } = container;
  const index = layers.indexOf(layer);
  if (index < 0) return false;
  const outer = layers.slice(0, index);
  const retained = state.sliceDoc(line.from, outer.at(-1)?.to ?? line.from);
  const boundary =
    layer.node.from < line.from && continues_paragraph(state, line)
      ? continuation_prefix(container, outer.length).trimEnd() + "\n"
      : "";
  const from = line.from;
  const to = clear_line ? line.to : layer.to;
  const insert = boundary + retained;
  context.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length),
    userEvent: clear_line ? "input" : "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

// Mod-Enter inside a quote starts a separate paragraph after the outermost
// quote. A single newline would still be a lazy continuation of the quote.
function insert_paragraph_after_quote(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || !range.empty) return false;
  if (is_literal(state, range.head)) return false;
  let outermost: SyntaxNode = context.node;
  for (let node = context.node.parent; node; node = node.parent) {
    if (node.name === "Blockquote") outermost = node;
  }
  const line = state.doc.lineAt(outermost.to);
  const insert = "\n\n";
  context.dispatch({
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length),
    userEvent: "input.quote.exit",
    scrollIntoView: true,
  });
  return true;
}

// Hide each quote marker unless the caret is in the line's prefix. The
// quote's wrapper draws the bar and box instead.
function decorate_quote_layer(
  layer: Layer,
  container: LineContainer,
  render: Render,
) {
  if (!layer.lazy && !render.prefix_revealed(container))
    render.hide(layer.from, layer.to);
}

// Tab outside lists indents each selected line's text by one indent unit,
// after its container prefix. Shift-Tab removes up to one unit there.
export function indent_text(deeper: boolean): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;
    const unit = state.facet(indentUnit);
    const unit_columns = countColumn(unit, state.tabSize);
    const changes: ChangeSpec[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const last = state.doc.lineAt(range.to).number;
      for (
        let number = state.doc.lineAt(range.from).number;
        number <= last;
        number++
      ) {
        if (seen.has(number)) continue;
        seen.add(number);
        const container = line_container(state, number);
        if (is_literal(state, container.content_from)) return false;
        if (deeper) {
          changes.push({ from: container.content_from, insert: unit });
          continue;
        }
        const text = state.sliceDoc(container.content_from, container.line.to);
        const whitespace = /^[ \t]*/.exec(text)?.[0] ?? "";
        let count = 0;
        while (
          count < whitespace.length &&
          countColumn(whitespace.slice(0, count), state.tabSize) < unit_columns
        )
          count++;
        if (count)
          changes.push({
            from: container.content_from,
            to: container.content_from + count,
          });
      }
    }
    if (!changes.length) return deeper;
    const change_set = state.changes(changes);
    dispatch(
      state.update({
        changes: change_set,
        selection: state.selection.map(change_set, 1),
        userEvent: deeper ? "input.indent" : "delete.dedent",
      }),
    );
    return true;
  };
}

import type { SyntaxNode } from "@lezer/common";
import {
  EditorSelection,
  EditorState,
  Facet,
  countColumn,
  type ChangeSpec,
  type StateCommand,
} from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import {
  column_at,
  continuation_prefix,
  continues_paragraph,
  current_tree,
  is_literal,
  line_container,
  type Layer,
  type LineContainer,
} from "../../core/context.js";
import { is_rich } from "../../core/editor_mode.js";
import type { KeyContext } from "../../core/keys.js";
import type { ContainerSpec, LineConstruct } from "../../core/plugin.js";
import type { Render } from "../../core/inline_rendering.js";

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

// CommonMark reads a non-blank line right under a quote or list item
// paragraph as a lazy continuation of that paragraph, and GFM reads it as
// another row of a table above. On an empty line the caret is drawn below
// that block, so the first text typed or pasted there would jump into it. A
// blank line goes in above first, the same boundary Enter on an empty quote
// line leaves, in the same undo step.
//
// Text that starts like a block marker goes in as typed, since the user may
// be starting a quote, heading, list, fence or table there. That is wider
// than what CommonMark lets interrupt a paragraph: a lone "-" or "1" does
// not, but it is usually the start of a list item.
//
// @Incomplete: IME composition is left alone. Changing lines around an open
// composition breaks it in the browser.
const starts_block_marker = /^\s*[>#\-*+`~|0-9]/;

// Vim turns the boundary off. Its . replays every change of an insert as
// typed text, so it would put the blank line in again at the next caret.
export const lazy_line_boundary_off = Facet.define<boolean, boolean>({
  combine: (values) => values.includes(true),
});

export const lazy_line_boundary = EditorState.transactionFilter.of(
  (transaction) => {
    const state = transaction.startState;
    if (
      !(
        transaction.isUserEvent("input.type") ||
        transaction.isUserEvent("input.paste")
      ) ||
      transaction.isUserEvent("input.type.compose") ||
      state.selection.ranges.length !== 1 ||
      !is_rich(state) ||
      state.facet(lazy_line_boundary_off)
    )
      return transaction;
    const inserts: { from: number; to: number; text: string }[] = [];
    transaction.changes.iterChanges((from, to, _from_b, _to_b, inserted) => {
      inserts.push({ from, to, text: inserted.toString() });
    });
    const [insert] = inserts;
    if (inserts.length !== 1 || !insert || insert.from !== insert.to)
      return transaction;
    const line = state.doc.lineAt(insert.from);
    if (
      /\S/.test(line.text) ||
      !/\S/.test(insert.text) ||
      starts_block_marker.test(insert.text) ||
      !joins_block_above(transaction.state, line.number)
    )
      return transaction;
    // The text went in at or after line.from, so the end of the line above
    // has the same position in the new document.
    return [
      transaction,
      { changes: { from: line.from - 1, insert: "\n" }, sequential: true },
    ];
  },
);

// The line's text belongs to a block that starts above it: a lazy line of a
// quote or list item paragraph, or a row of a table. A plain paragraph line
// has no missing prefix, so a soft break there stays as it is.
function joins_block_above(state: EditorState, line_number: number): boolean {
  const line = state.doc.line(line_number);
  if (continues_paragraph(state, line)) return line_container(state, line).lazy;
  for (
    let node: SyntaxNode | null = current_tree(state, line.to).resolveInner(
      line.to,
      -1,
    );
    node;
    node = node.parent
  ) {
    // GFM's table node. Without the gfm plugin there is none.
    if (node.name === "Table") return node.from < line.from;
  }
  return false;
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

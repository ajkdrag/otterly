import type { SyntaxNode } from "@lezer/common";
import {
  EditorSelection,
  countColumn,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
} from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import {
  column_at,
  continuation_prefix,
  continues_paragraph,
  current_tree,
  line_container,
  sibling_prefix,
  type Layer,
  type LineContainer,
} from "../../core/context.js";
import type { KeyContext } from "../../core/keys.js";
import type { ContainerSpec, LineConstruct } from "../../core/plugin.js";
import type { Render } from "../../core/inline_rendering.js";

// "- ", "12. ", "* [x] ". CommonMark allows up to three spaces before the
// marker and one to four columns after it. More than four starts indented
// code inside the item, so the content column is one past the marker.
const marker_pattern = /^[ \t]{0,3}([-+*]|\d{1,9}[.)])(?=[ \t]|$)/;
const task_pattern = /^\[[ xX]\][ \t]*/;

export const list_container: ContainerSpec = {
  match_first(text, offset, tab_size) {
    const marker = marker_pattern.exec(text.slice(offset));
    if (!marker) return null;
    const marker_end = offset + marker[0].length;
    const space = /^[ \t]*/.exec(text.slice(marker_end))?.[0] ?? "";
    const marker_column = column_at(text, marker_end, tab_size);
    const space_columns =
      column_at(text, marker_end + space.length, tab_size) - marker_column;
    const blank = marker_end + space.length === text.length;
    const content_column =
      blank || space_columns === 0 || space_columns > 4
        ? marker_column + 1
        : marker_column + space_columns;
    let to = space_columns > 4 ? marker_end + 1 : marker_end + space.length;
    // A task marker belongs to the item's prefix for editing: Backspace at
    // the task text lifts the item, and the caret skips the checkbox.
    const task = task_pattern.exec(text.slice(to));
    if (task) to += task[0].length;
    return { to, marker: text.slice(offset, to), content_column };
  },
  match_continuation(text, offset, open, tab_size) {
    if (text.slice(offset).trim() === "")
      return {
        to: text.length,
        marker: text.slice(offset),
        content_column: open.content_column,
      };
    let position = offset;
    while (
      position < text.length &&
      (text[position] === " " || text[position] === "\t") &&
      column_at(text, position, tab_size) < open.content_column
    )
      position++;
    if (column_at(text, position, tab_size) < open.content_column) return null;
    return {
      to: position,
      marker: text.slice(offset, position),
      content_column: open.content_column,
    };
  },
  continuation(layer) {
    return " ".repeat(Math.max(0, layer.content_column - layer.column));
  },
  next_sibling(layer) {
    return next_marker(layer.opening_marker);
  },
};

// The marker for the item after `marker`: the next number for ordered lists,
// and an unchecked box for tasks. Keeps the text column where it was.
export function next_marker(marker: string): string {
  const parts =
    /^([ \t]*)(?:([-+*])|(\d+)([.)]))([ \t]*)(\[[ xX]\][ \t]*)?/.exec(marker);
  if (!parts) return marker;
  const [, indent = "", bullet, number, delimiter = ".", space = " ", task] =
    parts;
  const head = bullet ?? `${String(Number(number) + 1)}${delimiter}`;
  const old_head = bullet ?? `${number ?? ""}${delimiter}`;
  const spacing = " ".repeat(
    Math.max(1, space.length - (head.length - old_head.length)),
  );
  return indent + head + spacing + (task ? "[ ] " : "");
}

export const list_item: LineConstruct = {
  kind: "line",
  name: "list_item",
  nodes: ["ListItem"],
  container: list_container,
  decorate_layer: decorate_list_layer,
  keys: {
    Enter: (context) => continue_list_item(context),
    Backspace: (context) => lift_at_text_start(context),
    Tab: (context) => change_list_indent(context.view, true),
    "Shift-Tab": (context) => change_list_indent(context.view, false),
  },
  insert: [
    {
      id: "bullet",
      label: "Bullet List",
      detail: "Unordered list of items",
      icon: "•",
      aliases: ["bullet", "list", "unordered", "ul", "items"],
      lines: ["- "],
    },
    {
      id: "ordered",
      label: "Ordered List",
      detail: "Numbered list of items",
      icon: "#",
      aliases: ["ordered", "list", "numbered", "ol", "number"],
      lines: ["1. "],
    },
  ],
};

function continue_list_item(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1) return false;
  const container = context.line();
  const layer = innermost_list_layer(container);
  if (!layer || layer.node.from !== context.node.from) return false;
  if (range.from < container.content_from) return false;
  // An empty item lifts one level: it becomes a sibling of its parent, or
  // leaves the list at the top level.
  if (container.blank && layer.first_line && range.empty)
    return change_list_indent(context.view, false);
  // A blank row after an item is not an item. Leave Enter to the containers
  // around the list, so an empty quoted row leaves the quote (QUOTE-002).
  if (container.blank) return false;
  let insert = "\n" + sibling_prefix(container);
  if (is_loose(state, layer.node))
    insert =
      "\n" +
      continuation_prefix(
        container,
        container.open_layers.length - 1,
      ).trimEnd() +
      insert;
  const changes: ChangeSpec[] = [{ from: range.from, to: range.to, insert }];
  changes.push(...renumber_following(state, layer.node));
  const change_set = state.changes(changes);
  context.dispatch({
    changes: change_set,
    selection: EditorSelection.cursor(
      change_set.mapPos(range.from, -1) + insert.length,
    ),
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

function lift_at_text_start(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || !range.empty) return false;
  const container = context.line();
  const layer = innermost_list_layer(container);
  if (!layer?.first_line || layer.node.from !== context.node.from) return false;
  if (range.head !== container.content_from) return false;
  return change_list_indent(context.view, false);
}

function innermost_list_layer(container: LineContainer): Layer | undefined {
  for (let index = container.open_layers.length - 1; index >= 0; index--) {
    const layer = container.open_layers[index];
    if (layer?.construct.name === "list_item") return layer;
    if (layer && !layer.lazy) return undefined;
  }
  return undefined;
}

// A loose list has blank lines between its items. Enter keeps that spacing.
function is_loose(state: EditorState, item: SyntaxNode): boolean {
  const next = item.nextSibling;
  const previous = item.prevSibling;
  const blank_between = (from: number, to: number) =>
    state.doc.lineAt(to).number - state.doc.lineAt(from).number > 1;
  if (next?.name === "ListItem" && blank_between(item.to, next.from))
    return true;
  return previous?.name === "ListItem" && blank_between(previous.to, item.from);
}

// Ordered siblings that count up from this item shift by one, like a word
// processor. Lists that do not count up (all "1." for example) are left alone.
function renumber_following(
  state: EditorState,
  item: SyntaxNode,
): ChangeSpec[] {
  const mark = item.getChild("ListMark");
  if (!mark) return [];
  const current = Number.parseInt(state.sliceDoc(mark.from, mark.to), 10);
  if (Number.isNaN(current)) return [];
  const changes: ChangeSpec[] = [];
  let expected = current + 1;
  for (let sibling = item.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (sibling.name !== "ListItem") continue;
    const sibling_mark = sibling.getChild("ListMark");
    if (!sibling_mark) break;
    const text = state.sliceDoc(sibling_mark.from, sibling_mark.to);
    const number = Number.parseInt(text, 10);
    if (number !== expected) break;
    changes.push({
      from: sibling_mark.from,
      to: sibling_mark.from + String(number).length,
      insert: String(number + 1),
    });
    expected++;
  }
  return changes;
}

type ListCommandTarget = Parameters<StateCommand>[0];

// Tab nests each selected item's subtree under its previous sibling. Shift-Tab
// lifts it one level, or removes the marker at the top level. Every line of
// the subtree moves together, inside any surrounding quote.
export function change_list_indent(
  target: ListCommandTarget,
  deeper: boolean,
): boolean {
  const { state, dispatch } = target;
  if (state.readOnly) return false;
  const items = selected_items(state);
  if (!items) return false;
  const changes: ChangeSpec[] = [];
  const indentation = new Map<number, number>();
  for (const item of items) {
    const first = state.doc.lineAt(item.from);
    const first_container = line_container(state, first);
    const depth = first_container.open_layers.findIndex(
      (layer) => layer.node.from === item.from,
    );
    const own = first_container.open_layers[depth];
    if (!own) return false;
    let amount: number;
    let remove_marker = false;
    if (deeper) {
      let previous = item.prevSibling;
      while (previous && previous.name !== "ListItem")
        previous = previous.prevSibling;
      // A first item has no sibling to become its parent. Consume Tab so it
      // does not fall through and turn the item into indented code.
      if (!previous) return true;
      const previous_layer = line_container(
        state,
        state.doc.lineAt(previous.from),
      ).open_layers[depth];
      if (!previous_layer) return false;
      amount =
        indentation.get(previous.from) ??
        previous_layer.content_column - previous_layer.column;
      indentation.set(item.from, amount);
    } else {
      const parent =
        depth > 0 ? first_container.open_layers[depth - 1] : undefined;
      remove_marker = parent?.construct.name !== "list_item";
      amount = remove_marker ? 0 : own.column - (parent?.column ?? 0);
    }
    const last = state.doc.lineAt(item.to).number;
    for (let number = first.number; number <= last; number++) {
      const line = state.doc.line(number);
      const container =
        number === first.number ? first_container : line_container(state, line);
      if (container.layers.length < depth) continue;
      // New indentation goes right before the item's marker, after the outer
      // layers. Lifting removes it from inside the parent item's continuation.
      const outer = container.layers[depth - 1];
      const from =
        !deeper && !remove_marker && outer
          ? outer.from
          : (outer?.to ?? line.from);
      if (deeper) {
        if (line.text.slice(from - line.from).trim() === "") continue;
        changes.push({ from, insert: " ".repeat(amount) });
      } else if (number === first.number && remove_marker) {
        // A blank separator stops the lifted text from staying a lazy
        // continuation of the item above. Keep the surrounding quote.
        const retained = state.sliceDoc(line.from, from);
        const separator = continues_paragraph(state, line)
          ? continuation_prefix(container, depth).trimEnd() + "\n"
          : "";
        changes.push({
          from: line.from,
          to: container.content_from,
          insert: separator + retained,
        });
      } else {
        const remove = remove_marker ? own.content_column - own.column : amount;
        changes.push(remove_columns(state, line.text, line.from, from, remove));
      }
    }
  }
  if (!changes.length) return false;
  const change_set = state.changes(changes);
  dispatch(
    state.update({
      changes: change_set,
      selection: state.selection.map(change_set, 1),
      userEvent: "input.indent",
      scrollIntoView: true,
    }),
  );
  return true;
}

function remove_columns(
  state: EditorState,
  text: string,
  line_from: number,
  from: number,
  columns: number,
): ChangeSpec {
  const whitespace = /^[ \t]*/.exec(text.slice(from - line_from))?.[0] ?? "";
  let count = 0;
  while (
    count < whitespace.length &&
    countColumn(whitespace.slice(0, count), state.tabSize) < columns
  )
    count++;
  const removed = countColumn(whitespace.slice(0, count), state.tabSize);
  return {
    from,
    to: from + count,
    insert: " ".repeat(Math.max(0, removed - columns)),
  };
}

// The root items touched by the selection. A child inside a selected parent
// moves with its parent and is not shifted twice.
function selected_items(state: EditorState): SyntaxNode[] | null {
  const end = Math.max(...state.selection.ranges.map((range) => range.to));
  const tree = current_tree(state, end);
  const items = new Map<number, SyntaxNode>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(
      range.empty ? range.to : Math.max(range.from, range.to - 1),
    );
    for (let number = first.number; number <= last.number; number++) {
      const line = state.doc.line(number);
      const item = enclosing_item(tree.resolveInner(line.to, -1));
      if (!item) return null;
      items.set(item.from, item);
    }
  }
  const selected = [...items.values()].sort(
    (left, right) => left.from - right.from,
  );
  return selected.filter(
    (item, index) =>
      !selected.slice(0, index).some((parent) => parent.to >= item.to),
  );
}

function enclosing_item(node: SyntaxNode | null): SyntaxNode | null {
  for (let current = node; current; current = current.parent) {
    if (current.name === "FencedCode" || current.name === "CodeBlock")
      return null;
    if (current.name === "ListItem") return current;
  }
  return null;
}

// Line styling and markers. A list line is indented by its depth. The item's
// first line hangs its marker in the gutter. Continuation indentation is
// hidden because the line padding already places the text.
function decorate_list_layer(
  layer: Layer,
  container: LineContainer,
  render: Render,
) {
  // Only the innermost list layer styles the line.
  if (innermost_list_layer(container) !== layer) return;
  const { line } = container;
  // A bare "-" or "1." with nothing after it is still being typed. It stays
  // plain text until the space that makes it a list item (TYPE-001).
  if (layer.first_line && /^[ \t]*(?:[-+*]|\d+[.)])$/.test(layer.marker))
    return;
  const depth = render.layer_depth(container, layer);
  render.line(line.from, `md-list-line md-list-depth-${String(depth)}`, {
    "--md-list-depth": String(depth),
  });
  if (container.blank && !layer.first_line) {
    // Blank rows inside a list keep the list's left edge but no marker.
    if (!render.prefix_revealed(container)) render.hide(layer.from, layer.to);
    return;
  }
  if (layer.lazy) return;
  const revealed = render.prefix_revealed(container);
  if (layer.first_line) {
    render.line(line.from, "md-list-item-start md-list-marker-line", {
      "--md-list-prefix-chars": String(layer.to - layer.from),
    });
    if (revealed) {
      render.line(line.from, "md-list-source-visible");
      return;
    }
    const task_from = content_after_marker(layer);
    const task = /^\[[ xX]\]/.exec(render.text(task_from, layer.to));
    // A task's checkbox stands in for its bullet. While the caret touches
    // the brackets the checkbox is not drawn yet, so the bullet stays and the
    // brackets show as text in the body column (TYPE-004).
    const checkbox_drawn =
      task && !render.touches(task_from, task_from + task[0].length);
    if (checkbox_drawn) render.hide(layer.from, task_from);
    else
      render.replace(
        layer.from,
        task ? task_from : layer.to,
        new ListMarker(marker_symbol(layer.marker, depth)),
      );
  } else if (!revealed) {
    render.hide(layer.from, layer.to);
  }
}

// Where the task box starts: after the marker and its spacing.
function content_after_marker(layer: Layer): number {
  const marker =
    /^[ \t]*(?:[-+*]|\d+[.)])[ \t]*/.exec(layer.marker)?.[0] ?? layer.marker;
  return layer.from + marker.length;
}

function marker_symbol(marker: string, depth: number): string {
  const ordered = /\d+[.)]/.exec(marker);
  if (ordered) return ordered[0];
  if (depth === 2) return "◦";
  if (depth >= 3) return "▪";
  return "•";
}

class ListMarker extends WidgetType {
  constructor(readonly symbol: string) {
    super();
  }
  eq(other: ListMarker) {
    return this.symbol === other.symbol;
  }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "md-list-marker";
    marker.textContent = this.symbol;
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }
}

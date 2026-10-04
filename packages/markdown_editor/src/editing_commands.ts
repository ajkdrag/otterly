import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
} from "@codemirror/lang-markdown";
import { indentLess, indentMore } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  Prec,
  countColumn,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
} from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { get_frontmatter_end } from "./frontmatter_range.js";

const continue_markdown: StateCommand = ({ state, dispatch }) => {
  if (
    state.readOnly ||
    state.selection.ranges.some(
      (range) => range.from < get_frontmatter_end(state),
    )
  )
    return false;
  if (!ensureSyntaxTree(state, state.selection.main.to, 50)) return false;
  if (lift_empty_list_item({ state, dispatch })) return true;
  if (lift_empty_quote({ state, dispatch })) return true;
  let changed = false;
  insertNewlineContinueMarkup({
    state,
    dispatch(transaction) {
      // Some mixed quote/list indentation makes the upstream command replace a
      // marker with itself. Let the ordinary Enter binding run in that case.
      if (
        transaction.newDoc.eq(state.doc) &&
        transaction.newSelection.eq(state.selection)
      )
        return;
      dispatch(transaction);
      changed = true;
    },
  });
  return changed;
};

export const markdown_container_keymap = Prec.high(
  keymap.of([
    { key: "Enter", run: continue_markdown },
    { key: "Backspace", run: remove_container_backward },
  ]),
);

type MarkdownNode = ReturnType<typeof syntaxTree>["topNode"];

function remove_container_backward(
  target: Parameters<StateCommand>[0],
): boolean {
  const { state, dispatch } = target;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty || range.head < get_frontmatter_end(state)) return false;
  const tree = ensureSyntaxTree(state, range.head, 50);
  if (!tree) return false;
  const node = tree.resolveInner(range.head, -1);
  if (inside_literal(node)) return false;
  const item = enclosing_list_item(node);
  if (item && range.head === list_text_start(state, item))
    return change_list_indent(target, false);
  const line = state.doc.lineAt(range.head);
  const prefix = state.sliceDoc(line.from, range.head);
  const quote = /^(?:[ \t]{0,3}>[ \t]?)+$/.exec(prefix);
  if (quote) {
    const depth = (prefix.match(/>/g) ?? []).length;
    const prefix_end = quote_prefix_end(prefix, depth - 1) ?? 0;
    const from = line.from + prefix_end;
    let container = node;
    while (container.parent && container.name !== "Blockquote")
      container = container.parent;
    const needs_separator =
      container.from < line.from &&
      !/^[ \t>]*$/.test(state.doc.line(line.number - 1).text);
    // Removing only '>' still leaves a lazy continuation of the previous quote.
    const insert = needs_separator ? "\n" + prefix.slice(0, prefix_end) : "";
    dispatch(
      state.update({
        changes: { from, to: range.head, insert },
        selection: EditorSelection.cursor(from + insert.length),
        userEvent: "delete.backward",
        scrollIntoView: true,
      }),
    );
    return true;
  }
  return deleteMarkupBackward(target);
}

function enclosing_list_item(node: MarkdownNode): MarkdownNode | null {
  for (
    let current: MarkdownNode | null = node;
    current;
    current = current.parent
  ) {
    if (current.name === "FencedCode" || current.name === "CodeBlock")
      return null;
    if (current.name === "ListItem") return current;
  }
  return null;
}

function list_text_start(state: EditorState, item: MarkdownNode) {
  const mark = item.getChild("ListMark");
  if (!mark) return item.from;
  const suffix = state.sliceDoc(mark.to, state.doc.lineAt(mark.to).to);
  return (
    mark.to + (/^[ \t]*(?:\[[ xX]\][ \t]*)?/.exec(suffix)?.[0].length ?? 0)
  );
}

function list_content_indent(state: EditorState, mark: MarkdownNode): number {
  const line = state.doc.lineAt(mark.from);
  const before = state.sliceDoc(line.from, mark.to);
  const whitespace =
    /^[ \t]+/.exec(state.sliceDoc(mark.to, line.to))?.[0] ?? " ";
  const columns =
    countColumn(before + whitespace, state.tabSize) -
    countColumn(before, state.tabSize);
  // CommonMark uses one through four whitespace columns after a marker as the
  // item's content indent. More than four starts an indented code block.
  return mark.to - mark.from + (columns <= 4 ? columns : 1);
}

function change_list_indent(
  target: Parameters<StateCommand>[0],
  deeper: boolean,
): boolean {
  const { state, dispatch } = target;
  if (state.readOnly) return false;
  const end = Math.max(...state.selection.ranges.map((range) => range.to));
  const tree = ensureSyntaxTree(state, end, 50);
  if (!tree) return false;
  const items = new Map<number, MarkdownNode>();
  for (const range of state.selection.ranges) {
    if (range.from < get_frontmatter_end(state)) return false;
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(
      range.empty ? range.to : Math.max(range.from, range.to - 1),
    );
    for (let number = first.number; number <= last.number; number++) {
      const line = state.doc.line(number);
      const item = enclosing_list_item(tree.resolveInner(line.to, -1));
      if (!item) return false;
      items.set(item.from, item);
    }
  }
  const selected = [...items.values()].sort((a, b) => a.from - b.from);
  const roots = selected.filter(
    (item, index) =>
      !selected.slice(0, index).some((parent) => parent.to >= item.to),
  );
  const changes: ChangeSpec[] = [];
  const indentation = new Map<number, number>();
  for (const item of roots) {
    const prefix = list_item_prefix(state, item.from);
    const mark = item.getChild("ListMark");
    if (!prefix || !mark) return false;
    let amount: number;
    let remove_marker = false;
    if (deeper) {
      let previous = item.prevSibling;
      while (previous && previous.name !== "ListItem")
        previous = previous.prevSibling;
      // A first item has no sibling to become its parent. Consuming Tab avoids
      // accidentally turning it into an indented code block via the fallback.
      if (!previous) return true;
      const previous_mark = previous.getChild("ListMark");
      if (!previous_mark) return false;
      amount =
        indentation.get(previous.from) ??
        list_content_indent(state, previous_mark);
      indentation.set(item.from, amount);
    } else {
      const parent = item.parent?.parent;
      const parent_prefix =
        parent?.name === "ListItem"
          ? list_item_prefix(state, parent.from)
          : null;
      remove_marker = !parent_prefix;
      amount = !parent_prefix
        ? list_text_start(state, item) - item.from
        : countColumn(prefix.indent, state.tabSize) -
          countColumn(parent_prefix.indent, state.tabSize);
    }
    const first = state.doc.lineAt(item.from);
    const last = state.doc.lineAt(item.to);
    const quote_depth = (prefix.quote.match(/>/g) ?? []).length;
    for (let number = first.number; number <= last.number; number++) {
      const line = state.doc.line(number);
      const start = quote_prefix_end(line.text, quote_depth);
      if (start === null) continue;
      const from = line.from + start;
      if (deeper) {
        changes.push({ from, insert: " ".repeat(amount) });
      } else if (number === first.number && remove_marker) {
        // A blank separator stops the lifted paragraph from remaining a lazy
        // continuation of the preceding item. Preserve the existing quote.
        const separator = item.prevSibling ? "\n" + prefix.quote : "";
        changes.push({
          from,
          to: list_text_start(state, item),
          insert: separator,
        });
      } else {
        const whitespace = /^[ \t]*/.exec(line.text.slice(start))?.[0] ?? "";
        let count = 0;
        while (
          count < whitespace.length &&
          countColumn(whitespace.slice(0, count), state.tabSize) < amount
        )
          count++;
        const removed = countColumn(whitespace.slice(0, count), state.tabSize);
        changes.push({
          from,
          to: from + count,
          insert: " ".repeat(Math.max(0, removed - amount)),
        });
      }
    }
  }
  if (!changes.length) return false;
  dispatch(
    state.update({ changes, userEvent: "input.indent", scrollIntoView: true }),
  );
  return true;
}

function quote_prefix_end(line: string, depth: number): number | null {
  let end = 0;
  for (let index = 0; index < depth; index++) {
    const marker = /^[ \t]*>[ \t]?/.exec(line.slice(end));
    if (!marker) return null;
    end += marker[0].length;
  }
  return end;
}

function lift_empty_quote({ state, dispatch }: Parameters<StateCommand>[0]) {
  const selection = state.selection.main;
  if (state.selection.ranges.length !== 1 || !selection.empty) return false;
  const line = state.doc.lineAt(selection.head);
  if (
    selection.head !== line.to ||
    !/^(?:[ \t]{0,3}>[ \t]?)+[ \t]*$/.test(line.text)
  )
    return false;
  let container = syntaxTree(state).resolveInner(selection.head, -1);
  if (inside_literal(container)) return false;
  while (container.parent && container.name !== "Blockquote")
    container = container.parent;
  const depth = (line.text.match(/>/g) ?? []).length;
  const retained =
    depth === 1 && enclosing_list_item(container)
      ? (/^[ \t]*/.exec(line.text)?.[0] ?? "")
      : line.text.slice(0, quote_prefix_end(line.text, depth - 1) ?? 0);
  const needs_separator =
    container.from < line.from &&
    !/^[ \t>]*$/.test(state.doc.line(line.number - 1).text);
  // Keep a blank separator so following text cannot lazily rejoin the quote.
  const insert = needs_separator ? retained + "\n" + retained : retained;
  dispatch(
    state.update({
      changes: { from: line.from, to: selection.head, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
}

const lift_empty_list_item: StateCommand = ({ state, dispatch }) => {
  const selection = state.selection.main;
  if (
    state.selection.ranges.length !== 1 ||
    !selection.empty ||
    selection.from < get_frontmatter_end(state)
  )
    return false;
  const tree = ensureSyntaxTree(state, selection.head, 50);
  if (!tree) return false;
  let item: ReturnType<typeof syntaxTree>["topNode"] | null = tree.resolveInner(
    selection.head,
    -1,
  );
  while (item && item.name !== "ListItem") {
    if (["FencedCode", "CodeBlock"].includes(item.name)) return false;
    item = item.parent;
  }
  if (!item) return false;
  const line = state.doc.lineAt(selection.head);
  const empty_marker = /(?:[-+*]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]*$/.exec(
    line.text,
  );
  if (selection.head !== line.to || !empty_marker) return false;
  const marker_from = line.from + empty_marker.index;
  const current = list_item_prefix(state, marker_from);
  if (!current) return false;
  // An empty indented '-' can temporarily parse as a Setext underline in an
  // ordered item. Treat this explicit empty marker as the nested item being
  // edited; Enter lifts it without rewriting the preceding paragraph.
  let parent = item.from < line.from ? item : (item.parent?.parent ?? null);
  while (parent && parent.name !== "ListItem" && parent.name !== "Blockquote")
    parent = parent.parent;
  let insert = current.quote;
  if (parent?.name === "ListItem") {
    const previous = list_item_prefix(state, parent.from);
    const mark = parent.getChild("ListMark");
    if (
      !previous ||
      !mark ||
      countColumn(previous.indent, state.tabSize) >=
        countColumn(current.indent, state.tabSize)
    )
      return false;
    let marker = state.sliceDoc(mark.from, mark.to);
    marker = marker.replace(/^\d+/, (value) => String(Number(value) + 1));
    const task = /^[ \t]+\[[ xX]\]/.test(
      state.sliceDoc(mark.to, state.doc.lineAt(mark.to).to),
    );
    insert += previous.indent + marker + (task ? " [ ] " : " ");
  } else if (item.parent && item.parent.from < line.from) {
    const previous_line = state.doc.line(line.number - 1);
    // Without a blank separator, the next typed paragraph is still a lazy
    // continuation of the preceding list item, including inside a quote.
    if (!/^[ \t>]*$/.test(previous_line.text)) insert += "\n" + current.quote;
  }
  dispatch(
    state.update({
      changes: { from: line.from, to: selection.head, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
};

function list_item_prefix(state: EditorState, from: number) {
  const prefix = state.sliceDoc(state.doc.lineAt(from).from, from);
  const quote_end = prefix.lastIndexOf(">");
  const end =
    quote_end < 0 ? 0 : quote_end + 1 + (prefix[quote_end + 1] === " " ? 1 : 0);
  const quote = prefix.slice(0, end);
  const indent = prefix.slice(end);
  // Quote indentation may differ between lines; compare list indentation only
  // after the last quote marker, preserving the current line's quote spelling.
  return /^[ \t>]*$/.test(quote) && /^[ \t]*$/.test(indent)
    ? { quote, indent }
    : null;
}

const insert_hard_break: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly || state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  const frontmatter_end = get_frontmatter_end(state);
  if (range.from < frontmatter_end) return false;
  const tree = ensureSyntaxTree(state, range.to, 100);
  if (!tree) return false;
  const resolved = tree.resolveInner(range.from, -1);
  if (inside_literal(resolved) || !inside_paragraph(resolved)) return false;
  const start_line = state.doc.lineAt(range.from);
  const end_line = state.doc.lineAt(range.to);
  if (start_line.number !== end_line.number) return false;

  const before = state.sliceDoc(start_line.from, range.from);
  const spaces = before.endsWith("\\")
    ? ""
    : " ".repeat(Math.max(0, 2 - (before.match(/ +$/)?.[0].length ?? 0)));
  const continuation = continuation_prefix(start_line.text, state.tabSize);
  const insertion = `${spaces}\n${continuation}`;
  const changes = { from: range.from, to: range.to, insert: insertion };
  const position = range.from + insertion.length;
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.cursor(position),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
};

export const markdown_editing_keymap = keymap.of([
  { key: "Mod-Enter", run: insert_paragraph_after_quote },
  { key: "Shift-Enter", run: insert_hard_break },
  {
    key: "Tab",
    run: (view) => change_list_indent(view, true) || indentMore(view),
    shift: (view) => change_list_indent(view, false) || indentLess(view),
  },
]);

function insert_paragraph_after_quote({
  state,
  dispatch,
}: Parameters<StateCommand>[0]): boolean {
  const range = state.selection.main;
  if (
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    !range.empty ||
    range.head < get_frontmatter_end(state)
  )
    return false;
  const tree = ensureSyntaxTree(state, range.head, 50);
  if (!tree) return false;
  let node: MarkdownNode | null = tree.resolveInner(range.head, -1);
  let quote: MarkdownNode | null = null;
  for (; node; node = node.parent) {
    if (["FencedCode", "CodeBlock", "HTMLBlock"].includes(node.name))
      return false;
    if (node.name === "Blockquote") quote = node;
  }
  if (!quote) return false;
  const line = state.doc.lineAt(quote.to);
  // A single newline looks outside the quote while empty, but typed prose is
  // still its lazy continuation. Keep a real blank paragraph boundary.
  const insert = "\n\n";
  dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      userEvent: "input.quote.exit",
      scrollIntoView: true,
    }),
  );
  return true;
}

function inside_literal(node: ReturnType<typeof syntaxTree>["topNode"]) {
  for (
    let current: typeof node | null = node;
    current;
    current = current.parent
  )
    if (["InlineCode", "FencedCode", "CodeBlock"].includes(current.name))
      return true;
  return false;
}

function inside_paragraph(node: ReturnType<typeof syntaxTree>["topNode"]) {
  for (
    let current: typeof node | null = node;
    current;
    current = current.parent
  )
    if (current.name === "Paragraph" || current.name === "Task") return true;
  return false;
}

function continuation_prefix(line: string, tab_size: number) {
  const quote = /^(?:[ \t]{0,3}>[ \t]?)+/.exec(line)?.[0] ?? "";
  const rest = line.slice(quote.length);
  const list = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.exec(rest)?.[0];
  if (list) {
    const indentation =
      countColumn(quote + list, tab_size) - countColumn(quote, tab_size);
    return `${quote}${" ".repeat(indentation)}`;
  }
  if (quote) return quote;
  return /^[ \t]*/.exec(line)?.[0] ?? "";
}

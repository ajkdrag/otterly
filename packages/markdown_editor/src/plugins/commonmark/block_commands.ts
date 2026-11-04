import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  ChangeSet,
  type ChangeSpec,
  type EditorState,
  type Line,
  type SelectionRange,
} from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import {
  continuation_prefix,
  continues_paragraph,
  current_tree,
  is_literal_block,
  line_container,
  type Layer,
  type LineContainer,
} from "../../core/context.js";
import { remove_columns } from "./lists.js";

type HeadingLevel = 1 | 2 | 3;
export type ListKind = "bullet" | "ordered" | "task";
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
// Same block nodes as prose.ts's literal HTML construct, plus code and tables.
const literal_block_names =
  /^(FencedCode|CodeBlock|Table|HTMLBlock|CommentBlock|ProcessingInstructionBlock)$/;
export type TextBlock = {
  from: number;
  to: number;
  node: SyntaxNode | null;
  prefix: string;
};

export const block_style_keys: readonly KeyBinding[] = [
  { key: "Mod-Alt-1", run: set_block_style(1) },
  { key: "Mod-Alt-2", run: set_block_style(2) },
  { key: "Mod-Alt-3", run: set_block_style(3) },
  { key: "Mod-Alt-7", run: toggle_list("ordered") },
  { key: "Mod-Alt-8", run: toggle_list("bullet") },
];

// Turns every line the selection touches into an item of `kind`, or removes
// the markers when every item line already is one. One decision for the
// whole selection, so a mixed selection becomes all `kind` first.
//
//   one        - one        one
//   two    ->  - two    ->  two
//
//   three      - three      three
//
// Blank lines stay and never get a marker, so blank-separated lines make a
// loose list. Ordered numbering continues across them, but restarts when the
// line enters or leaves a quote. Headings, rules and callout titles keep
// their text and get no marker. An item's indented continuation lines move
// with it when the marker width changes.
//
// An unselected line directly under a new item stays in its paragraph, so it
// renders as part of the item ("1. one\ntwo"). Deliberate: it was part of the
// same paragraph before the toggle too.
export function toggle_list(kind: ListKind) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const lines = selected_lines(state);
    if (!lines.length) return false;
    const all_blank = lines.every((line) => line_container(state, line).blank);
    const selected_numbers = new Set(lines.map((line) => line.number));
    const targets: ListLine[] = [];
    for (const line of lines) {
      const target = classify_list_line(
        state,
        line,
        all_blank,
        selected_numbers,
      );
      if (target) targets.push(target);
    }
    const edited = targets.filter((target) => target.role !== "boundary");
    if (!edited.length) return false;
    const remove = edited.every(
      (target) => target.item && list_kind(target.item.marker) === kind,
    );
    const removed_items = new Set(
      remove ? edited.map((target) => target.item?.node.from) : [],
    );
    // Where the text of the previous removed item ends up: its open
    // containers minus the items whose markers come off.
    let previous_parent = "";
    const changes: ChangeSpec[] = [];
    // Next ordered number and marker style per nesting depth. Numbering a
    // shallower line restarts every deeper level, so each parent's children
    // count from 1. Both start from the list directly above the selection, so
    // the new items continue it instead of starting a second list.
    const counters: number[] = [];
    const styles: string[] = [];
    seed_from_list_above(state, lines[0], counters, styles);
    const line_above = (lines[0]?.number ?? 1) - 1;
    let scope = line_above
      ? quote_scope(line_container(state, line_above))
      : "";
    for (const target of targets) {
      // Lists in different quotes are different lists, so a quote boundary
      // restarts numbering like a heading does.
      const target_scope = quote_scope(target.container);
      if (target.role === "boundary" || target_scope !== scope) {
        counters.length = 0;
        styles.length = 0;
      }
      scope = target_scope;
      if (target.role === "boundary") continue;
      const { container, item } = target;
      const line = container.line;
      if (remove) {
        if (!item) continue;
        const depth = container.open_layers.indexOf(item);
        const blank_line =
          continuation_prefix(container, depth).trimEnd() + "\n";
        const parent = container.open_layers
          .slice(0, depth)
          .filter((layer) => !removed_items.has(layer.node.from))
          .map((layer) => layer.node.from)
          .join();
        // Without a blank line the text would become a lazy continuation of
        // the item above and render glued onto it. A selected item above
        // only joins this one into a paragraph when both texts land in the
        // same container: "- a\n  - b\n- c" must not put "c" inside "a".
        const separate_from_above =
          !selected_numbers.has(line.number - 1) || parent !== previous_parent;
        previous_parent = parent;
        if (separate_from_above && continues_paragraph(state, line))
          changes.push({ from: line.from, insert: blank_line });
        // The same happens below: "2." or an empty item cannot interrupt the
        // paragraph this item turns into.
        const below = state.doc.lineAt(item.node.to).number + 1;
        if (
          below <= state.doc.lines &&
          !selected_numbers.has(below) &&
          joins_paragraph_above(state, below)
        )
          changes.push({
            from: state.doc.line(below).from,
            insert: blank_line,
          });
        changes.push({ from: item.from, to: item.to });
        changes.push(
          ...reindent_item_body(state, item, item.column - item.content_column),
        );
        continue;
      }
      const depth = container.layers.filter(
        (layer) => layer.construct.name === "list_item" && layer !== item,
      ).length;
      counters.length = depth + 1;
      styles.length = depth + 1;
      const number = (counters[depth] ?? 0) + 1;
      counters[depth] = number;
      if (item) {
        styles[depth] ??= item.marker.trimStart();
        if (list_kind(item.marker) === kind && kind !== "ordered") continue;
        const marker = list_marker(kind, item.marker, number);
        if (state.sliceDoc(item.from, item.to) === marker) continue;
        changes.push({ from: item.from, to: item.to, insert: marker });
        const width = marker.replace(/\[ \] $/, "").length;
        changes.push(
          ...reindent_item_body(
            state,
            item,
            width - (item.content_column - item.column),
          ),
        );
        continue;
      }
      // An empty item cannot interrupt a paragraph, and "- " right under one
      // is a setext underline. A blank line keeps the paragraph above intact.
      if (container.blank && continues_paragraph(state, line))
        changes.push({
          from: line.from,
          insert: continuation_prefix(container).trimEnd() + "\n",
        });
      const indent = /^[ \t]*/.exec(
        state.sliceDoc(container.content_from, line.to),
      )?.[0];
      changes.push({
        from: container.content_from,
        to: container.content_from + (indent?.length ?? 0),
        insert:
          missing_quote_prefix(container) +
          list_marker(kind, styles[depth] ?? "", number),
      });
    }
    if (!changes.length) return false;
    const change_set = state.changes(changes);
    view.dispatch({
      changes: change_set,
      selection: state.selection.map(change_set, 1),
      userEvent: "input.format.block",
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

// item:     first line of a list item. `item` is its innermost list layer.
// plain:    a text line with no item of its own. It gets a marker.
// boundary: a heading, rule or callout title. It ends ordered numbering.
// Blank lines are not listed. An item's indented continuation lines are not
// listed when the item is selected too. They only move with their item
// (reindent_item_body).
type ListLine = {
  role: "item" | "plain" | "boundary";
  container: LineContainer;
  item: Layer | null;
};

function classify_list_line(
  state: EditorState,
  line: Line,
  all_blank: boolean,
  selected_numbers: ReadonlySet<number>,
): ListLine | null {
  const container = line_container(state, line);
  const innermost = container.open_layers.at(-1);
  const is_list = innermost?.construct.name === "list_item";
  // An empty item ("- ") is blank too, but its marker still has to change.
  const empty_item = is_list && innermost.first_line && !innermost.lazy;
  if (container.blank && !all_blank && !empty_item) return null;
  // A lazy line has no prefix for its list, so it is plain text that happens
  // to continue the item's paragraph. It becomes an item of its own.
  if (is_list && innermost.lazy)
    return { role: "plain", container, item: null };
  if (is_list && innermost.first_line)
    return { role: "item", container, item: innermost };
  // A continuation line selected without its item gets a marker at its
  // content column, so it becomes an item nested in that item.
  if (is_list) {
    const item_line = state.doc.lineAt(innermost.node.from).number;
    if (selected_numbers.has(item_line)) return null;
    return { role: "plain", container, item: null };
  }
  if (is_boundary_line(state, container))
    return { role: "boundary", container, item: null };
  return { role: "plain", container, item: null };
}

function is_boundary_line(state: EditorState, container: LineContainer) {
  const { line } = container;
  if (
    line_touches_node(
      state,
      line,
      /^(?:ATXHeading\d|SetextHeading\d|HorizontalRule)$/,
    )
  )
    return true;
  // "> [!note] Title" opens a callout. A marker there would turn the title
  // into a list item and the callout back into a plain quote.
  const quote = container.layers.at(-1);
  return (
    quote?.construct.name === "blockquote" &&
    quote.first_line &&
    /^\[![A-Za-z]+\]/.test(state.sliceDoc(container.content_from, line.to))
  );
}

// "- [x] " -> "task", "3) " -> "ordered", "* " -> "bullet".
function list_kind(marker: string): ListKind {
  if (/\[[ xX]\]/.test(marker)) return "task";
  return /\d/.test(marker) ? "ordered" : "bullet";
}

// The new marker for a line, keeping the old marker's indent, bullet
// character and ordered delimiter where it has them.
function list_marker(kind: ListKind, old_marker: string, number: number) {
  const parts = /^([ \t]*)(?:([-+*])|\d+([.)]))?/.exec(old_marker);
  const indent = parts?.[1] ?? "";
  const bullet = parts?.[2] ?? "-";
  if (kind === "ordered")
    return `${indent}${String(number)}${parts?.[3] ?? "."} `;
  return `${indent}${bullet} ${kind === "task" ? "[ ] " : ""}`;
}

// Fills counters and styles from the lists the line above `first` sits in,
// one entry per nesting depth.
function seed_from_list_above(
  state: EditorState,
  first: Line | undefined,
  counters: number[],
  styles: string[],
) {
  if (!first || first.number === 1) return;
  const above = line_container(state, first.number - 1);
  const items = above.open_layers.filter(
    (layer) => layer.construct.name === "list_item",
  );
  items.forEach((layer, depth) => {
    styles[depth] = layer.opening_marker.trimStart();
    const start = /^\s*(\d+)/.exec(layer.opening_marker)?.[1];
    if (start) counters[depth] = Number(start);
  });
}

// The quotes around a line, by node. Lazy lines count their open quotes.
function quote_scope(container: LineContainer): string {
  return container.open_layers
    .filter((layer) => layer.construct.name !== "list_item")
    .map((layer) => layer.node.from)
    .join();
}

// CommonMark lets a list item interrupt a paragraph only when it is not empty
// and, if ordered, starts at 1. Any other item on the line below a paragraph
// becomes a lazy continuation of it.
function joins_paragraph_above(state: EditorState, number: number): boolean {
  const container = line_container(state, number);
  const item = container.layers.find(
    (layer) => layer.construct.name === "list_item" && layer.first_line,
  );
  if (!item) return false;
  if (container.blank) return true;
  const start = /^\s*(\d+)/.exec(item.marker)?.[1];
  return start !== undefined && Number(start) !== 1;
}

// A lazy quoted line has lost its "> ". A marker there would start a list
// outside the quote, so the quote prefixes come back first. Lazy list layers
// stay out: the line becomes a sibling item, not a continuation.
function missing_quote_prefix(container: LineContainer): string {
  const missing = container.open_layers.slice(container.layers.length);
  while (missing.at(-1)?.construct.name === "list_item") missing.pop();
  return missing
    .map((layer) => layer.construct.container?.continuation(layer) ?? "")
    .join("");
}

// Moves every later line of the item by `delta` columns, so continuation text
// and nested items stay inside the item after its marker changed width.
function reindent_item_body(
  state: EditorState,
  item: Layer,
  delta: number,
): ChangeSpec[] {
  if (!delta) return [];
  const changes: ChangeSpec[] = [];
  const first = state.doc.lineAt(item.node.from).number;
  const last = state.doc.lineAt(item.node.to).number;
  for (let number = first + 1; number <= last; number++) {
    const container = line_container(state, number);
    if (container.blank) continue;
    const layer = container.layers.find(
      (candidate) => candidate.node.from === item.node.from,
    );
    if (!layer) continue;
    const { line } = container;
    changes.push(
      delta > 0
        ? { from: layer.from, insert: " ".repeat(delta) }
        : remove_columns(state, line.text, line.from, layer.from, -delta),
    );
  }
  return changes;
}

// Every line the selection touches, once, in document order. A range that
// ends at the start of a line does not take that line. Returns [] when the
// editor is read-only or a line is literal (code, table, HTML, frontmatter).
function selected_lines(state: EditorState): Line[] {
  if (state.readOnly || !state.facet(EditorView.editable)) return [];
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from);
    let last = state.doc.lineAt(range.to);
    if (!range.empty && range.to === last.from && last.number > first.number)
      last = state.doc.line(last.number - 1);
    for (let number = first.number; number <= last.number; number++)
      lines.set(number, state.doc.line(number));
  }
  const sorted = [...lines.values()].sort((a, b) => a.number - b.number);
  const literal = sorted.some(
    (line) =>
      is_literal_block(state, line.from) ||
      is_literal_block(state, line.to) ||
      line_touches_node(state, line, literal_block_names),
  );
  return literal ? [] : sorted;
}

function line_touches_node(state: EditorState, line: Line, names: RegExp) {
  let found = false;
  current_tree(state, line.to).iterate({
    from: line.from,
    to: line.to,
    enter(ref) {
      if (ref.from > line.to || ref.to < line.from) return false;
      if (names.test(ref.name)) found = true;
      return !found;
    },
  });
  return found;
}

export function set_block_style(style: HeadingLevel) {
  return (view: EditorView): boolean => {
    const blocks = selected_blocks(view);
    const changes: ChangeSpec[] = [];
    for (const block of blocks) {
      if (is_first_list_paragraph(block.node)) continue;
      if (
        block.node?.name === `ATXHeading${String(style)}` ||
        block.node?.name === `SetextHeading${String(style)}`
      )
        continue;
      const marks = block.node?.getChildren("HeaderMark") ?? [];
      const opening = marks.find((mark) => mark.from === block.from);
      changes.push({
        from: block.from,
        to: opening?.to ?? block.from,
        insert: "#".repeat(style) + (opening ? "" : " "),
      });
      const setext = block.node?.name.startsWith("Setext");
      for (const mark of marks) {
        if (mark === opening) continue;
        const line = view.state.doc.lineAt(mark.from);
        changes.push({
          from: setext ? line.from - 1 : Math.max(block.from, mark.from - 1),
          to: mark.to,
        });
      }
      // ATX headings have one source line. Join soft line breaks so conversion
      // cannot accidentally leave the remainder as body text.
      for (
        let number = view.state.doc.lineAt(block.from).number + 1;
        number <= view.state.doc.lineAt(block.to).number;
        number++
      ) {
        const line = view.state.doc.line(number);
        if (setext && number === view.state.doc.lineAt(block.to).number)
          continue;
        const prefix_length = line.text.startsWith(block.prefix)
          ? block.prefix.length
          : 0;
        const hard_break = block.node
          ?.getChildren("HardBreak")
          .find((mark) => mark.to === line.from);
        changes.push({
          from: hard_break?.from ?? line.from - 1,
          to: line.from + prefix_length,
          insert: " ",
        });
      }
    }
    if (!changes.length) return false;
    const change_set = view.state.changes(changes);
    view.dispatch({
      changes: change_set,
      selection: view.state.selection.map(change_set, 1),
      userEvent: "input.format.block",
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

export function selected_blocks(view: EditorView): TextBlock[] {
  const blocks = new Map<number, TextBlock>();
  for (const group of selected_blocks_by_range(view))
    for (const block of group) blocks.set(block.from, block);
  return [...blocks.values()].sort((left, right) => left.from - right.from);
}

// The paragraphs and headings each selection range touches, one sorted list
// per range. Two ranges in one paragraph both list it. Returns [] when the
// editor is read-only or any range touches a literal block.
export function selected_blocks_by_range(view: EditorView): TextBlock[][] {
  const { state } = view;
  if (state.readOnly || !state.facet(EditorView.editable)) return [];
  const last = state.selection.ranges[state.selection.ranges.length - 1];
  if (!last) return [];
  const tree = ensureSyntaxTree(state, last.to, 50);
  if (!tree) return [];
  const groups: TextBlock[][] = [];
  for (const range of state.selection.ranges) {
    const group = range_blocks(state, tree, range);
    if (!group) return [];
    groups.push(group);
  }
  return groups;
}

function range_blocks(
  state: EditorState,
  tree: ReturnType<typeof syntaxTree>,
  range: SelectionRange,
): TextBlock[] | null {
  const blocks = new Map<number, TextBlock>();
  if (is_literal_block(state, range.from)) return null;
  let literal = false;
  tree.iterate({
    from: range.from,
    to: range.to,
    enter(ref) {
      const intersects = range.empty
        ? ref.from <= range.from && ref.to >= range.to
        : ref.from < range.to && ref.to > range.from;
      if (!intersects) return false;
      if (literal_block_names.test(ref.name)) {
        literal = true;
        return false;
      }
      if (!/^(Paragraph|(?:ATX|Setext)Heading[1-6])$/.test(ref.name)) return;
      const line = state.doc.lineAt(ref.from);
      blocks.set(ref.from, {
        from: ref.from,
        to: ref.to,
        node: ref.node,
        prefix: state.sliceDoc(line.from, ref.from),
      });
      return false;
    },
  });
  if (literal) return null;
  if (
    range.empty &&
    ![...blocks.values()].some(
      (block) => block.from <= range.from && block.to >= range.to,
    )
  ) {
    const line = state.doc.lineAt(range.from);
    if (!line.text.trim())
      blocks.set(line.from, {
        from: line.from,
        to: line.to,
        node: null,
        prefix: "",
      });
  }
  return [...blocks.values()].sort((left, right) => left.from - right.from);
}

// Block shortcuts skip the first paragraph of a list item (spec FMT-007).
// "- # Title" is valid Markdown, so this is a carried-over product choice from
// the Milkdown editor, not a syntax rule. Lezer keeps the marker as the item's
// first child and that paragraph as the second.
export function is_first_list_paragraph(node: SyntaxNode | null): boolean {
  const item = node?.parent;
  return (
    item?.name === "ListItem" &&
    item.firstChild?.nextSibling?.from === node?.from
  );
}

export function code_content(
  state: EditorState,
  block: TextBlock,
  document: Document,
) {
  const changes: ChangeSpec[] = [];
  const remove = (from: number, to: number, insert = "") => {
    changes.push({ from: from - block.from, to: to - block.from, insert });
  };
  const node = block.node;
  if (node && /Heading/.test(node.name)) {
    const marks = node.getChildren("HeaderMark");
    for (const mark of marks) {
      const line = state.doc.lineAt(mark.from);
      if (/Setext/.test(node.name))
        remove(Math.max(block.from, line.from - 1), line.to);
      else if (mark.from === block.from)
        remove(
          mark.from,
          mark.to + (state.sliceDoc(mark.to, mark.to + 1) === " " ? 1 : 0),
        );
      else remove(Math.max(block.from, mark.from - 1), mark.to);
    }
  }
  for (
    let number = state.doc.lineAt(block.from).number + 1;
    number <= state.doc.lineAt(block.to).number;
    number++
  ) {
    const line = state.doc.line(number);
    if (
      node?.name.startsWith("Setext") &&
      number === state.doc.lineAt(block.to).number
    )
      continue;
    if (block.prefix && line.text.startsWith(block.prefix))
      remove(line.from, line.from + block.prefix.length);
  }
  if (node) {
    const visit = (current: SyntaxNode) => {
      if (current.name === "Image") {
        remove(current.from, current.to);
        return;
      }
      if (current.name === "InlineCode") {
        const opening = current.firstChild;
        const closing = current.lastChild;
        if (!opening || !closing || opening === closing) return;
        const content = state.sliceDoc(opening.to, closing.from);
        const padding =
          /^ .* $/s.test(content) && /[^ \r\n]/.test(content) ? 1 : 0;
        remove(opening.from, opening.to + padding);
        remove(closing.from - padding, closing.to);
        for (let at = opening.to; at < closing.from; at++)
          if (state.sliceDoc(at, at + 1) === "\n") remove(at, at + 1, " ");
        return;
      }
      if (current.name === "Autolink") {
        remove(current.from, current.from + 1);
        remove(current.to - 1, current.to);
        return;
      }
      if (current.name === "Link") {
        const marks = current.getChildren("LinkMark");
        if (marks[0] && marks[1]) {
          remove(marks[0].from, marks[0].to);
          remove(marks[1].from, current.to);
        }
        for (let child = current.firstChild; child; child = child.nextSibling)
          if (
            child.to <= (marks[1]?.from ?? current.to) &&
            child.name !== "LinkMark"
          )
            visit(child);
        return;
      }
      if (current.name === "HardBreak") {
        remove(current.from, current.to, "\n");
        return;
      }
      if (/^(EmphasisMark|StrikethroughMark|CodeMark)$/.test(current.name)) {
        remove(current.from, current.to);
        return;
      }
      if (current.name === "Escape") {
        remove(current.from, current.from + 1);
        return;
      }
      if (current.name === "Entity") {
        const decoder = document.createElement("textarea");
        decoder.innerHTML = state.sliceDoc(current.from, current.to);
        remove(current.from, current.to, decoder.value);
        return;
      }
      for (let child = current.firstChild; child; child = child.nextSibling)
        visit(child);
    };
    visit(node);
  }
  const source = state.doc.slice(block.from, block.to);
  const content_changes = ChangeSet.of(changes, source.length);
  return { text: content_changes.apply(source).toString(), content_changes };
}

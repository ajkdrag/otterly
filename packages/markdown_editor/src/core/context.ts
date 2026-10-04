import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { SyntaxNode, Tree } from "@lezer/common";
import type { EditorState, Line, TransactionSpec } from "@codemirror/state";
import {
  get_registry,
  type Construct,
  type ContainerMatch,
  type LineConstruct,
} from "./plugin.js";

// One container level on one line: a quote marker, a list marker, or the
// indentation that continues a list item.
export type Layer = {
  construct: LineConstruct;
  node: SyntaxNode;
  from: number;
  to: number;
  // Tab-expanded columns, counted from the start of the line.
  column: number;
  content_column: number;
  marker: string;
  // The container's marker on its first line. Equal to `marker` there.
  opening_marker: string;
  first_line: boolean;
  // The container is open here but its prefix is missing (a lazy line). Only
  // present in `open_layers`.
  lazy: boolean;
};

export type LineContainer = {
  line: Line;
  // Layers whose prefix is present on this line, outermost first.
  layers: readonly Layer[];
  // Every open container, outermost first. Lazy lines have more open layers
  // than matched ones. New lines inside the container use these.
  open_layers: readonly Layer[];
  content_from: number;
  lazy: boolean;
  blank: boolean;
};

const resolve_budget_ms = 50;

export function current_tree(state: EditorState, upto: number): Tree {
  return ensureSyntaxTree(state, upto, resolve_budget_ms) ?? syntaxTree(state);
}

// This is the only place that parses a line's container prefix. It follows
// CommonMark's container matching: walk the open containers from outermost to
// innermost and let each one match its marker or continuation at the current
// offset. The first container that does not match makes the line lazy.
export function line_container(
  state: EditorState,
  line_or_number: Line | number,
): LineContainer {
  const line =
    typeof line_or_number === "number"
      ? state.doc.line(line_or_number)
      : line_or_number;
  const open = open_containers(state, line);
  const layers: Layer[] = [];
  const open_layers: Layer[] = [];
  let offset = 0;
  let lazy = false;
  for (const { node, construct } of open) {
    const spec = construct.container;
    if (!spec) continue;
    const starts_here = node.from >= line.from;
    const match = lazy
      ? null
      : starts_here
        ? spec.match_first(line.text, offset, state.tabSize)
        : spec.match_continuation(
            line.text,
            offset,
            first_line_layer(state, node, construct),
            state.tabSize,
          );
    if (!match) {
      lazy = true;
      open_layers.push({ ...first_line_layer(state, node, construct), lazy });
      continue;
    }
    const layer = make_layer(
      state,
      line,
      node,
      construct,
      offset,
      match,
      starts_here,
    );
    if (!starts_here)
      layer.opening_marker = first_line_layer(state, node, construct).marker;
    layers.push(layer);
    open_layers.push(layer);
    offset = match.to;
  }
  return {
    line,
    layers,
    open_layers,
    content_from: line.from + offset,
    lazy,
    blank: line.text.slice(offset).trim() === "",
  };
}

// Prefix text for a new line that stays inside every open container. A list
// item continues with spaces up to its content column.
export function continuation_prefix(
  container: LineContainer,
  depth = container.open_layers.length,
): string {
  let prefix = "";
  for (const layer of container.open_layers.slice(0, depth)) {
    prefix += layer.construct.container?.continuation(layer) ?? "";
  }
  return prefix;
}

// Prefix for a new sibling of the innermost container, such as the next list
// item. Outer containers continue as usual.
export function sibling_prefix(container: LineContainer): string {
  const layers = container.open_layers;
  const innermost = layers.at(-1);
  if (!innermost) return "";
  const spec = innermost.construct.container;
  const own =
    spec?.next_sibling?.(innermost) ?? spec?.continuation(innermost) ?? "";
  return continuation_prefix(container, layers.length - 1) + own;
}

// Text typed on a line that follows a paragraph line becomes a lazy
// continuation of that paragraph, even without the container prefix. Edits
// that leave a container insert a blank line first when this is true.
export function continues_paragraph(state: EditorState, line: Line): boolean {
  if (line.number === 1) return false;
  const previous = state.doc.line(line.number - 1);
  const previous_container = line_container(state, previous);
  if (previous_container.blank) return false;
  const tree = current_tree(state, previous.to);
  for (
    let node: SyntaxNode | null = tree.resolveInner(previous.to, -1);
    node;
    node = node.parent
  ) {
    if (node.name === "Paragraph" || node.name === "Task") return true;
  }
  return false;
}

// Replace [from, to) on one line with several lines. Every line after the
// first gets the continuation prefix of the line's containers, so a block
// inserted inside a quote stays inside the quote.
export function insert_lines(
  state: EditorState,
  from: number,
  to: number,
  lines: readonly string[],
  caret: readonly [number, number] = [0, lines[0]?.length ?? 0],
): TransactionSpec {
  const line = state.doc.lineAt(from);
  const prefix = continuation_prefix(line_container(state, line));
  const insert = lines
    .map((text, index) => (index === 0 ? text : prefix + text))
    .join("\n");
  const [caret_line, caret_column] = caret;
  let anchor = from;
  for (let index = 0; index < caret_line; index++)
    anchor += (lines[index]?.length ?? 0) + 1 + prefix.length;
  anchor += caret_column;
  return {
    changes: { from, to, insert },
    selection: { anchor },
  };
}

export type ContextEntry = { node: SyntaxNode; construct: Construct };

// The constructs around a position, innermost first.
export function markdown_context(
  state: EditorState,
  position: number,
): ContextEntry[] {
  const registry = get_registry(state);
  const entries: ContextEntry[] = [];
  const tree = current_tree(state, position);
  for (
    let node: SyntaxNode | null = tree.resolveInner(position, -1);
    node;
    node = node.parent
  ) {
    for (const construct of registry.by_node.get(node.name) ?? [])
      entries.push({ node, construct });
  }
  return entries;
}

// Literal blocks only (fenced code, frontmatter, raw HTML), not literal
// inline nodes such as inline code. Block commands use this.
export function is_literal_block(
  state: EditorState,
  position: number,
): boolean {
  const registry = get_registry(state);
  const tree = current_tree(state, position);
  for (
    let node: SyntaxNode | null = tree.resolveInner(position, -1);
    node;
    node = node.parent
  ) {
    if (!registry.literal_nodes.has(node.name)) continue;
    if (
      registry.by_node
        .get(node.name)
        ?.some((construct) => construct.kind !== "inline")
    )
      return true;
  }
  return false;
}

export function is_literal(state: EditorState, position: number): boolean {
  const literal = get_registry(state).literal_nodes;
  const tree = current_tree(state, position);
  for (
    let node: SyntaxNode | null = tree.resolveInner(position, -1);
    node;
    node = node.parent
  ) {
    if (literal.has(node.name)) return true;
  }
  return false;
}

export function has_ancestor(
  node: SyntaxNode | null,
  names: readonly string[],
): boolean {
  for (let parent = node?.parent; parent; parent = parent.parent)
    if (names.includes(parent.name)) return true;
  return false;
}

type OpenContainer = { node: SyntaxNode; construct: LineConstruct };

function open_containers(state: EditorState, line: Line): OpenContainer[] {
  const containers = get_registry(state).containers;
  const open: OpenContainer[] = [];
  current_tree(state, line.to).iterate({
    from: line.from,
    to: line.to,
    enter(reference) {
      // Parents are entered before children, so `open` is outermost first.
      const construct = containers.get(reference.name);
      if (construct && reference.from <= line.to && reference.to >= line.from)
        open.push({ node: reference.node, construct });
    },
  });
  return open;
}

function first_line_layer(
  state: EditorState,
  node: SyntaxNode,
  construct: LineConstruct,
): Layer {
  const line = state.doc.lineAt(node.from);
  const offset = node.from - line.from;
  const match = construct.container?.match_first(
    line.text,
    offset,
    state.tabSize,
  ) ?? {
    to: offset,
    marker: "",
    content_column: offset,
  };
  return make_layer(state, line, node, construct, offset, match, true);
}

function make_layer(
  state: EditorState,
  line: Line,
  node: SyntaxNode,
  construct: LineConstruct,
  offset: number,
  match: ContainerMatch,
  first_line: boolean,
): Layer {
  return {
    construct,
    node,
    from: line.from + offset,
    to: line.from + match.to,
    column: column_at(line.text, offset, state.tabSize),
    content_column: match.content_column,
    marker: match.marker,
    opening_marker: match.marker,
    first_line,
    lazy: false,
  };
}

export function column_at(
  text: string,
  offset: number,
  tab_size: number,
): number {
  let column = 0;
  for (let index = 0; index < offset && index < text.length; index++) {
    column =
      text[index] === "\t"
        ? column + tab_size - (column % tab_size)
        : column + 1;
  }
  return column;
}

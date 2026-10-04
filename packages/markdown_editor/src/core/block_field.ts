import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  Annotation,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { line_container, type Layer, type LineContainer } from "./context.js";
import { get_registry, type BlockConstruct } from "./plugin.js";
import { reveal_freeze, touches } from "./reveal.js";
import { complete_tree } from "./syntax.js";
import { guard } from "./inline_rendering.js";

// A block always covers whole lines, including any container prefixes on
// them. CodeMirror's height map stays correct only when a block replacement
// starts and ends at line boundaries.
export type Block = {
  readonly construct: BlockConstruct;
  readonly from: number;
  readonly to: number;
  readonly node_from: number;
  readonly node_to: number;
  readonly source: string;
  // Containers open on the first line. The widget draws their borders and
  // indentation, because the replaced lines no longer have line styles.
  readonly container: LineContainer;
  // UI state that is not Markdown, such as a code block's height.
  readonly view_state: unknown;
};

// Transactions dispatched by an editing surface carry this annotation.
export const surface_input = Annotation.define<boolean>();

// Keep a block as source until the caret leaves it.
export const edit_block_source = StateEffect.define<number>();
// End construction early, for example after Enter completes a fence header.
export const finish_block_construction = StateEffect.define();
// Rebuild every block widget, for example after a theme change that a
// widget draws into its DOM.
export const refresh_blocks = StateEffect.define();
export const patch_block_view_state = StateEffect.define<{
  from: number;
  value: unknown;
}>();
export const replace_block_view_states = StateEffect.define<{
  construct: string;
  states: readonly unknown[];
}>();

type BlockFieldValue = {
  blocks: readonly Block[];
  decorations: DecorationSet;
  // The block being typed or edited as source, by its start position.
  constructing: number | null;
};

export const block_field = StateField.define<BlockFieldValue>({
  create(state) {
    const blocks = find_blocks(state, []);
    return {
      blocks,
      decorations: build_decorations(state, blocks, null),
      constructing: null,
    };
  },
  update(value, transaction) {
    const { state } = transaction;
    let blocks = value.blocks;
    let changed =
      transaction.startState.readOnly !== state.readOnly ||
      syntaxTree(transaction.startState) !== syntaxTree(state);
    if (transaction.docChanged || changed) {
      blocks = find_blocks(state, map_blocks(blocks, transaction));
      changed = true;
    }
    for (const effect of transaction.effects) {
      if (effect.is(refresh_blocks)) changed = true;
      if (effect.is(patch_block_view_state)) {
        blocks = blocks.map((block) =>
          block.from === effect.value.from
            ? { ...block, view_state: effect.value.value }
            : block,
        );
        changed = true;
      } else if (effect.is(replace_block_view_states)) {
        let index = 0;
        blocks = blocks.map((block) =>
          block.construct.name === effect.value.construct
            ? { ...block, view_state: effect.value.states[index++] ?? null }
            : block,
        );
        changed = true;
      }
    }
    const constructing = next_constructing(value, blocks, transaction);
    if (constructing !== value.constructing) changed = true;
    // Caret-revealed blocks follow the selection.
    if (
      transaction.selection &&
      !state.field(reveal_freeze, false)?.frozen &&
      blocks.some((block) => block.construct.reveal === "caret")
    )
      changed = true;
    if (
      transaction.startState.field(reveal_freeze, false)?.frozen !==
      state.field(reveal_freeze, false)?.frozen
    )
      changed = true;
    if (!changed) return value;
    return {
      blocks,
      decorations: build_decorations(state, blocks, constructing),
      constructing,
    };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
  ],
});

export function get_blocks(state: EditorState): readonly Block[] {
  return state.field(block_field, false)?.blocks ?? [];
}

export function block_at(state: EditorState, position: number): Block | null {
  for (const block of get_blocks(state)) {
    if (position >= block.from && position <= block.to) return block;
    if (block.from > position) break;
  }
  return null;
}

// False while the block shows as source (being constructed or revealed).
export function is_block_rendered(state: EditorState, block: Block): boolean {
  let rendered = false;
  state
    .field(block_field)
    .decorations.between(block.from, block.from, (from) => {
      if (from === block.from) rendered = true;
    });
  return rendered;
}

export function read_block_view_states(
  state: EditorState,
  construct: string,
): unknown[] {
  return get_blocks(state)
    .filter((block) => block.construct.name === construct)
    .map((block) => block.view_state);
}

// Widget base class. Equality is by content, never by object identity, so a
// reparse that produces an equal block keeps the mounted DOM and its focus.
export abstract class BlockWidget extends WidgetType {
  constructor(
    readonly block: Block,
    readonly read_only: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof BlockWidget &&
      other.constructor === this.constructor &&
      other.block.source === this.block.source &&
      layer_signature(other.block) === layer_signature(this.block) &&
      other.block.view_state === this.block.view_state &&
      other.read_only === this.read_only &&
      this.same_options(other)
    );
  }

  // Subclasses compare anything else their DOM depends on.
  protected same_options(_other: BlockWidget): boolean {
    return true;
  }

  get estimatedHeight(): number {
    return (
      measured_heights.get(height_key(this.block)) ?? this.estimate_height()
    );
  }

  protected abstract estimate_height(): number;
  protected abstract create_controller(view: EditorView): BlockController;

  toDOM(view: EditorView): HTMLElement {
    const controller = this.create_controller(view);
    controllers.set(controller.root, controller);
    controller.root.dataset.mdLayers = layer_signature(this.block);
    remember_height(controller.root, this.block);
    return controller.root;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const controller = controllers.get(dom);
    if (!controller || controller.view !== view) return false;
    // Layer wrappers are built once. Different layers need a new DOM.
    if (dom.dataset.mdLayers !== layer_signature(this.block)) return false;
    if (!controller.update(this)) return false;
    remember_height(dom, this.block);
    return true;
  }

  destroy(dom: HTMLElement): void {
    controllers.get(dom)?.destroy();
    controllers.delete(dom);
    height_observers.get(dom)?.disconnect();
  }

  // Widgets handle their own events. CodeMirror must not treat clicks or
  // keys inside them as editor input.
  ignoreEvent(): boolean {
    return true;
  }
}

// The live object behind a mounted block widget. Surfaces also implement
// the focus methods.
export interface BlockController {
  readonly root: HTMLElement;
  readonly view: EditorView;
  update(widget: BlockWidget): boolean;
  destroy(): void;
  // Surfaces: focus the inner editor at an outer source position, or at the
  // start when position is null. Must not scroll the page.
  focus?(position: number | null): boolean;
  // Surfaces: show the outer selection without taking focus.
  sync_selection?(): void;
  // Surfaces: arrow keys arrived from the line above (side 1) or below
  // (side -1). goal_x is the caret's horizontal position on screen.
  enter?(side: -1 | 1, goal_x: number | null): boolean;
  // Does this surface own the outer position as editable source?
  owns?(position: number): boolean;
  // Surfaces: redraw surface_highlights, for example after a find change.
  refresh_highlights?(): void;
}

const controllers = new WeakMap<HTMLElement, BlockController>();

export function mounted_controllers(view: EditorView): BlockController[] {
  const found: BlockController[] = [];
  for (const element of view.contentDOM.querySelectorAll<HTMLElement>(
    "[data-md-block]",
  )) {
    const controller = controllers.get(element);
    if (controller?.view === view) found.push(controller);
  }
  return found;
}

// Find the current block for a mounted widget. Widgets do not store their
// position because CodeMirror reuses equal widgets after text moves.
export function block_for_dom(
  view: EditorView,
  dom: HTMLElement,
): Block | null {
  let position: number;
  try {
    position = view.posAtDOM(dom);
  } catch {
    return null;
  }
  return block_at(view.state, position);
}

export function controller_for_block(
  view: EditorView,
  block: Block,
): BlockController | null {
  for (const controller of mounted_controllers(view)) {
    if (block_for_dom(view, controller.root)?.from === block.from)
      return controller;
  }
  return null;
}

// Indent a block's content for each list level around it, the way list
// lines are indented, with the item's marker when the block starts the item.
// Quotes need nothing here: their wrapper element (render.wrap) already
// contains the widget. The content goes in a "md-block-body" element, where
// widgets put their vertical spacing.
export function wrap_in_layers(
  block: Block,
  content: HTMLElement,
): HTMLElement {
  const body = document.createElement("div");
  body.className = "md-block-body";
  body.append(content);
  let inner = body;
  for (const layer of list_layers(block).reverse()) {
    const wrapper = document.createElement("div");
    wrapper.className = "md-block-layer md-block-layer-list_item";
    if (layer.first_line) {
      const marker = document.createElement("span");
      marker.className = "md-block-layer-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = /^\s*\d/.test(layer.marker)
        ? layer.marker.trim()
        : "•";
      wrapper.append(marker);
    }
    wrapper.append(inner);
    inner = wrapper;
  }
  return inner;
}

function list_layers(block: Block): Layer[] {
  return block.container.open_layers.filter(
    (layer) => layer.construct.name === "list_item",
  );
}

// What wrap_in_layers draws depends on more than the block's own source.
// Widgets compare this too.
function layer_signature(block: Block): string {
  return list_layers(block)
    .map((layer) => String(layer.first_line))
    .join(",");
}

// These mirror the list line styles in the commonmark theme.
const block_theme = EditorView.baseTheme({
  // flow-root keeps a child's margins inside each wrapper.
  ".md-block-layer, .md-block-body": { display: "flow-root" },
  // A widget inside a quote sits in the quote's wrapper. Its own text does
  // not take the quote's italic, muted style.
  "[data-md-block]": {
    fontStyle: "normal",
    color: "var(--editor-text, var(--foreground, #242424))",
  },
  ".md-block-selected": { position: "relative" },
  ".md-block-selected::after": {
    content: '""',
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    backgroundColor: "var(--editor-selection-bg, rgba(64, 128, 255, 0.2))",
  },
  ".md-block-layer-list_item": {
    position: "relative",
    paddingLeft: "1.5rem",
  },
  ".md-block-layer-marker": {
    position: "absolute",
    left: "0",
    width: "1.5rem",
    paddingRight: "0.4em",
    boxSizing: "border-box",
    textAlign: "right",
    color: "var(--muted-foreground, #737373)",
  },
});

export function block_extensions(): Extension {
  return [block_field, block_theme, block_selection];
}

// A selection that covers a whole block draws the block as selected. Native
// selection inside a widget paints only its text, which leaves stripes in a
// table. This runs after the DOM update so new widgets are marked too.
const block_selection = EditorView.updateListener.of((update) => {
  if (!update.selectionSet && !update.docChanged && !update.geometryChanged)
    return;
  const { view } = update;
  const range = view.state.selection.main;
  for (const controller of mounted_controllers(view)) {
    const block = range.empty ? null : block_for_dom(view, controller.root);
    const covered =
      block !== null && range.from <= block.from && block.to <= range.to;
    controller.root.classList.toggle("md-block-selected", covered);
  }
});

function find_blocks(state: EditorState, previous: readonly Block[]): Block[] {
  const registry = get_registry(state);
  if (!registry.blocks.size) return [];
  const full = complete_tree(state);
  const tree: Tree = full ?? syntaxTree(state);
  // With a partial tree, keep mapped blocks past the parsed frontier instead
  // of dropping their widgets until the parser gets there.
  const parsed_to = full ? state.doc.length : tree.length;
  const previous_by_from = new Map(
    previous.map((block) => [block.from, block]),
  );
  const blocks: Block[] = [];
  const visit = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.from >= parsed_to) return;
      const construct = registry.blocks.get(child.name);
      if (construct) {
        if (child.to < parsed_to || full) {
          const block = make_block(state, construct, child, previous_by_from);
          if (block) blocks.push(block);
        }
        continue;
      }
      // Containers (quotes, list items) are BlockContext nodes. Lists are
      // tagged as leaf blocks by Lezer, but their children are blocks.
      if (child.type.is("BlockContext") || child.firstChild?.type.is("Block"))
        visit(child);
    }
  };
  visit(tree.topNode);
  for (const block of previous) {
    if (block.from >= parsed_to) blocks.push(block);
  }
  return blocks;
}

function make_block(
  state: EditorState,
  construct: BlockConstruct,
  node: SyntaxNode,
  previous_by_from: Map<number, Block>,
): Block | null {
  const first = state.doc.lineAt(node.from);
  const last = state.doc.lineAt(node.to);
  const source = state.sliceDoc(first.from, last.to);
  const previous = previous_by_from.get(first.from);
  if (
    previous &&
    previous.source === source &&
    previous.construct === construct &&
    previous.node_from === node.from &&
    previous.node_to === node.to
  )
    return previous;
  return {
    construct,
    from: first.from,
    to: last.to,
    node_from: node.from,
    node_to: node.to,
    source,
    container: line_container(state, first),
    view_state: previous?.construct === construct ? previous.view_state : null,
  };
}

function map_blocks(
  blocks: readonly Block[],
  transaction: Transaction,
): Block[] {
  if (!transaction.docChanged) return [...blocks];
  return blocks.map((block) => {
    const from = transaction.changes.mapPos(block.from, 1);
    const to = transaction.changes.mapPos(block.to, -1);
    return {
      ...block,
      from,
      to: Math.max(from, to),
      node_from: transaction.changes.mapPos(block.node_from, 1),
      node_to: transaction.changes.mapPos(block.node_to, -1),
    };
  });
}

function next_constructing(
  value: BlockFieldValue,
  blocks: readonly Block[],
  transaction: Transaction,
): number | null {
  let constructing = value.constructing;
  if (constructing !== null && transaction.docChanged)
    constructing = transaction.changes.mapPos(constructing, -1);
  for (const effect of transaction.effects) {
    if (effect.is(finish_block_construction)) return null;
    if (effect.is(edit_block_source)) constructing = effect.value;
  }
  const selection = transaction.state.selection.main;
  if (constructing !== null) {
    const block = blocks.find((candidate) => candidate.from === constructing);
    if (!block || selection.from < block.from || selection.to > block.to)
      constructing = null;
    return constructing;
  }
  // Only typing constructs a block. A command that inserts a whole block,
  // such as a slash command, wants the finished widget right away.
  if (
    !transaction.docChanged ||
    !transaction.isUserEvent("input.type") ||
    transaction.annotation(surface_input)
  )
    return null;
  // A block that appeared from this typing and holds the caret is being
  // typed. Replacing it now would move the native caret into hidden DOM.
  const known = new Set(
    value.blocks.map((block) => transaction.changes.mapPos(block.from, 1)),
  );
  const created = blocks.find(
    (block) =>
      !known.has(block.from) &&
      block.construct.reveal === "surface" &&
      selection.from >= block.from &&
      selection.to <= block.to,
  );
  return created ? created.from : null;
}

function build_decorations(
  state: EditorState,
  blocks: readonly Block[],
  constructing: number | null,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const block of blocks) {
    if (block.from === constructing) continue;
    if (
      block.construct.reveal === "caret" &&
      touches(state, block.from, block.to)
    )
      continue;
    if (block.construct.complete && !block.construct.complete(block, state))
      continue;
    const construct = block.construct;
    const widget = guard(construct, () => construct.widget(block, state));
    if (!widget) continue;
    ranges.push(
      Decoration.replace({ widget, block: true }).range(block.from, block.to),
    );
  }
  return Decoration.set(ranges, true);
}

const measured_heights = new Map<string, number>();
const measured_heights_limit = 500;
const height_observers = new WeakMap<HTMLElement, ResizeObserver>();

function height_key(block: Block): string {
  return `${block.construct.name}\u0000${block.source}`;
}

// Remember each block's real height, so a block that scrolls out and back in
// gets an accurate estimate and the scroll position does not jump.
function remember_height(dom: HTMLElement, block: Block) {
  dom.dataset.mdBlock = block.construct.name;
  if (typeof ResizeObserver === "undefined") return;
  height_observers.get(dom)?.disconnect();
  const key = height_key(block);
  const observer = new ResizeObserver((entries) => {
    const height = entries[0]?.borderBoxSize?.[0]?.blockSize;
    if (!height) return;
    measured_heights.delete(key);
    measured_heights.set(key, height);
    if (measured_heights.size > measured_heights_limit) {
      const oldest = measured_heights.keys().next().value;
      if (oldest !== undefined) measured_heights.delete(oldest);
    }
  });
  observer.observe(dom);
  height_observers.set(dom, observer);
}

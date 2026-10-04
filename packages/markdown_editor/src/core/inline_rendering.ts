import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  RangeSet,
  StateEffect,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  BlockWrapper,
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  type WidgetType,
} from "@codemirror/view";
import { is_rich } from "./editor_mode.js";
import { block_at, is_block_rendered } from "./block_field.js";
import {
  is_literal,
  line_container,
  type Layer,
  type LineContainer,
} from "./context.js";
import { get_registry, type Construct } from "./plugin.js";
import {
  caret_in,
  prefix_revealed,
  reveal_freeze,
  reveal_ranges,
  touches,
} from "./reveal.js";

// What a construct's decorate function gets. It records decorations; the
// renderer turns them into one decoration set per update.
export type Render = {
  readonly state: EditorState;
  // For inline constructs: a caret touches the current node.
  readonly reveal: boolean;
  touches(from: number, to: number): boolean;
  caret_in(from: number, to: number): boolean;
  // True while the caret is inside this line's container prefix.
  prefix_revealed(container: LineContainer): boolean;
  text(from: number, to: number): string;
  mark(from: number, to: number, class_name: string): void;
  // Hidden source is atomic: arrows skip over it.
  hide(from: number, to: number): void;
  replace(from: number, to: number, widget: WidgetType): void;
  // A widget at one position. side < 0 draws it before the position.
  widget(at: number, widget: WidgetType, side?: number): void;
  line(
    line_from: number,
    class_name: string,
    styles?: Record<string, string>,
  ): void;
  // Add a class to every line from the line at `from` to the line at `to`.
  lines(from: number, to: number, class_name: string): void;
  // Wrap the whole lines of a block node in an element. Container boxes and
  // vertical spacing go on wrappers, never on a line: CodeMirror estimates
  // every line it has not drawn from a short plain-text line, so such a line
  // must keep the default box. Deeper nodes nest inside shallower ones, and
  // calls for the same node share one element.
  wrap(
    node: SyntaxNode,
    class_name: string,
    styles?: Record<string, string>,
  ): void;
  // Space above a top-level block, outside its own wrapper. `before` is what
  // the block wants, `after` what the block above wants; the larger one
  // wins. A block drawn as a widget keeps its own spacing instead.
  gap(node: SyntaxNode, space: { before?: string; after?: string }): void;
  // Per-render scratch space, so a construct can compute something once per
  // node instead of once per line.
  memo<T>(key: string, compute: () => T): T;
  // Depth of `layer` among layers of the same construct on this line.
  layer_depth(container: LineContainer, layer: Layer): number;
};

export const refresh_rendering = StateEffect.define();

export function inline_rendering(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;
      wrappers: RangeSet<BlockWrapper>;

      constructor(view: EditorView) {
        ({
          decorations: this.decorations,
          atomic: this.atomic,
          wrappers: this.wrappers,
        } = render_view(view));
      }

      update(update: ViewUpdate) {
        // Composition owns its DOM until it ends. Map so every decoration
        // stays inside the changing document during an IME replacement.
        if (update.view.composing) {
          this.decorations = this.decorations.map(update.changes);
          this.atomic = this.atomic.map(update.changes);
          this.wrappers = this.wrappers.map(update.changes);
          return;
        }
        if (needs_render(update)) {
          ({
            decorations: this.decorations,
            atomic: this.atomic,
            wrappers: this.wrappers,
          } = render_view(update.view));
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (extension) => [
        EditorView.atomicRanges.of(
          (view) => view.plugin(extension)?.atomic ?? Decoration.none,
        ),
        EditorView.blockWrappers.of(
          (view) => view.plugin(extension)?.wrappers ?? no_wrappers,
        ),
      ],
    },
  );
  return [
    plugin,
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        requestAnimationFrame(() => {
          if (view.plugin(plugin))
            view.dispatch({ effects: refresh_rendering.of(null) });
        });
      },
    }),
  ];
}

function needs_render(update: ViewUpdate): boolean {
  if (update.docChanged || update.viewportChanged) return true;
  if (is_rich(update.startState) !== is_rich(update.state)) return true;
  if (syntaxTree(update.startState) !== syntaxTree(update.state)) return true;
  if (update.startState.readOnly !== update.state.readOnly) return true;
  const frozen_before = update.startState.field(reveal_freeze, false)?.frozen;
  const frozen_after = update.state.field(reveal_freeze, false)?.frozen;
  if (frozen_before !== frozen_after) return true;
  if (update.selectionSet && !frozen_after) return true;
  if (reveal_sources_changed(update)) return true;
  return update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(refresh_rendering)),
  );
}

function reveal_sources_changed(update: ViewUpdate): boolean {
  const before = update.startState.facet(reveal_ranges);
  const after = update.state.facet(reveal_ranges);
  for (let index = 0; index < after.length; index++) {
    const source = after[index];
    if (!source || before[index] !== source) return true;
    const old_ranges = source(update.startState);
    const new_ranges = source(update.state);
    if (old_ranges !== new_ranges) return true;
  }
  return false;
}

type LineStyle = { classes: Set<string>; styles: Map<string, string> };

// One wrapper element, keyed by its node. Rank orders nesting: CodeMirror
// puts higher ranks outside lower ones whatever their ranges, so the rank
// follows the node's depth in the tree. Gaps sit outside everything.
type WrapperSpec = LineStyle & { from: number; to: number; rank: number };

// Lines and wrappers collect classes and CSS variables the same way.
function add_style(
  target: LineStyle,
  class_name: string,
  styles: Record<string, string>,
) {
  for (const name of class_name.split(" ")) if (name) target.classes.add(name);
  for (const [name, value] of Object.entries(styles))
    target.styles.set(name, value);
}

function inline_css(styles: Map<string, string>): string {
  return [...styles].map(([name, value]) => `${name}: ${value}`).join("; ");
}

const gap_rank = 100;

class RenderCollector {
  readonly decorations: Range<Decoration>[] = [];
  readonly atomic: Range<Decoration>[] = [];
  readonly line_styles = new Map<number, LineStyle>();
  // Lines that hold an element of ours (mark, widget, hidden range).
  readonly inline_lines = new Set<number>();
  readonly wrappers = new Map<string, WrapperSpec>();
  readonly memos = new Map<string, unknown>();

  constructor(readonly state: EditorState) {}

  for_node(node: { from: number; to: number } | null): Render {
    const { state } = this;
    const line = (
      line_from: number,
      class_name: string,
      styles?: Record<string, string>,
    ) => {
      add_style(this.line_style(line_from), class_name, styles ?? {});
    };
    return {
      state,
      reveal: node ? touches(state, node.from, node.to) : false,
      touches: (from, to) => touches(state, from, to),
      caret_in: (from, to) => caret_in(state, from, to),
      prefix_revealed: (container) => prefix_revealed(state, container),
      text: (from, to) => state.sliceDoc(from, to),
      mark: (from, to, class_name) => {
        if (from >= to) return;
        this.decorations.push(
          Decoration.mark({ class: class_name }).range(from, to),
        );
        this.inline_lines.add(state.doc.lineAt(from).from);
      },
      hide: (from, to) => {
        if (from >= to) return;
        const hidden = Decoration.replace({}).range(from, to);
        this.decorations.push(hidden);
        this.atomic.push(hidden);
        this.inline_lines.add(state.doc.lineAt(from).from);
      },
      replace: (from, to, widget) => {
        const replaced = Decoration.replace({ widget }).range(from, to);
        this.decorations.push(replaced);
        this.atomic.push(replaced);
        this.inline_lines.add(state.doc.lineAt(from).from);
      },
      widget: (at, widget, side = 1) => {
        this.decorations.push(Decoration.widget({ widget, side }).range(at));
        this.inline_lines.add(state.doc.lineAt(at).from);
      },
      line,
      lines: (from, to, class_name) => {
        const last = state.doc.lineAt(to).number;
        for (
          let number = state.doc.lineAt(from).number;
          number <= last;
          number++
        )
          line(state.doc.line(number).from, class_name);
      },
      wrap: (node, class_name, styles) => {
        let depth = 0;
        for (let parent = node.parent; parent?.parent; parent = parent.parent)
          depth++;
        this.wrapper(node, Math.max(1, 99 - depth), class_name, styles ?? {});
      },
      gap: (node, space) => {
        const block = block_at(state, node.from);
        if (block?.node_from === node.from && is_block_rendered(state, block))
          return;
        this.wrapper(node, gap_rank, "md-gap", {
          ...(space.before ? { "--md-gap-before": space.before } : {}),
          ...(space.after ? { "--md-gap-after": space.after } : {}),
        });
      },
      memo: <T>(key: string, compute: () => T): T => {
        if (!this.memos.has(key)) this.memos.set(key, compute());
        return this.memos.get(key) as T;
      },
      layer_depth: (container, layer) => {
        let depth = 0;
        for (const candidate of container.open_layers) {
          if (candidate.construct === layer.construct) depth++;
          if (candidate === layer) break;
        }
        return depth;
      },
    };
  }

  line_style(line_from: number): LineStyle {
    let style = this.line_styles.get(line_from);
    if (!style) {
      style = { classes: new Set(), styles: new Map() };
      this.line_styles.set(line_from, style);
    }
    return style;
  }

  // A wrapper covers its node's whole lines. CodeMirror wraps every line and
  // block widget that starts in [from, to), so `to` is the last line's end.
  wrapper(
    node: SyntaxNode,
    rank: number,
    class_name: string,
    styles: Record<string, string>,
  ) {
    const { doc } = this.state;
    const from = doc.lineAt(node.from).from;
    const to = doc.lineAt(Math.max(node.from, node.to - 1)).to;
    const key = `${String(from)}:${String(to)}:${String(rank)}`;
    let spec = this.wrappers.get(key);
    if (!spec) {
      spec = {
        from,
        to,
        rank,
        classes: new Set(["md-wrap"]),
        styles: new Map(),
      };
      this.wrappers.set(key, spec);
    }
    add_style(spec, class_name, styles);
  }

  finish() {
    for (const [from, style] of this.line_styles) {
      if (!style.classes.size && !style.styles.size) continue;
      // CodeMirror estimates every line it has not drawn from the first
      // drawn line that holds nothing but short plain text (measureTextSize
      // in @codemirror/view). A styled line can have a bigger box, like a
      // setext heading's text or a lazy list line, and a wrong sample makes
      // the estimate flip as the viewport moves, so the view never settles.
      // A plain mark gives such a line an element, which keeps CodeMirror
      // from sampling it. Unstyled lines keep the default box.
      const line = this.state.doc.lineAt(from);
      if (line.length && !this.inline_lines.has(from))
        this.decorations.push(
          Decoration.mark({ class: "md-line-text" }).range(line.from, line.to),
        );
      this.decorations.push(
        Decoration.line({
          class: [...style.classes].join(" "),
          ...(style.styles.size
            ? { attributes: { style: inline_css(style.styles) } }
            : {}),
        }).range(from),
      );
    }
    const wrappers = [...this.wrappers.values()].map((spec) =>
      BlockWrapper.create({
        tagName: "div",
        rank: spec.rank,
        attributes: {
          class: [...spec.classes].join(" "),
          ...(spec.styles.size ? { style: inline_css(spec.styles) } : {}),
        },
      }).range(spec.from, spec.to),
    );
    return {
      decorations: Decoration.set(this.decorations, true),
      atomic: Decoration.set(this.atomic, true),
      wrappers: BlockWrapper.set(wrappers, true),
    };
  }
}

const no_wrappers: RangeSet<BlockWrapper> = BlockWrapper.set([]);

function render_view(view: EditorView) {
  const { state } = view;
  const registry = get_registry(state);
  const collector = new RenderCollector(state);
  if (!is_rich(state)) return collector.finish();
  const visited = new Set<string>();
  const tree = syntaxTree(state);

  for (const visible of view.visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        // Block constructs are drawn by the block field. Their own source is
        // still visible while they are revealed, so nested inline nodes in a
        // non-literal block keep rendering.
        const key = `${node.name}:${String(node.from)}`;
        if (visited.has(key)) return !registry.literal_nodes.has(node.name);
        visited.add(key);
        for (const construct of registry.by_node.get(node.name) ?? []) {
          if (construct.kind === "block" || !construct.decorate) continue;
          const decorate = construct.decorate;
          guard(construct, () => {
            decorate(node, collector.for_node(node));
          });
        }
        return !registry.literal_nodes.has(node.name);
      },
    });
    render_containers(view, visible, collector);
  }
  return collector.finish();
}

// One pass over visible lines for container prefixes. The core owns blank
// line styling and the revealed prefix. Each container construct styles its
// own layers and hides its own marker.
function render_containers(
  view: EditorView,
  visible: { from: number; to: number },
  collector: RenderCollector,
) {
  const { state } = view;
  const render = collector.for_node(null);
  for (let position = visible.from; position <= visible.to; ) {
    const line = state.doc.lineAt(position);
    position = line.to + 1;
    const container = line_container(state, line);
    // Literal content (code, frontmatter) keeps its whitespace and the
    // default line box.
    if (container.blank && !is_literal(state, line.from)) {
      render.line(line.from, "md-blank-line");
      // Whitespace would make a blank row a plain-text line with the blank
      // row's box, which CodeMirror could take as its line-height sample.
      // Container markers hide themselves; hide the rest.
      render.hide(container.content_from, line.to);
    }
    if (render.prefix_revealed(container) && container.layers.length) {
      render.line(line.from, "md-source-prefix-visible");
      render.mark(line.from, container.content_from, "md-source-prefix");
      // Keep prefix spaces addressable between quote marks, list marks, and
      // task widgets so the caret can stop anywhere in the prefix.
      const prefix = state.sliceDoc(line.from, container.content_from);
      for (const space of prefix.matchAll(/[ \t]+/g))
        render.mark(
          line.from + space.index,
          line.from + space.index + space[0].length,
          "md-prefix-space",
        );
    }
    for (const layer of container.open_layers) {
      const decorate_layer = layer.construct.decorate_layer;
      if (!decorate_layer) continue;
      guard(layer.construct, () => {
        decorate_layer(layer, container, render);
      });
    }
    if (line.to >= state.doc.length) break;
  }
}

const reported = new WeakSet<Construct>();

// One broken construct must not take down the rest of the rendering. When a
// view plugin throws, CodeMirror disables the whole plugin and every
// decoration disappears, so catch each construct separately. Its node then
// shows as plain source.
export function guard<T>(construct: Construct, run: () => T): T | null {
  try {
    return run();
  } catch (error) {
    if (!reported.has(construct)) {
      reported.add(construct);
      console.error(
        `markdown editor: construct "${construct.name}" failed`,
        error,
      );
    }
    return null;
  }
}

import type { SyntaxNodeRef } from "@lezer/common";
import type { MarkdownConfig } from "@lezer/markdown";
import type { LanguageDescription } from "@codemirror/language";
import { Facet, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import type { Block, BlockWidget } from "./block_field.js";
import type { KeyContext } from "./keys.js";
import type { Layer, LineContainer } from "./context.js";
import type { Render } from "./inline_rendering.js";

// A plugin is a plain description. The editor compiles every plugin into
// CodeMirror extensions once, when the state is created. Nothing here runs
// lazily or depends on plugin order, except `replaces`.
export type MarkdownPlugin = {
  name: string;
  requires?: readonly string[];
  syntax?: MarkdownConfig | readonly MarkdownConfig[];
  // Grammars for fenced code. Source mode highlights fences with them.
  code_languages?: readonly LanguageDescription[];
  constructs?: readonly Construct[];
  keys?: readonly KeyBinding[];
  theme?: ThemeSpec;
  extensions?: Extension;
};

export type ThemeSpec = Parameters<typeof EditorView.theme>[0];

export type Construct = InlineConstruct | LineConstruct | BlockConstruct;

type ConstructBase = {
  name: string;
  // Lezer node names this construct owns.
  nodes: readonly string[];
  // Set to the name of a built-in construct to swap it out.
  replaces?: string;
  // Literal content is not rendered, completed, or rich-pasted into.
  literal?: boolean;
  keys?: ConstructKeys;
  insert?: readonly InsertItem[];
};

export type InlineConstruct = ConstructBase & {
  kind: "inline";
  decorate?: (node: SyntaxNodeRef, render: Render) => void;
  // Static HTML for places without a live editor, such as inactive table
  // cells. Return null to fall back to the node's text.
  render_static?: (node: SyntaxNodeRef, context: StaticContext) => Node | null;
};

export type LineConstruct = ConstructBase & {
  kind: "line";
  decorate?: (node: SyntaxNodeRef, render: Render) => void;
  container?: ContainerSpec;
  // Called once per visible line for each layer this construct owns.
  decorate_layer?: (layer: Layer, line: LineContainer, render: Render) => void;
};

export type BlockConstruct = ConstructBase & {
  kind: "block";
  // "caret": the source shows while a caret touches the block.
  // "surface": the widget is the editor. Source shows only while the block is
  // being constructed or after an explicit edit_block_source.
  reveal: "caret" | "surface";
  // Return false while the node is not a usable block yet, for example a
  // fence whose opening line has no newline after it.
  complete?: (block: Block, state: EditorState) => boolean;
  // Surfaces: the outer range the surface edits (a code body without its
  // fences). Lines of a rendered block outside it have no caret stop.
  editable?: (
    block: Block,
    state: EditorState,
  ) => { from: number; to: number } | null;
  widget: (block: Block, state: EditorState) => BlockWidget;
};

// Container constructs (quotes, list items) describe how their prefix looks.
// The core walks a line's open containers from outermost to innermost and
// asks each one to match its prefix at the current offset.
export type ContainerSpec = {
  // The prefix on the first line of the container, or null when the text at
  // `offset` does not start this container. Returns the end offset.
  match_first(
    text: string,
    offset: number,
    tab_size: number,
  ): ContainerMatch | null;
  // The prefix on a later line. Return null for a lazy continuation.
  match_continuation(
    text: string,
    offset: number,
    open: Layer,
    tab_size: number,
  ): ContainerMatch | null;
  // Prefix for a new line that continues this layer.
  continuation(layer: Layer): string;
  // Prefix for a new sibling, such as the next list item. Defaults to
  // `continuation`.
  next_sibling?(layer: Layer): string;
};

export type ContainerMatch = {
  to: number;
  marker: string;
  content_column: number;
};

// Construct key handlers run innermost construct first. Return true to stop.
export type ConstructKeys = Partial<
  Record<ConstructKeyName, (context: KeyContext) => boolean>
>;

export type ConstructKeyName =
  | "Enter"
  | "Shift-Enter"
  | "Mod-Enter"
  | "Backspace"
  | "Tab"
  | "Shift-Tab";

export type InsertItem = {
  id: string;
  label: string;
  detail?: string;
  icon?: string;
  aliases?: readonly string[];
  // Lines to insert at the caret line. The core adds container prefixes.
  lines: readonly string[];
  // Caret position inside `lines`, as [line index, column]. Defaults to the
  // end of the first line.
  caret?: readonly [number, number];
};

export type StaticContext = {
  state: EditorState;
  render_children(node: SyntaxNodeRef, parent: HTMLElement): void;
  open_link?: (target: string) => void;
};

export type ConstructRegistry = {
  by_node: ReadonlyMap<string, readonly Construct[]>;
  containers: ReadonlyMap<string, LineConstruct>;
  blocks: ReadonlyMap<string, BlockConstruct>;
  literal_nodes: ReadonlySet<string>;
  insert_items: readonly InsertItem[];
};

export const construct_registry = Facet.define<
  ConstructRegistry,
  ConstructRegistry
>({
  combine: (values) => values[0] ?? build_registry([]),
  static: true,
});

export function get_registry(state: EditorState): ConstructRegistry {
  return state.facet(construct_registry);
}

export class PluginBuildError extends Error {}

// Resolve requires and replaces, then index constructs by node name.
export function build_registry(
  plugins: readonly MarkdownPlugin[],
): ConstructRegistry {
  const names = new Set(plugins.map((plugin) => plugin.name));
  for (const plugin of plugins) {
    for (const required of plugin.requires ?? []) {
      if (!names.has(required))
        throw new PluginBuildError(
          `Plugin "${plugin.name}" requires "${required}", which is not installed`,
        );
    }
  }

  const by_name = new Map<string, Construct>();
  for (const plugin of plugins) {
    for (const construct of plugin.constructs ?? []) {
      if (construct.replaces !== undefined) {
        if (!by_name.delete(construct.replaces))
          throw new PluginBuildError(
            `Construct "${construct.name}" replaces "${construct.replaces}", which is not installed`,
          );
      } else if (by_name.has(construct.name)) {
        throw new PluginBuildError(
          `Construct "${construct.name}" is defined twice. Set replaces to swap one out`,
        );
      }
      by_name.set(construct.name, construct);
    }
  }

  const by_node = new Map<string, Construct[]>();
  const containers = new Map<string, LineConstruct>();
  const blocks = new Map<string, BlockConstruct>();
  const literal_nodes = new Set<string>();
  const insert_items: InsertItem[] = [];
  for (const construct of by_name.values()) {
    for (const node of construct.nodes) {
      const list = by_node.get(node) ?? [];
      list.push(construct);
      by_node.set(node, list);
      if (construct.literal) literal_nodes.add(node);
      if (construct.kind === "line" && construct.container)
        containers.set(node, construct);
      if (construct.kind === "block") blocks.set(node, construct);
    }
    insert_items.push(...(construct.insert ?? []));
  }
  return { by_node, containers, blocks, literal_nodes, insert_items };
}

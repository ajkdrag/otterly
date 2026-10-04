import { syntaxTree } from "@codemirror/language";
import { get_frontmatter_end } from "./frontmatter_range.js";
import {
  get_find_matches,
  get_find_query,
  selected_find_intersects,
} from "./find_highlights.js";
import { StateEffect, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
type BlockRange = { from: number; to: number; depth: number };
type ListItemRange = BlockRange & { list_from: number };
type ListMarkerRange = {
  node: SyntaxNode;
  item_from: number;
  item_to: number;
};
type SemanticLine = { classes: Set<string>; styles: Map<string, string> };

const refresh_rendering = StateEffect.define();
const inline_classes: Record<string, string> = {
  StrongEmphasis: "md-strong",
  Emphasis: "md-emphasis",
  Strikethrough: "md-strike",
  InlineCode: "md-inline-code",
};
const syntax_markers = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "HeaderMark",
  "QuoteMark",
]);

export function rich_markdown_rendering() {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      hidden_syntax: DecorationSet;

      constructor(view: EditorView) {
        const rendered = render_visible_markdown(view);
        this.decorations = rendered.decorations;
        this.hidden_syntax = rendered.hidden_syntax;
      }

      update(update: ViewUpdate) {
        // Composition owns its DOM until it ends. Mapping still keeps every
        // decoration inside the changing document during an IME replacement.
        if (update.view.composing) {
          this.decorations = this.decorations.map(update.changes);
          this.hidden_syntax = this.hidden_syntax.map(update.changes);
          return;
        }
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          get_find_query(update.startState) !== get_find_query(update.state) ||
          update.startState.readOnly !== update.state.readOnly ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refresh_rendering)),
          )
        ) {
          const rendered = render_visible_markdown(update.view);
          this.decorations = rendered.decorations;
          this.hidden_syntax = rendered.hidden_syntax;
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (extension) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(extension)?.hidden_syntax ?? Decoration.none,
        ),
    },
  );

  return [
    plugin,
    EditorView.editorAttributes.of((view) =>
      view.state.selection.ranges.length === 1 &&
      !view.state.selection.main.empty
        ? { class: "md-native-selection" }
        : {},
    ),
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        requestAnimationFrame(() => {
          if (view.plugin(plugin)) {
            view.dispatch({ effects: refresh_rendering.of(null) });
          }
        });
      },
    }),
  ];
}

function render_visible_markdown(view: EditorView) {
  const decorations: Range<Decoration>[] = [];
  const hidden_syntax: Range<Decoration>[] = [];
  const { state } = view;
  const frontmatter_end = get_frontmatter_end(state);
  const find_matches = get_find_matches(state);
  const has_find_match = (from: number, to: number) => {
    let low = 0;
    let high = find_matches.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((find_matches[middle]?.to ?? 0) <= from) low = middle + 1;
      else high = middle;
    }
    const match = find_matches[low];
    return Boolean(match && match.from < to);
  };
  const visited = new Set<string>();
  const list_items: ListItemRange[] = [];
  const list_markers: ListMarkerRange[] = [];
  const blockquotes: BlockRange[] = [];
  const top_level_blocks: SyntaxNode[] = [];
  const semantic_lines = new Map<number, SemanticLine>();

  for (const visible of view.visibleRanges) {
    if (frontmatter_end > 0 && visible.from < frontmatter_end) {
      for (
        let line = state.doc.lineAt(visible.from);
        line.from < frontmatter_end && line.from <= visible.to;
      ) {
        decorations.push(
          Decoration.line({ class: "md-frontmatter" }).range(line.from),
        );
        if (line.to === state.doc.length) break;
        line = state.doc.lineAt(line.to + 1);
      }
    }
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        if (node.from < frontmatter_end)
          return node.to <= frontmatter_end ? false : undefined;
        const key = `${node.name}:${String(node.from)}:${String(node.to)}`;
        if (
          visited.has(key) &&
          node.name !== "FencedCode" &&
          node.name !== "CodeBlock"
        )
          return undefined;
        visited.add(key);
        if (node.node.parent?.name === "Document")
          top_level_blocks.push(node.node);
        if (node.name === "ListItem") {
          list_items.push({
            from: node.from,
            to: node.to,
            depth: count_ancestors_named(node.node, "ListItem"),
            list_from: node.node.parent?.from ?? node.from,
          });
        }
        if (node.name === "ListMark") {
          const item = find_ancestor_node(node.node, "ListItem");
          if (item) {
            list_markers.push({
              node: node.node,
              item_from: item.from,
              item_to: item.to,
            });
          }
        }
        if (node.name === "Blockquote") {
          blockquotes.push({
            from: node.from,
            to: node.to,
            depth: count_ancestors_named(node.node, "Blockquote"),
          });
        }
        const first_line = state.doc.lineAt(node.from);
        const last_line = state.doc.lineAt(node.to);
        const find_selected = selected_find_intersects(
          state,
          node.from,
          node.to,
        );
        const selected =
          find_selected ||
          state.selection.ranges.some(
            (range) =>
              range.from <= last_line.to && range.to >= first_line.from,
          );
        const inline_class = inline_classes[node.name];
        if (inline_class) {
          decorations.push(
            Decoration.mark({ class: inline_class }).range(node.from, node.to),
          );
        }

        const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
        if (heading) {
          const unfinished_marker = find_unfinished_bullet_marker(
            state,
            node.node,
          );
          if (!unfinished_marker) {
            decorations.push(
              Decoration.line({
                class: `md-heading md-heading-${heading[1] ?? "1"}`,
              }).range(first_line.from),
            );
            if (node.name.startsWith("Setext")) {
              const underline = find_child_named(node.node, "HeaderMark");
              if (underline) {
                const line = state.doc.lineAt(underline.from);
                const active =
                  state.selection.ranges.some(
                    (range) => range.from <= line.to && range.to >= line.from,
                  ) ||
                  selected_find_intersects(state, underline.from, underline.to);
                if (!active)
                  get_semantic_line(semantic_lines, line.from).classes.add(
                    "md-setext-underline",
                  );
              }
            }
          } else if (!is_pending_list_marker(state, unfinished_marker.from)) {
            const line = state.doc.lineAt(unfinished_marker.from);
            const semantic = get_semantic_line(semantic_lines, line.from);
            semantic.classes.add("md-list-line");
            semantic.classes.add("md-list-depth-1");
            semantic.classes.add("md-list-item-start");
            semantic.classes.add("md-list-item-end");
            semantic.classes.add("md-list-marker-line");
            semantic.styles.set("--md-list-depth", "1");
            semantic.styles.set(
              "--md-list-prefix-chars",
              String(line.to - line.from),
            );
            if (is_source_prefix_active(state, unfinished_marker)) {
              semantic.classes.add("md-list-source-visible");
            } else {
              const rendered = Decoration.replace({
                widget: new MarkdownSymbol("•", "md-list-marker"),
              }).range(line.from, line.to);
              decorations.push(rendered);
              hidden_syntax.push(rendered);
            }
          }
        }
        if (node.name === "ListMark") {
          if (is_pending_list_marker(state, node.from)) return false;
          const marker = state.sliceDoc(node.from, node.to);
          const item = find_ancestor_node(node.node, "ListItem");
          const has_task_marker =
            item !== null && find_descendant_named(item, "TaskMarker") !== null;
          if (!is_source_prefix_active(state, node.node)) {
            const range = list_prefix_range(state, node.node);
            const depth = item ? count_ancestors_named(item, "ListItem") : 1;
            const rendered = has_task_marker
              ? Decoration.replace({}).range(range.from, range.to)
              : Decoration.replace({
                  widget: new MarkdownSymbol(
                    list_marker_symbol(marker, depth),
                    "md-list-marker",
                  ),
                }).range(range.from, range.to);
            decorations.push(rendered);
            hidden_syntax.push(rendered);
          } else {
            decorations.push(
              Decoration.mark({ class: "md-list-marker" }).range(
                node.from,
                node.to,
              ),
            );
          }
        }
        if (node.name === "HorizontalRule" && !selected) {
          const rule = Decoration.replace({
            widget: new MarkdownSymbol("", "md-horizontal-rule"),
          }).range(node.from, node.to);
          decorations.push(rule);
          hidden_syntax.push(rule);
        }
        if (node.name === "TaskMarker" && !find_selected) {
          const checked =
            state.sliceDoc(node.from, node.to).toLowerCase() === "[x]";
          const checkbox = Decoration.replace({
            widget: new TaskCheckbox(node.from, checked, state.readOnly),
          }).range(node.from, node.to);
          decorations.push(checkbox);
          hidden_syntax.push(checkbox);
          const task = find_ancestor_node(node.node, "Task");
          if (task && checked) {
            const following = state.sliceDoc(node.to, task.to);
            const leading_whitespace = /^\s*/.exec(following)?.[0] ?? "";
            const body_from = node.to + leading_whitespace.length;
            if (body_from < task.to) {
              decorations.push(
                Decoration.mark({ class: "md-task-completed" }).range(
                  body_from,
                  task.to,
                ),
              );
            }
          }
        }
        if (
          node.name === "HTMLTag" &&
          /^<br\s*\/?>$/i.test(state.sliceDoc(node.from, node.to)) &&
          first_line.number === last_line.number &&
          !has_ancestor_named(node.node, "InlineCode")
        ) {
          const line = state.doc.lineAt(node.from);
          const before = state.sliceDoc(line.from, node.from);
          const after = state.sliceDoc(node.to, line.to);
          const standalone = /^\s*$/.test(before) && /^\s*$/.test(after);
          if (standalone) {
            const semantic = get_semantic_line(semantic_lines, line.from);
            semantic.classes.add("md-legacy-blank-line");
            semantic.classes.add("md-blank-line");
          }
          if (
            !is_inline_source_active(state, node.node) &&
            !has_find_match(node.from, node.to)
          ) {
            const rendered = standalone
              ? Decoration.replace({
                  widget: new MarkdownSymbol("", "md-html-break"),
                }).range(line.from, line.to)
              : Decoration.replace({
                  widget: new LegacyHtmlBreak(),
                }).range(node.from, node.to);
            decorations.push(rendered);
            hidden_syntax.push(rendered);
          }
        }
        if (node.name === "Escape" || node.name === "Entity") {
          if (
            !is_inline_source_active(state, node.node) &&
            !has_find_match(node.from, node.to) &&
            !has_ancestor_named(node.node, "Link") &&
            !has_ancestor_named(node.node, "Image") &&
            first_line.number === last_line.number
          ) {
            const source = state.sliceDoc(node.from, node.to);
            const rendered =
              node.name === "Escape"
                ? (source[1] ?? source)
                : decode_entity(source);
            const hidden = Decoration.replace({
              widget: new MarkdownSymbol(rendered, "md-literal"),
            }).range(node.from, node.to);
            decorations.push(hidden);
            hidden_syntax.push(hidden);
          }
        }
        if (syntax_markers.has(node.name)) {
          if (node.name === "QuoteMark") {
            if (is_source_prefix_active(state, node.node)) {
              decorations.push(
                Decoration.mark({ class: "md-syntax" }).range(
                  node.from,
                  node.to,
                ),
              );
            } else {
              const prefix = quote_prefix_range(state, node.from);
              if (node.from === prefix.first_mark_from) {
                const hidden = Decoration.replace({}).range(
                  prefix.from,
                  prefix.to,
                );
                decorations.push(hidden);
                hidden_syntax.push(hidden);
              }
            }
            return undefined;
          }
          if (node.name === "HeaderMark") {
            const unfinished_marker =
              find_unfinished_bullet_marker_in_ancestors(state, node.node);
            if (unfinished_marker) {
              if (is_pending_list_marker(state, unfinished_marker.from))
                return undefined;
              if (is_source_prefix_active(state, unfinished_marker)) {
                decorations.push(
                  Decoration.mark({ class: "md-list-marker" }).range(
                    node.from,
                    node.to,
                  ),
                );
              }
              return undefined;
            }
            if (selected) {
              decorations.push(
                Decoration.mark({ class: "md-syntax" }).range(
                  node.from,
                  node.to,
                ),
              );
            } else {
              const prefix = header_prefix_range(state, node.node);
              const hidden = Decoration.replace({}).range(
                prefix.from,
                prefix.to,
              );
              decorations.push(hidden);
              hidden_syntax.push(hidden);
            }
            return undefined;
          }
          if (
            node.node.parent &&
            is_inline_source_active(state, node.node.parent)
          ) {
            decorations.push(
              Decoration.mark({ class: "md-syntax" }).range(node.from, node.to),
            );
          } else if (first_line.number === last_line.number) {
            const hidden = Decoration.replace({}).range(node.from, node.to);
            decorations.push(hidden);
            hidden_syntax.push(hidden);
          }
        }
        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          // Only the visible part of a large code block needs line decorations.
          const from = Math.max(first_line.from, visible.from);
          const to = Math.min(last_line.to, visible.to);
          for (let line = state.doc.lineAt(from); line.from <= to; ) {
            decorations.push(
              Decoration.line({
                class: "md-code-line",
              }).range(line.from),
            );
            if (line.to === state.doc.length) break;
            line = state.doc.lineAt(line.to + 1);
          }
          return false;
        }
        return undefined;
      },
    });
  }
  add_list_line_decorations(view, list_items, list_markers, semantic_lines);
  add_quote_line_decorations(view, blockquotes, semantic_lines);
  add_prose_spacing(view, top_level_blocks, semantic_lines);
  add_source_prefix_decorations(
    view,
    semantic_lines,
    decorations,
    hidden_syntax,
  );
  append_semantic_line_decorations(semantic_lines, decorations);
  return {
    decorations: Decoration.set(decorations, true),
    hidden_syntax: Decoration.set(hidden_syntax, true),
  };
}

function add_prose_spacing(
  view: EditorView,
  blocks: SyntaxNode[],
  lines: Map<number, SemanticLine>,
) {
  const { state } = view;
  for (const block of blocks) {
    const previous = block.prevSibling;
    const before = prose_margin(state, block, "before");
    const after = previous ? prose_margin(state, previous, "after") : "0px";
    if (
      before === "0px" &&
      after === "0px" &&
      !/^(?:ATX|Setext)Heading/.test(block.name)
    )
      continue;
    const first_line = state.doc.lineAt(block.from);
    if (/^(?:ATX|Setext)Heading/.test(block.name))
      get_semantic_line(lines, first_line.from).classes.add("md-prose-heading");
    const gap = `max(${before}, ${after})`;
    // Source blank rows and block spacing are separate. Reusing the first
    // blank for this margin hides the visual effect of Enter and Backspace.
    const semantic = get_semantic_line(lines, first_line.from);
    semantic.classes.add("md-prose-block-start");
    semantic.styles.set("--md-prose-gap", gap);
  }
}

function prose_margin(
  state: EditorView["state"],
  block: SyntaxNode,
  side: "before" | "after",
) {
  const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(block.name);
  if (heading && !find_unfinished_bullet_marker(state, block)) {
    const level = Number(heading[1]);
    if (side === "before" && level === 1 && !block.prevSibling) return "0px";
    const scale =
      side === "before"
        ? [0, 2, 1.75, 1.5, 1.25, 1, 0.75][level]
        : [0, 1, 0.85, 0.5, 0.5, 0.4, 0.4][level];
    return `calc(var(--editor-spacing, 1.5rem) * ${String(scale)})`;
  }
  return side === "after" && (block.name === "Paragraph" || heading)
    ? "var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem))"
    : "0px";
}

function add_list_line_decorations(
  view: EditorView,
  list_items: ListItemRange[],
  list_markers: ListMarkerRange[],
  lines: Map<number, SemanticLine>,
) {
  const { state } = view;
  const deepest_items = deepest_blocks_by_line(view, list_items);
  const last_item_by_list = new Map<number, ListItemRange>();
  for (const item of list_items) {
    const last_item = last_item_by_list.get(item.list_from);
    if (!last_item || item.from > last_item.from)
      last_item_by_list.set(item.list_from, item);
  }
  const item_content_ends = new Map<ListItemRange, number>();
  for (const visible of view.visibleRanges) {
    for (
      let line = state.doc.lineAt(visible.from);
      line.from <= visible.to;
      line = line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
    ) {
      const item = deepest_items.get(line.from);
      if (
        item &&
        line.text.slice(quote_prefix_chars(line.text)).trim() !== ""
      ) {
        item_content_ends.set(item, line.from);
      }
      if (line.to === state.doc.length) break;
    }
  }
  const markers_by_line = new Map<string, ListMarkerRange>();
  for (const marker of list_markers) {
    const line_from = state.doc.lineAt(marker.node.from).from;
    markers_by_line.set(
      `${String(marker.item_from)}:${String(marker.item_to)}:${String(line_from)}`,
      marker,
    );
  }
  for (const visible of view.visibleRanges) {
    for (
      let line = state.doc.lineAt(visible.from);
      line.from <= visible.to;
      line = line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
    ) {
      const item = deepest_items.get(line.from);
      if (is_pending_list_marker(state, line.from)) {
        if (line.to === state.doc.length) break;
        continue;
      }
      const quote_only_line =
        quote_prefix_chars(line.text) === line.text.length &&
        line.text.includes(">");
      const has_later_item = item
        ? (last_item_by_list.get(item.list_from)?.from ?? item.from) > item.from
        : false;
      const trailing_quote_only_line =
        Boolean(item) && quote_only_line && !has_later_item;
      if (item && line.text.trim() !== "" && !trailing_quote_only_line) {
        const semantic = get_semantic_line(lines, line.from);
        semantic.classes.add("md-list-line");
        semantic.classes.add(`md-list-depth-${String(item.depth)}`);
        semantic.styles.set("--md-list-depth", String(item.depth));
        if (line.from === state.doc.lineAt(item.from).from)
          semantic.classes.add("md-list-item-start");
        if (line.from === item_content_ends.get(item))
          semantic.classes.add("md-list-item-end");

        const marker = markers_by_line.get(
          `${String(item.from)}:${String(item.to)}:${String(line.from)}`,
        );
        if (marker) {
          semantic.classes.add("md-list-marker-line");
          semantic.styles.set(
            "--md-list-prefix-chars",
            String(list_prefix_range(state, marker.node).width),
          );
          if (is_source_prefix_active(state, marker.node))
            semantic.classes.add("md-list-source-visible");
        }
      } else if (line.text.trim() === "") {
        // Blank source lines between loose items belong to the list even
        // though they sit outside either ListItem's syntax range.
        for (
          let node: SyntaxNode | null = syntaxTree(state).resolveInner(
            line.from,
          );
          node;
          node = node.parent
        ) {
          if (node.name !== "BulletList" && node.name !== "OrderedList")
            continue;
          const depth = count_ancestors_named(node, "ListItem") + 1;
          const semantic = get_semantic_line(lines, line.from);
          semantic.classes.add("md-list-line");
          semantic.classes.add(`md-list-depth-${String(depth)}`);
          semantic.styles.set("--md-list-depth", String(depth));
          break;
        }
      }
      if (line.to === state.doc.length) break;
    }
  }
  add_list_separator_lines(view, lines, deepest_items);
}

function add_quote_line_decorations(
  view: EditorView,
  blockquotes: BlockRange[],
  lines: Map<number, SemanticLine>,
) {
  const { state } = view;
  const deepest_quotes = deepest_blocks_by_line(view, blockquotes);
  const quote_starts = new Set(
    blockquotes.map((blockquote) => state.doc.lineAt(blockquote.from).from),
  );
  const quote_ends = new Set(
    blockquotes.map((blockquote) => state.doc.lineAt(blockquote.to).from),
  );
  for (const visible of view.visibleRanges) {
    for (
      let line = state.doc.lineAt(visible.from);
      line.from <= visible.to;
      line = line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
    ) {
      const quote = deepest_quotes.get(line.from);
      if (quote) {
        const semantic = get_semantic_line(lines, line.from);
        semantic.classes.add("md-quote-line");
        semantic.classes.add(`md-quote-depth-${String(quote.depth)}`);
        semantic.styles.set("--md-quote-depth", String(quote.depth));
        semantic.styles.set(
          "--md-quote-prefix-chars",
          String(quote_prefix_chars(line.text)),
        );
      }
      if (quote_starts.has(line.from))
        get_semantic_line(lines, line.from).classes.add("md-quote-start");
      if (quote_ends.has(line.from))
        get_semantic_line(lines, line.from).classes.add("md-quote-end");
      if (line.to === state.doc.length) break;
    }
  }
}

function deepest_blocks_by_line<T extends BlockRange>(
  view: EditorView,
  blocks: T[],
) {
  const deepest_by_line = new Map<number, T>();
  const { state } = view;
  for (const block of blocks) {
    for (const visible of view.visibleRanges) {
      if (block.to < visible.from || block.from > visible.to) continue;
      const from = Math.max(block.from, visible.from);
      const to = Math.min(block.to, visible.to);
      for (
        let line = state.doc.lineAt(from);
        line.from <= to;
        line =
          line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
      ) {
        const current = deepest_by_line.get(line.from);
        if (!current || block.depth > current.depth)
          deepest_by_line.set(line.from, block);
        if (line.to === state.doc.length) break;
      }
    }
  }
  return deepest_by_line;
}

function add_list_separator_lines(
  view: EditorView,
  lines: Map<number, SemanticLine>,
  list_items: Map<number, ListItemRange>,
) {
  const { state } = view;
  for (const visible of view.visibleRanges) {
    for (
      let line = state.doc.lineAt(visible.from);
      line.from <= visible.to;
      line = line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
    ) {
      const quote_only_line =
        quote_prefix_chars(line.text) === line.text.length &&
        line.text.includes(">");
      if (
        (line.text.trim() === "" || quote_only_line) &&
        line.from > 0 &&
        line.to < state.doc.length
      ) {
        const previous = state.doc.lineAt(line.from - 1);
        const next = state.doc.lineAt(line.to + 1);
        const previous_item = list_items.get(previous.from);
        const next_item = list_items.get(next.from);
        if (
          previous_item &&
          next_item &&
          previous_item.list_from === next_item.list_from &&
          lines.get(previous.from)?.classes.has("md-list-item-end") &&
          lines.get(next.from)?.classes.has("md-list-item-start")
        ) {
          get_semantic_line(lines, line.from).classes.add("md-list-separator");
        }
      }
      if (line.to === state.doc.length) break;
    }
  }
}

function add_source_prefix_decorations(
  view: EditorView,
  lines: Map<number, SemanticLine>,
  decorations: Range<Decoration>[],
  hidden_syntax: Range<Decoration>[],
) {
  const { state } = view;
  for (const visible of view.visibleRanges) {
    for (
      let line = state.doc.lineAt(visible.from);
      line.from <= visible.to;
      line = line.to === state.doc.length ? line : state.doc.lineAt(line.to + 1)
    ) {
      const blank =
        line.text.slice(quote_prefix_chars(line.text)).trim() === "";
      const semantic = blank
        ? get_semantic_line(lines, line.from)
        : lines.get(line.from);
      if (blank) semantic?.classes.add("md-blank-line");
      if (
        !semantic ||
        (!semantic.classes.has("md-list-line") &&
          !semantic.classes.has("md-quote-line"))
      ) {
        if (line.to === state.doc.length) break;
        continue;
      }

      const quote_prefix = quote_prefix_chars(line.text);
      const list_text = line.text.slice(quote_prefix);
      const marker_prefix = semantic.classes.has("md-list-line")
        ? /^\s*(?:[-+*]|\d+[.)])(?:[ \t]+|$)/.exec(list_text)?.[0]
        : undefined;
      const list_indent = /^\s*/.exec(list_text)?.[0] ?? "";
      const prefix_end = source_prefix_length(line.text);
      const prefix_to = line.from + prefix_end;
      const active = is_source_prefix_active(state, line);
      if (
        !active &&
        semantic.classes.has("md-list-line") &&
        !marker_prefix &&
        list_indent
      ) {
        const hidden = Decoration.replace({}).range(
          line.from + quote_prefix,
          line.from + quote_prefix + list_indent.length,
        );
        decorations.push(hidden);
        hidden_syntax.push(hidden);
      }
      if (!active || prefix_end === 0) {
        if (line.to === state.doc.length) break;
        continue;
      }

      semantic.classes.add("md-source-prefix-visible");
      decorations.push(
        Decoration.mark({ class: "md-source-prefix" }).range(
          line.from,
          prefix_to,
        ),
      );
      // Keep prefix spaces addressable between quote marks, list marks, and
      // task widgets so the source caret can stay in the full prefix.
      for (const space of line.text.slice(0, prefix_end).matchAll(/[ \t]+/g)) {
        decorations.push(
          Decoration.mark({ class: "md-prefix-space" }).range(
            line.from + space.index,
            line.from + space.index + space[0].length,
          ),
        );
      }
      if (line.to === state.doc.length) break;
    }
  }
}

function get_semantic_line(lines: Map<number, SemanticLine>, from: number) {
  let line = lines.get(from);
  if (!line) {
    line = { classes: new Set(), styles: new Map() };
    lines.set(from, line);
  }
  return line;
}

function append_semantic_line_decorations(
  lines: Map<number, SemanticLine>,
  decorations: Range<Decoration>[],
) {
  for (const [from, line] of lines) {
    const style = [...line.styles]
      .map(([name, value]) => `${name}: ${value}`)
      .join("; ");
    const options = { class: [...line.classes].join(" ") };
    decorations.push(
      Decoration.line(
        style ? { ...options, attributes: { style } } : options,
      ).range(from),
    );
  }
}

function list_prefix_range(state: EditorView["state"], marker: SyntaxNode) {
  const line = state.doc.lineAt(marker.from);
  const suffix = state.sliceDoc(marker.to, line.to);
  const after_marker = /^\s*/.exec(suffix)?.[0] ?? "";
  const quote_prefix_length = quote_prefix_chars(line.text);
  const from = line.from + quote_prefix_length;
  const to = marker.to + after_marker.length;
  return { from, to, width: to - from };
}

function list_marker_symbol(marker: string, depth: number) {
  if (marker !== "-" && marker !== "+" && marker !== "*") return marker;
  if (depth === 2) return "◦";
  if (depth >= 3) return "▪";
  return "•";
}

function quote_prefix_chars(text: string) {
  return /^(?:[ \t]*>[ \t]*)+/.exec(text)?.[0].length ?? 0;
}

function quote_prefix_range(state: EditorView["state"], mark_from: number) {
  const line = state.doc.lineAt(mark_from);
  const prefix = line.text.slice(0, quote_prefix_chars(line.text));
  const first_mark_offset = prefix.indexOf(">");
  return {
    from: line.from,
    to: line.from + prefix.length,
    first_mark_from: line.from + Math.max(0, first_mark_offset),
  };
}

function header_prefix_range(state: EditorView["state"], marker: SyntaxNode) {
  const line = state.doc.lineAt(marker.from);
  const quote_prefix_length = quote_prefix_chars(line.text);
  const in_list = has_ancestor_named(marker, "ListItem");
  const heading =
    find_ancestor_node(marker, "ATXHeading1") ??
    find_ancestor_node(marker, "ATXHeading2") ??
    find_ancestor_node(marker, "ATXHeading3") ??
    find_ancestor_node(marker, "ATXHeading4") ??
    find_ancestor_node(marker, "ATXHeading5") ??
    find_ancestor_node(marker, "ATXHeading6");
  const setext =
    find_ancestor_node(marker, "SetextHeading1") ??
    find_ancestor_node(marker, "SetextHeading2");
  if (setext) {
    const from = in_list ? marker.from : line.from + quote_prefix_length;
    return { from, to: line.to };
  }

  const first_heading_mark = heading
    ? find_descendant_named(heading, "HeaderMark")
    : null;
  if (
    heading &&
    first_heading_mark &&
    marker.from !== first_heading_mark.from
  ) {
    const before = state.sliceDoc(line.from, marker.from);
    const preceding_space = /[ \t]+$/.exec(before)?.[0] ?? "";
    const after = state.sliceDoc(marker.to, line.to);
    const trailing_space = /^[ \t]*/.exec(after)?.[0] ?? "";
    return {
      from: marker.from - preceding_space.length,
      to: marker.to + trailing_space.length,
    };
  }

  const from = in_list ? marker.from : line.from + quote_prefix_length;
  const spacing = /^[ \t]+/.exec(state.sliceDoc(marker.to, line.to))?.[0] ?? "";
  return { from, to: marker.to + spacing.length };
}

function find_unfinished_bullet_marker(
  state: EditorView["state"],
  node: SyntaxNode,
): SyntaxNode | null {
  if (node.name !== "SetextHeading2") return null;
  const marker = find_child_named(node, "HeaderMark");
  if (!marker || state.sliceDoc(marker.from, marker.to) !== "-") return null;
  const line = state.doc.lineAt(marker.to);
  const trailing_whitespace = state.sliceDoc(marker.to, line.to);
  return (trailing_whitespace.length > 0 &&
    /^\s+$/.test(trailing_whitespace)) ||
    is_pending_list_marker(state, marker.from)
    ? marker
    : null;
}

function source_prefix_length(text: string) {
  const quote_length = quote_prefix_chars(text);
  const list_text = text.slice(quote_length);
  const list_prefix = /^\s*(?:[-+*]|\d+[.)])[ \t]+/.exec(list_text)?.[0];
  if (!list_prefix)
    return quote_length + (/^[ \t]*/.exec(list_text)?.[0].length ?? 0);
  const task_prefix = /^\[[ xX]\][ \t]*/.exec(
    list_text.slice(list_prefix.length),
  )?.[0];
  return quote_length + list_prefix.length + (task_prefix?.length ?? 0);
}

function is_source_prefix_active(
  state: EditorView["state"],
  position: { from: number },
) {
  const line = state.doc.lineAt(position.from);
  const prefix_to = line.from + source_prefix_length(line.text);
  if (prefix_to === line.from) return false;
  const empty_list_prefix =
    prefix_to === line.to && is_empty_list_prefix(line.text);
  return (
    state.selection.ranges.some(
      (range) =>
        range.empty &&
        range.from >= line.from &&
        (range.from < prefix_to ||
          (empty_list_prefix && range.from === prefix_to)),
    ) || selected_find_intersects(state, line.from, prefix_to)
  );
}

function is_empty_list_prefix(text: string) {
  const list_text = text.slice(quote_prefix_chars(text));
  return /^[ \t]*(?:[-+*]|\d+[.)])(?:[ \t]+|$)$/.test(list_text);
}

function is_pending_list_marker(state: EditorView["state"], from: number) {
  const line = state.doc.lineAt(from);
  const text = line.text.slice(quote_prefix_chars(line.text));
  if (!/^[ \t]*(?:[-+*]|\d+[.)])$/.test(text)) return false;
  return state.selection.ranges.some(
    (range) => range.empty && range.head >= line.from && range.head <= line.to,
  );
}

function is_inline_source_active(state: EditorView["state"], node: SyntaxNode) {
  return (
    state.selection.ranges.some(
      (range) => range.empty && range.head > node.from && range.head < node.to,
    ) || selected_find_intersects(state, node.from, node.to)
  );
}

function find_unfinished_bullet_marker_in_ancestors(
  state: EditorView["state"],
  node: SyntaxNode,
): SyntaxNode | null {
  for (let parent: SyntaxNode | null = node; parent; parent = parent.parent) {
    if (/^SetextHeading[1-6]$/.test(parent.name)) {
      return find_unfinished_bullet_marker(state, parent);
    }
  }
  return null;
}

function find_child_named(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function find_descendant_named(
  node: SyntaxNode,
  name: string,
): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const descendant = find_descendant_named(child, name);
    if (descendant) return descendant;
  }
  return null;
}

function find_ancestor_node(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.name === name) return parent;
  return null;
}

function count_ancestors_named(node: SyntaxNode, name: string) {
  let count = 0;
  for (let current: SyntaxNode | null = node; current; current = current.parent)
    if (current.name === name) count++;
  return count;
}

function has_ancestor_named(node: SyntaxNode, name: string) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.name === name) return true;
  return false;
}

function decode_entity(source: string) {
  const decoder = document.createElement("textarea");
  decoder.innerHTML = source;
  return decoder.value || source;
}

class MarkdownSymbol extends WidgetType {
  constructor(
    readonly text: string,
    readonly class_name: string,
  ) {
    super();
  }
  eq(other: MarkdownSymbol) {
    return this.text === other.text && this.class_name === other.class_name;
  }
  toDOM() {
    const symbol = document.createElement("span");
    symbol.className = this.class_name;
    symbol.textContent = this.text;
    symbol.setAttribute("aria-hidden", "true");
    return symbol;
  }
}

class LegacyHtmlBreak extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const line_break = document.createElement("br");
    line_break.className = "md-html-break";
    line_break.setAttribute("aria-hidden", "true");
    return line_break;
  }
}

class TaskCheckbox extends WidgetType {
  constructor(
    readonly from: number,
    readonly checked: boolean,
    readonly read_only: boolean,
  ) {
    super();
  }

  eq(other: TaskCheckbox) {
    return (
      this.from === other.from &&
      this.checked === other.checked &&
      this.read_only === other.read_only
    );
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.disabled = view.state.readOnly;
    input.className = "md-task-checkbox";
    input.setAttribute("aria-label", "Complete task");
    input.addEventListener("change", () => {
      if (view.state.readOnly) return;
      const marker = view.state.sliceDoc(this.from, this.from + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({
        changes: {
          from: this.from + 1,
          to: this.from + 2,
          insert: input.checked ? "x" : " ",
        },
        userEvent: "input.task",
      });
    });
    return input;
  }
}

# Design

This is a plugin-driven, source-preserving Markdown editor on CodeMirror 6. The Markdown text is the document. Rich rendering is decoration over that text. Plugins add syntax, rendering, and behavior.

The behavior contract lives in [the spec](../../docs/markdown_editor_behavior_spec.md). This file explains the model that lets us meet it.

## Why not copy Milkdown

Milkdown keeps a ProseMirror document and serializes it back to Markdown, so every edit goes through a serializer and unrelated Markdown can change. It also needs its own context and timer system (`ctx`, slices, timers) because ProseMirror has no extension composition. Many Milkdown plugin bugs are ordering bugs in that system ("Context not found").

We keep the good ideas:

- A construct is one exported object. Other code references it by import.
- A plugin is configured by calling its factory with options.
- Tests build a real editor.

We skip the rest. CodeMirror already composes extensions through facets, fields, and precedence. A plugin here is a plain typed description that compiles to CodeMirror extensions once, when the state is created. There is no runtime context and no async startup.

## Vocabulary

| Noun      | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| Source    | The Markdown text and its original line endings. The only thing that is saved or undone. |
| Syntax    | The Lezer tree for the source. Plugins extend the parser. There is no second parser.     |
| Construct | A named piece of syntax with rendering and behavior: heading, table, callout.            |
| Context   | The constructs around a position, innermost first.                                       |
| Layer     | One container level on one line: a quote marker, a list marker, or list indentation.     |
| Surface   | An editable widget, like a code body or a table cell. It edits a window of the source.   |

## Constructs come in three kinds

| Kind     | Examples                                                       | Renders with                            | Shows source when                           |
| -------- | -------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `inline` | bold, italic, strike, inline code, link, image, escape, `<br>` | marks, hidden markers, inline widgets   | an empty caret touches the node             |
| `line`   | heading, list item, quote, callout, rule, frontmatter          | line classes, hidden or replaced prefix | an empty caret is inside the line's prefix  |
| `block`  | fenced code, table                                             | one block widget over whole lines       | while it is being typed, or after a command |

The kind decides where decorations come from, which keeps CodeMirror's height map correct:

- `inline` and `line` decorations come from one view plugin that walks the visible tree once.
- `block` widgets come from one state field over the whole document. A block always covers whole lines, including container prefixes, and its structure never depends on how far the parser has got.

## Plugins

```ts
type MarkdownPlugin = {
  name: string;
  requires?: readonly string[];
  syntax?: MarkdownConfig | readonly MarkdownConfig[]; // Lezer extensions
  constructs?: readonly Construct[];
  keys?: readonly KeyBinding[]; // plugin-wide shortcuts, like Mod-b
  theme?: ThemeSpec; // an EditorView.theme spec, so it beats CodeMirror's defaults
  extensions?: Extension; // escape hatch: raw CodeMirror extensions
};
```

The editor builds once from a list of plugins:

```ts
const state = create_markdown_state(source, {
  plugins: [
    commonmark(),
    gfm(),
    frontmatter(),
    callouts(),
    code_blocks({ languages, copy_code, render_diagram }),
    links({ open_link }),
    images({ resolve_image }),
    wiki_links({ query_wiki_links }),
    slash_menu(),
    find(),
    clipboard({ html_to_markdown, on_image_paste }),
  ],
});
const view = new EditorView({ state, parent });
```

Hosts that cache one `EditorState` per note (Otterly does) call `create_markdown_state` directly. `create_markdown_editor({ parent, source, plugins })` also makes the view.

Build rules, checked when the state is created:

- A missing `requires` name throws `PluginBuildError` naming the plugin.
- Two constructs with the same name throw, unless the later one sets `replaces: "<name>"`. That is how you swap out a built-in construct.
- Plugin order only matters for `replaces`. Keys are ordered by context, and the slash menu has its own order.

## Constructs

```ts
type InlineConstruct = {
  kind: "inline";
  name: string;
  nodes: readonly string[]; // Lezer node names it owns
  decorate?: (node: SyntaxNodeRef, render: Render) => void;
  render_static?: (node: SyntaxNodeRef, context: StaticContext) => Node | null;
  literal?: boolean;
  keys?: ConstructKeys;
  insert?: readonly InsertItem[];
};

type LineConstruct = {
  kind: "line";
  // name, nodes, literal, keys, insert as above
  decorate?: (node: SyntaxNodeRef, render: Render) => void;
  container?: ContainerSpec; // quotes and list items
  decorate_layer?: (layer: Layer, line: LineContainer, render: Render) => void;
};

type BlockConstruct = {
  kind: "block";
  // name, nodes, literal, keys, insert as above
  reveal: "caret" | "surface";
  complete?: (block: Block, state: EditorState) => boolean;
  widget: (block: Block, state: EditorState) => BlockWidget;
};
```

`decorate` records decorations through `render` instead of building decoration sets:

```ts
render.reveal; // inline constructs: an empty caret touches this node
render.touches(from, to); // the inline rule for any range
render.caret_in(from, to); // the prefix rule: from <= caret < to
render.prefix_revealed(line); // the caret is inside this line's container prefix
render.mark(from, to, "md-strong");
render.hide(from, to); // hidden source is atomic for arrow keys
render.replace(from, to, widget);
render.widget(at, widget);
render.line(line_from, "md-heading md-heading-2");
render.lines(from, to, "md-code-line");
render.wrap(node, "md-quote"); // an element around the node's whole lines
render.gap(node, { before: "1rem" }); // space above a top-level block
```

The core owns the reveal rule, atomic ranges, the drag freeze, and forced reveal for find matches. A construct asks the core instead of checking the selection itself.

## Line boxes

CodeMirror estimates the height of every line it has not drawn from one sample: the first drawn line that holds nothing but short plain text (at most 20 characters, no elements inside). If that sample has a padded or taller box, the estimate changes as the viewport moves. The viewport then never settles, and clicks land on a half-drawn view. So the rendering keeps this rule:

- A line box never carries vertical space. Container boxes and spacing go on wrappers. `render.wrap(node, class)` puts an element (a CodeMirror block wrapper) around a node's whole lines. Deeper nodes nest inside shallower ones, and calls for the same node share one element, which is how a callout adds its classes to its quote. `render.gap(node, space)` is the space above a top-level block. It sits outside the block's own wrapper, and the larger of the block's `before` and the previous block's `after` wins.
- A line that needs a different box anyway, like a heading or a blank row, never shows plain text alone. Markers and blank-row whitespace are hidden ranges, and the core wraps the text of any other styled line in a plain `md-line-text` mark. Either way the line holds an element, and CodeMirror does not sample it.

Theme rules select this editor's lines with `line_selector(".md-class")`, which matches lines directly in `.cm-content` and inside wrappers, but not lines of nested editors. The `SPACE-009` test reads every theme and fails if a line CodeMirror could sample carries a class with vertical styling.

`literal` marks content that is not Markdown prose: fenced code, inline code, frontmatter, raw HTML. Menus, rich paste, and formatting commands stay out of literal content. `is_literal_block` ignores inline literals, for block commands.

`render_static` draws a node as plain DOM where there is no live editor, such as inactive table cells. `render_static(state, node, from, to, parent)` in the core walks a node and calls each construct's `render_static`.

## Context and keys

`markdown_context(state, pos)` returns the constructs around a position, innermost first:

```text
"> - [ ] buy **milk‸**"

  emphasis    inline
  paragraph   line
  list_item   line     layer "- [ ] ", content column 4
  blockquote  line     layer "> ", content column 2
```

Construct keys (Enter, Shift-Enter, Mod-Enter, Backspace, Tab, Shift-Tab) dispatch through context. The core walks the context from innermost to outermost and runs each construct's handler for that key. The first handler that returns `true` wins. Plugin-wide keys and CodeMirror's defaults run after that. An open completion menu and a focused surface see keys first.

```text
Enter at "> - item‸"       list_item.Enter   continue the item
Enter at "> - ‸"           list_item.Enter   lift one level
Enter at "> ‸"             blockquote.Enter  leave one quote level
Shift-Enter in any prose   paragraph         hard break plus the container prefix
```

## Layers

A line's container prefix is a list of layers:

```ts
type Layer = {
  construct: LineConstruct;
  node: SyntaxNode;
  from: number; // prefix start on this line
  to: number; // prefix end on this line
  column: number;
  content_column: number; // tab-expanded column where content starts
  marker: string; // "> ", "- ", "1. ", "- [ ] ", or indentation
  opening_marker: string; // the marker on the container's first line
  first_line: boolean;
  lazy: boolean;
};

type LineContainer = {
  line: Line;
  layers: readonly Layer[]; // matched on this line, outermost first
  open_layers: readonly Layer[]; // every open container, including lazy ones
  content_from: number;
  lazy: boolean; // a continuation line without its own prefix
  blank: boolean;
};
```

`line_container(state, line)` is the only place that parses a prefix. It follows CommonMark container matching: walk the open containers from outermost to innermost, and let each one match its marker or continuation at the current offset. Each container construct describes its own prefix through `ContainerSpec` (`match_first`, `match_continuation`, `continuation`, `next_sibling`).

Editing helpers built on layers:

| Helper                | Meaning                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `continuation_prefix` | Prefix for a new line inside every open container.                         |
| `sibling_prefix`      | Prefix for the next sibling, such as the next list item.                   |
| `continues_paragraph` | Would text on this line be a lazy continuation of the paragraph above?     |
| `insert_lines`        | Insert block text with the container prefix on every line after the first. |

`insert_lines` is why a slash command inside a quote produces a quoted code block.

## Blocks

The block field is a `StateField` provided through `EditorView.decorations`:

- It scans block-level nodes of the complete tree. Inline nodes are never visited.
- A block's range is `line_at(node.from).from` to `line_at(node.to).to`. A widget inside a quote sits inside the quote's wrapper, so the quote stays one continuous shape around it. The widget indents itself for list levels with `wrap_in_layers(block, content)`. Widgets put their vertical spacing on the `.md-block-body` element inside the layers. When the main selection covers the whole block, the core adds `md-block-selected` to the widget root and paints one overlay. Native selection inside widget markup never paints.
- A focused prose caret never rests on a rendered surface block. The core hands it to the surface, at its own position or the nearer edge, so it never draws as a bar the height of the widget.
- `BlockWidget.eq` compares the widget class, the source slice, the view state, and read-only state. It never compares object identity, so a reparse keeps the DOM and its focus.
- Equal widgets are reused after text above them moves. A controller looks up its current block with `block_for_dom` and never trusts stored positions.
- Measured heights are cached by source, so scrolling back to a block does not jump.
- View state that is not Markdown, like a code block's height, lives on the block (`patch_block_view_state`, `read_block_view_states`).

Construction: a block that appears from typing and holds the caret is being constructed. It stays source until the caret leaves it, or a construct key finishes it (`finish_block_construction`), for example Enter after a fence header or a table delimiter. Commands that insert a whole block, such as slash commands, get the widget right away. `edit_block_source` shows a block's source on purpose until the caret leaves.

## Surfaces

A surface is an editable block widget. Code bodies and the active table cell both use `NestedEditor`: a CodeMirror view nested in the widget, over a source window.

````text
outer:  > ```py\n> a = 1\n> b = 2\n> ```
inner:  a = 1\nb = 2          the "> " prefixes stay outside the window
````

- Inner edits map to outer changes and dispatch on the outer view in the same tick. History lives only in the outer source. Mod-z in a surface runs `source_undo` on the outer view.
- Outer changes refresh the inner text. An annotation stops the echo.
- A code body window strips container prefixes and adds them back on new lines. A body line that looks like a closing fence grows the fence.
- A table cell window unescapes pipes, escapes typed pipes, and keeps padding outside the window.
- `surface_highlights` lets a plugin publish outer ranges, such as find matches, that every surface draws inside its own text.

The core owns focus and scroll:

- `focus_selection(view)` focuses the surface that owns the outer selection, keeping a selected range and its direction. Focus never scrolls the page. The core scrolls only to mount an offscreen block.
- Arrow keys on the line next to a block call the surface's `enter`. Arrows at a surface edge call `leave_block`, which moves to a neighboring surface or the adjacent source row. Arrows never create source.

Inactive table cells are static rendered HTML. Only the active cell has a nested view.

## Reveal

| Kind            | Rule                                                    |
| --------------- | ------------------------------------------------------- |
| inline          | An empty caret is in `[node.from, node.to]`, inclusive. |
| line prefix     | An empty caret is in `[line start, content start)`.     |
| block `caret`   | An empty caret touches the block.                       |
| block `surface` | Only while constructing or after `edit_block_source`.   |

Non-empty selections never reveal, so text does not shift while selecting. `reveal_ranges` lets a plugin force a range to show source; find uses it for the selected match. Reveal does not change while the mouse button is down, or for 100 ms after release, so a click does not move text under the pointer.

Images draw their widget after the source and keep it visible while the source is revealed, so the caret entering an image does not make the layout jump.

## Parsing

Lezer parses whole documents quickly:

| Document                 | Full parse | One-character edit |
| ------------------------ | ---------- | ------------------ |
| 19 KB note               | 2 ms       | 0.2 ms             |
| 1.4 MB normal paragraphs | 89 ms      | 1.3 ms             |
| 1.4 MB single paragraph  | 1.5 s      | 1.5 s              |

- Up to 1 MB, with no block over 200 KB, the block field asks for the complete tree.
- Above that, the viewport parses first and the rest continues in idle slices. Blocks past the parsed frontier keep their previous widgets until the parser gets there.
- One giant paragraph is a known limit (PERF-006). Lezer cannot stop inside a block.

## Failure isolation

The core runs every construct's `decorate`, `decorate_layer`, `widget`, `render_static`, and key handler inside `guard`. If one throws, the core logs it once with the construct name and renders that node as source. When a CodeMirror view plugin throws, CodeMirror disables the whole plugin, which is how the old editor ended up showing raw Markdown everywhere.

## Theming

- Colors and spacing come from the host's CSS variables (`--foreground`, `--border`, `--editor-*`), with standalone fallbacks.
- Class names are `md-<construct>` and `md-<construct>-<part>`. Treat them as public: removing one is a breaking change.
- Each plugin ships its theme beside its code. The core compiles it with `EditorView.theme`, so it wins over CodeMirror's own defaults, such as the autocomplete menu. Hosts override it with ordinary CSS or their own `EditorView.theme` added after the plugins.
- Line rules use `line_selector`, and vertical space goes on wrappers (see "Line boxes").

## Host boundary

Plugins take host callbacks as options. Async callbacks get an `AbortSignal` that aborts when the result is no longer wanted.

| Plugin        | Host callbacks                                                      |
| ------------- | ------------------------------------------------------------------- |
| `links`       | `open_link`, `copy_link`, `edit_key`                                |
| `images`      | `resolve_image(source, signal)`                                     |
| `wiki_links`  | `query_wiki_links(query, signal)`                                   |
| `clipboard`   | `html_to_markdown`, `on_image_paste`                                |
| `code_blocks` | `languages`, `copy_code`, `render_diagram`, `on_view_states_change` |

## Source and history

- The display document is LF-normalized. A shadow raw document keeps original line endings and the BOM. Edits map between them.
- History lives on the raw document. Use `source_undo` and `source_redo`.
- Public positions are UTF-16 offsets in the display document.

## Example: callouts

`plugins/callouts` adds `> [!warning] Title` callouts in about 100 lines. A callout is a quote whose first line starts with `[!type]`, so it needs no syntax: it is a second line construct on `Blockquote`.

```ts
{
  kind: "line",
  name: "callout",
  nodes: ["Blockquote"],
  decorate(node, render) {
    // read "[!type]" after the quote prefix on the first line
    render.wrap(node.node, `md-callout md-callout-${color}`); // joins the quote's wrapper
    if (!render.touches(marker_from, marker_to))
      render.replace(marker_from, marker_to, new CalloutLabel(type));
  },
  insert: [{ id: "callout", label: "Callout", lines: ["> [!note] "] }],
}
```

Enter, Backspace, and lifting already work, because the quote construct owns those keys. The slash menu picks up the insert item.

## Layout

```text
src/
  index.ts                public API
  core/
    plugin.ts             plugin and construct types, registry build
    editor.ts             create_markdown_state, the compiled extension list
    source_state.ts       raw source, line endings, history
    syntax.ts             parser assembly, full-parse policy, viewport parsing
    context.ts            line_container, layers, markdown_context, insert_lines
    reveal.ts             reveal rules, forced reveal, drag freeze
    inline_rendering.ts   the one view plugin for inline and line constructs
    block_field.ts        the one state field for block constructs
    surface.ts            NestedEditor, source windows, focus, enter and leave
    static_render.ts      static DOM for inline Markdown
    keys.ts               context key dispatch
  plugins/
    commonmark/  gfm/  code_blocks/  frontmatter/  links/  images/
    wiki_links/  menus/  callouts/  find.ts  clipboard.ts
  testing/
    test_editor.ts        a real editor driven by key events
```

## Testing

`@otterly/markdown-editor/testing` builds a real editor and drives it with key events. `‸` marks the caret and `‹` a selection anchor.

```ts
test("QUOTE-003 two Enters leave quoted prose", () => {
  const editor = test_editor("> text‸", [commonmark()]);
  editor.press("Enter", "Enter").type("out");
  expect(editor.source()).toBe("> text\n\nout‸");
});
```

- Tests are grouped by area and named by spec ID.
- jsdom has no layout. Geometry, focus, scroll, and IME need native checks in the app.

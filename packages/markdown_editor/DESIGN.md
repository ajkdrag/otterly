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

| Kind            | Rule                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| inline          | An empty caret is in `[node.from, node.to]`, inclusive.                                           |
| line prefix     | An empty caret is in `[line start, content start)`.                                               |
| block `caret`   | An empty caret touches the block.                                                                 |
| block `surface` | Only while constructing or after `edit_block_source`.                                             |
| block `surface` | With `reveal_surfaces_at_caret`: like a `caret` block, and also while a selection lies inside it. |

Non-empty selections never reveal, so text does not shift while selecting. The one exception is a selection inside a surface block under `reveal_surfaces_at_caret`: it keeps the source, so Vim's visual mode in a code block does not swap the widget back in. A selection that reaches past the block keeps the widget. `reveal_ranges` lets a plugin force a range to show source; find uses it for the selected match. Reveal does not change while the mouse button is down, or for 100 ms after release, so a click does not move text under the pointer.

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

| Plugin            | Host callbacks                                                      |
| ----------------- | ------------------------------------------------------------------- |
| `links`           | `open_link`, `copy_link`, `edit_key`                                |
| `images`          | `resolve_image(source, signal)`                                     |
| `wiki_links`      | `query_wiki_links(query, signal)`                                   |
| `clipboard`       | `html_to_markdown`, `on_image_paste`                                |
| `code_blocks`     | `languages`, `copy_code`, `render_diagram`, `on_view_states_change` |
| `vim` (extension) | `on_status_change`, `on_write`, `on_quit`, `clipboard`              |

## Source and history

- The display document is LF-normalized. A shadow raw document keeps original line endings and the BOM. Edits map between them.
- History lives on the raw document. Use `source_undo` and `source_redo`.
- Public positions are UTF-16 offsets in the display document.

## Source mode

`set_editor_mode(view, "source")` shows the plain Markdown. The mode is a state field, so the switch keeps the document, selection, and history. In source mode the block field and inline rendering draw nothing, and construct keys and block arrow keys step aside. Blocks are still tracked, so their view states survive the trip back. Pass `source_extensions` (for example a highlighter) to `create_markdown_state`. They sit in a compartment that only holds them in source mode.

`create_text_state(source, extensions)` builds a state for a file that is not Markdown. It has the same line ending handling and undo as a note, without the plugins.

## Vim

`vim_keybindings({ on_status_change, on_write, on_quit, clipboard })` (`plugins/vim`) is an extension, not a construct plugin, so it works on Markdown and text states. Hosts usually put it in a compartment to toggle it. It wraps `@replit/codemirror-vim`. The goal is real Vim: `tests/vim_conformance_cases.json` holds 402 cases (text, cursor, keys) with what Vim 9.1 did, and `vim_conformance.test.ts` runs the engine against them. `scripts/vim_ground_truth.mjs` re-checks the table against a real `vim` (dev only, not in CI).

Files in `plugins/vim/`, one job each:

| File                  | Job                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| `index.ts`            | `vim_keybindings()`, engine command patches (undo, `:w`, `o`), theme     |
| `status.ts`           | mode, showcmd and recording, reported to the host                        |
| `undo_steps.ts`       | what one undo step is                                                    |
| `input_guards.ts`     | Esc and menus, and keys and text that must not edit in normal mode       |
| `map_prefix_wait.ts`  | maps that start with a key Vim already binds, and `timeoutlen`           |
| `vimrc.ts`            | `apply_vimrc`                                                            |
| `vim_option_names.ts` | every option name Vim or Neovim has, to tell a skipped `set` from a typo |

### Keys

- `vim()` sits at `Prec.highest`, so Vim keys beat `context_keymap`. All keymaps run from one `Prec.default` DOM handler, the menus' `Prec.highest` keymap included, so Vim sees every key first. Enter and the arrows are not Vim keys in insert mode, so they already reach the menu.
- `close_menu_before_leaving_insert` runs before Vim. Esc, Ctrl-[ and Ctrl-c in insert mode close a menu you can see and stay in insert mode. A menu that is only pending (`activateOnTypingDelay` after every key, or a wiki query running) is closed too, but the key goes on to Vim. Before this, Esc within 100 ms of typing was eaten and you stayed in insert mode. A mode change by other routes (`jk`, `<C-o>`) closes the menu too.
- `normal_mode_guards` runs right after Vim, so it only sees what Vim did not take. In normal, visual and operator-pending mode it swallows Tab, Enter, Backspace and Delete with any modifier, and on macOS every Ctrl combo without Cmd. It also swallows the editing keys of CodeMirror's `defaultKeymap` (Alt-Up and Alt-Down move a line, Shift-Alt-Up and Shift-Alt-Down copy it, Cmd-[ and Cmd-] indent, and so on). It finds them by command, so a key that an upgrade gives one of those commands is guarded too. Without the guards CodeMirror's emacs keys (Ctrl-k, Ctrl-h, Ctrl-t), Shift-Tab and Alt-Backspace edit the note behind Vim's back. Text that arrives without a key (the accent menu, the emoji picker, dictation, an IME commit) is dropped, except right after `f`, `t` and `r`, where the engine handles dead keys itself.

### Undo

`u` and `<C-r>` go to `source_undo` and `source_redo`. The plugin patches the engine's `CodeMirror.commands` once at load, which survives a vimrc reload, and points `:undo` and `:redo` at the patched commands, because the engine copied the originals into its ex table. `<C-r>` and `u` leave the cursor on a character, never past the line end. `:unmap` only says it works in the vimrc, because the engine's version removes built-in keys.

A step is what Vim says it is: one typed key, or one insert session (from the key that opened insert mode to Esc, however long the pauses, unless an arrow key or a click moves the cursor). A macro, a map and `.` are one step each: every change the engine makes while it handles one typed key joins that key's step. `undo_steps.ts` knows it is inside a key from a flag that a microtask clears, not from the user event, because `o` on a list item changes the note through the Enter construct key, which has another one. A paste from the context menu is no typed key, so it starts a step. CodeMirror's history groups by time instead (500 ms), so `undo_steps.ts` annotates every change with `source_history_group` (`core/source_state.ts`), which forwards `isolateHistory` or a `compose` user event. CodeMirror joins a compose event to the previous one whatever the time, and a non-compose event after `isolate: before` always starts a new one. Vim off never sets the annotation. A step also remembers the cursor from before its key, which `u` restores.

@Incomplete: after `<C-o>` in insert mode, the first typed character joins the step of the `<C-o>` command. Vim splits there.

### Status

`on_status_change(status)` gets `{ mode, showcmd, recording }` whenever any part of it changes, first when the extension is built (enable, `setState`). `mode` is `normal`, `insert`, `insert_normal` (the one command after `<C-o>`), `visual`, `visual_line`, `visual_block` or `replace`. `showcmd` is Vim's: the keys of a command still being typed (`2d`, `"a`, a held `<Space>`), or in visual mode the size of the selection (`3`, `2`, `2x3`). It is empty while a `/` or `:` prompt is open. `recording` is the register of a macro being recorded; the engine only exposes that through `getVimGlobalState_().macroModeState`, which it calls a testing hook. A buffer that was left in visual mode comes back in normal mode with its selection collapsed to the head.

### Maps that start with a Vim key

The engine runs a full built-in match before it looks at a longer map, so `nnoremap <Space>w ...` would never fire: Space moves right at once. Vim waits `timeoutlen` instead, and `map_prefix_wait.ts` does too. `apply_vimrc` registers such a map under an alias for the first key (`<Space>w` becomes `<OtterlyPrefixSpace>w`; the name comes from the key, so a macro recorded with it still runs after a vimrc edit). `Vim.handleKey` holds a typed Space while a map starts with it: the next key that continues a map runs the map, any other key runs Space and then that key, Esc, Ctrl-[ and Ctrl-c drop the held key, and `timeoutlen` (default 1000, `set timeoutlen=500`) runs Space alone. Only typed keys are held. Macros, maps and `.` pass through. A held key is dropped on blur, when the editor goes away and on every `apply_vimrc`. Showcmd keeps showing the held key and the keys after it while a longer map waits. Esc cancels instead of running the built-in first. Vim would run Space and beep, but cancelling is what people mean.

### Host commands

- `:w` calls `on_write`, `:q` and `:q!` call `on_quit`, `:wq` and `:x` await `on_write` and then call `on_quit`. A save that rejects keeps the note open. `:q` never discards, because the host's close asks about unsaved changes. Without the callbacks the prompt says `:w does not save here`.
- `"+` and `"*` are the system clipboard, and `set clipboard=unnamed` (or `unnamedplus`) writes every unnamed yank, delete and change to it, like Vim. The engine is global, so the last editor built sets `clipboard.read_text` and `write_text` for the page. A read that fails shows `Could not read the clipboard`.
- A plain `p` never waits on the clipboard. It puts the unnamed register at once, so `nnoremap Q yypx` and `xp` in a map or macro see the text they just yanked. Text that another app put on the clipboard reaches that register through `sync_clipboard_from_host()`, which the host calls when its window gains focus. The editor also calls it after Cmd+C and Cmd+X, and when it gains focus (a copy in the omnibar or a dialog). The host's code block copy button and Copy link call it too. It skips text we wrote ourselves, so the register keeps its type. Only `"+p`, `"*p` and `<C-r>+` read the clipboard, after any write still in flight.
- `o` and `O` continue a list, task or quote in rich mode, like Enter in insert mode. `o` runs the Enter construct key (`run_construct_key`). `O` inserts the line's own marker (a task starts unchecked) on a new line above, because the engine's version, Enter at the end of the previous line, sees the wrong container. The engine gives no way to wrap its `newLineAndEnterInsertMode` action, so `index.ts` replaces it with a copy that has the extra branch. An empty item gets a plain line, and so does `O` on a callout header (`> [!note]`), because a new quote line above it would push `[!note]` off the first line and end the callout. `r<CR>` is a bare line, like Vim. Source mode and text files stay plain, like Vim.
- `close_vim_prompt(view)` closes an open `/` or `:` prompt. The host calls it before it shows another buffer, or the prompt comes back as an empty strip.

### Rich Markdown

- It turns on `reveal_surfaces_at_caret`. Code blocks and tables show their source while the caret, or a whole selection, is in them, so one Vim instance edits the whole document and no key lands in a nested editor. `j`, `k` and the up and down arrows step onto the block's nearest line. CodeMirror's vertical motion skips widgets, so the plugin wraps the engine's `findPosV` (what `j` and `k` ask) to answer with the target line when the screen step would jump over a rendered block. The arrow keys do the same in `enter_adjacent_block`. Left and right already land on the block's edge. A click inside a rendered surface still focuses its nested editor. The block keeps its widget until the reveal freeze ends, about 100 ms after the button comes up. Then the block turns into source, for a caret and for a range selection (double click, drag) alike, and the nested view is destroyed with its focus. The core hands focus back to the outer view and keeps the outer selection.
- The theme uses host variables (`--primary`, `--muted`, `--font-mono`) for the block cursor and the `/` prompt. The editor root gets `md-vim`. The host reads it to keep Ctrl keys for Vim on macOS (`use_keyboard_shortcuts`). On Windows and Linux the app's Ctrl hotkeys win over Vim's Ctrl keys. The engine leaves Ctrl-v alone in insert mode and lets Ctrl-c copy a selection, so paste and copy should still work there. I read that in its source and have not tried it on Windows or Linux.

### Engine patches

The fixes below live in closures of `@replit/codemirror-vim-core` and `@replit/codemirror-vim` that the public API does not reach. They are pnpm patches (`patches/`, `patchedDependencies` in `pnpm-workspace.yaml`). Every hunk starts with `// otterly patch Vn: <what Vim does>`, so an upgrade can find and re-check them, and the conformance suite fails when an upgrade drops one. They are fixes the engine's authors would probably take, which is a follow-up.

| Id      | What Vim does that the engine did not                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| V1      | a linewise delete that reaches the last line (`5dd`, `dG`, `dap`) leaves no empty line                              |
| V2, V3  | `dk` on line 1, `dj` on the last line, `dfz` with no `z` and `d])` with no match fail                               |
| V4      | `d}` from column 0 is linewise (`:help exclusive-linewise`)                                                         |
| V5      | `da"` takes the white space after the closing quote, or before the opening one                                      |
| V6, V7  | `3rx` past the line end fails; `~` at the line end keeps the cursor on a character                                  |
| V8, V14 | the cursor after `p` and `P`, and after `y` with a backward motion or text object                                   |
| V9, V10 | `v$d` takes the line break; `Vp` stores the replaced text with its type and fixes the cursor                        |
| V11     | `_`, `+` and `-` are linewise (`d_` is `dd`)                                                                        |
| V12     | `J` adds no space before `)` or after a trailing blank                                                              |
| V13     | `ci{` on a function body keeps both braces on their own lines                                                       |
| V21     | a `.` repeat works out linewise again, so `ci{` on a one-line pair after a multi-line one                           |
| V15     | insert `<C-w>` and `<C-u>` delete into the black hole register                                                      |
| V16     | a recursive map whose rhs starts with its lhs runs those keys unmapped (`nmap x xp`)                                |
| V17     | `"+`, `"*`, `<C-r>+` and `set clipboard`, through a clipboard hook the host replaces. A plain `p` stays synchronous |
| V18     | a backward search from inside a match skips that match                                                              |
| V19     | the half block cursor shows only while an operator waits                                                            |
| V20     | `dap` on the last paragraph takes the blank lines before it                                                         |

### Accepted deviations

Cases in the conformance table where we differ from Vim on purpose. The reason is what a user would read:

- `{count}%`, `gp`, `gP`, `U`, search offsets (`/foo/e`) and `[count]v` are not supported.
- Search ignores case unless the pattern has a capital letter, and `*` and `#` always ignore case.
- `dit` and `dat` need an HTML syntax tree, and notes have none.
- Word motions treat CJK ideographs and kana as one word class. `x` on a base letter leaves its combining marks behind. `gU` uses JavaScript case mapping (`ß` becomes `SS`).
- `dw` on an empty line stores a characterwise line break. `J` adds one space after a period (`nojoinspaces`).
- Insert `<C-u>` deletes to the line start, not only this insert's text. Backspace in Replace mode moves left without restoring the replaced text. `O` on the first line does not copy the indent. After a block `A` the cursor stays where the insert went.
- Folding does not exist in notes, so `zc`, `zo` and `za` do nothing.

### vimrc

`apply_vimrc(text)` applies a small vimrc subset to the global engine and returns the lines it did not apply, each with a `severity`. Each call starts clean, so a deleted line goes away on reload.

- Map commands: `map nmap vmap xmap imap omap`, their `noremap` and `unmap` forms, and Vim's short names (`nn`, `xn`, `ino`, `se`). `unmap` only removes maps from the same file, because the engine's own unmap of a built-in key breaks its `mapclear()`. `let mapleader` and `let maplocalleader` (also `g:`) set the key that `<leader>` and `<localleader>` become in the lines after them, like Vim does at definition time. `set` takes the engine's options plus `clipboard` and `timeoutlen`.
- The engine compares the exact spelling of each key, so the parser rewrites every `<...>` token first: `<esc>` becomes `<Esc>`, `<cr>` and `<Enter>` become `<CR>`, `<C-J>` becomes `<C-j>`, and `<M-x>` becomes `<A-x>`. A `<name>` it does not know is an error (`<lt>` writes a literal `<`), except in an insert-mode rhs and in a `:` rhs, which type it as text. `<Nop>` maps a key to nothing. A leading `:` on a line is fine. A `"` after a space ends a `set` line, and a `"` after the quoted value ends a `let mapleader` line, as in Vim.
- Recursive maps follow `:help recursive_mapping` (V16). A map whose rhs contains its own lhs anywhere but the start, and two maps that contain each other, are errors and are not applied. @Incomplete: longer loops are not found. The engine stops them quietly at run time.
- **error** is a line you meant to work and did not: an unknown command, key or option, a bad value, a `:` map, a recursion loop. **skipped** is Vimscript and terminal-only settings that mean nothing here, so a vimrc pasted from terminal Vim does not drown the real errors: `syntax`, `filetype`, `colorscheme`, `autocmd`, `function`, `if`, `for`, `call`, `Plug`, `let` of anything but a leader, `try` blocks, `lua << EOF` scripts (the lines up to `EOF`), `execute`, `silent`, `setlocal`, `unlet`, `echo`, abbreviations, `<expr>` maps, maps with `<Plug>` or `<SID>`, maps of a mode we do not have (`smap`, `cmap`, `map!`), every line inside an `if`, `function`, `augroup`, `for`, `while` or `try` block, and `set` of options such as `number`, `tabstop`, `mouse`, `foldmethod`, `shiftwidth`, `statusline`, `showmatch`, `path`, any `t_` option, any other option that Vim or Neovim has and the engine does not (`smarttab`, `synmaxcol`, `formatoptions+=j`, from `vim_option_names.ts`), and the engine's per-editor options (`textwidth`). Only a name that Vim lacks too is an unknown option. `set ignorecase smartcase incsearch hlsearch wrapscan` apply quietly, because the engine already behaves that way. The host toasts errors only and lists skipped lines apart.
- An option name must match `/^[A-Za-z]+$/` and must not be a name on `Object.prototype`, because the engine keeps options in a plain object (`set __proto__=x` would corrupt it).
- Maps that start with a key Vim binds wait for the next key (see Maps that start with a Vim key). `built_in_one_key_commands` in `map_prefix_wait.ts` pins the list of one-key commands, and VIM-016 asks the engine about every key, so an upgrade that changes it fails there. Commands that take a second key (`gg`, `f<char>`) are not listed, so a map of three or more keys that starts with one can still lose without a warning.

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
    wiki_links/  menus/  callouts/  vim/  find.ts  clipboard.ts
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

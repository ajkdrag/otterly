# Markdown editor

A plugin-driven, source-preserving Markdown editor on CodeMirror 6. Markdown stays the document: rich rendering is decoration over the text, and saving reads the original source byte for byte. Plugins add syntax, rendering, and editing behavior.

It has no Svelte, Tauri, filesystem, or application-store dependency. It is developed inside Otterly and is not published yet.

Read [DESIGN.md](DESIGN.md) for the model: constructs, context, layers, surfaces, and the reveal rules.

## Use

```ts
import { EditorView } from "@codemirror/view";
import {
  code_blocks,
  commonmark,
  create_markdown_state,
  find,
  get_markdown_source,
  gfm,
  images,
  links,
  slash_menu,
} from "@otterly/markdown-editor";

const editor = new EditorView({
  parent: document.querySelector("#editor")!,
  state: create_markdown_state(original_markdown, {
    plugins: [
      commonmark(),
      gfm(),
      code_blocks({ copy_code: (text) => navigator.clipboard.writeText(text) }),
      links({ open_link: (target) => app.open_link(target) }),
      images({
        resolve_image: (source, signal) => app.resolve_image(source, signal),
      }),
      slash_menu(),
      find(),
    ],
  }),
});

const markdown_to_save = get_markdown_source(editor.state);
```

Cache each note's whole `EditorState` to keep its own selection and history. Use `source_undo` and `source_redo` for history. Do not add another CodeMirror history extension.

Positions in the public API are UTF-16 offsets in the LF-normalized display document, not byte offsets in the saved file.

## Plugins

| Plugin             | Adds                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `commonmark()`     | Paragraphs, headings, emphasis, inline code, lists, quotes, rules, escapes, `<br>`. |
| `gfm()`            | Tables, task lists, strikethrough. Requires `commonmark`.                           |
| `code_blocks(...)` | Fenced code editing, language picker, copy, resize, diagram previews.               |
| `frontmatter()`    | YAML frontmatter as literal source.                                                 |
| `links(...)`       | Clickable links, autolinks, bare URLs, wiki links, and the link editor.             |
| `images(...)`      | Images resolved through the host, with resize.                                      |
| `wiki_links(...)`  | `[[target]]` syntax and note completion. Requires `links`.                          |
| `tags(...)`        | `#tag` chips, a click that opens the tag, and tag completion from the host.         |
| `slash_menu()`     | "/" commands built from every construct's insert items.                             |
| `find()`           | Find highlights, including inside code blocks and table cells.                      |
| `clipboard(...)`   | Markdown-first paste, HTML conversion through the host, image paste.                |
| `callouts()`       | `> [!note]` callouts. A small example of a construct plugin.                        |

## Writing a plugin

A plugin is a plain object. This one renders `==highlight==`, given a Lezer extension that produces `Highlight` and `HighlightMark` nodes:

```ts
import { delimited_mark, type MarkdownPlugin } from "@otterly/markdown-editor";

export function highlight(): MarkdownPlugin {
  return {
    name: "highlight",
    syntax: highlight_syntax,
    constructs: [
      delimited_mark({
        name: "highlight",
        nodes: ["Highlight"],
        delimiter: "HighlightMark",
        class_name: () => "md-highlight",
        tag: () => "mark",
      }),
    ],
    theme: {
      ".md-highlight": { backgroundColor: "var(--editor-mark-bg, #fff3a3)" },
    },
  };
}
```

`plugins/callouts` and `plugins/frontmatter` are short real examples. `@otterly/markdown-editor/testing` gives you `test_editor` for tests that drive a real editor with key events.

## Appearance

Colors come from host CSS variables such as `--foreground`, `--background`, `--muted`, `--border`, `--primary`, `--ring`, and the `--editor-*` tokens, with standalone fallbacks. Set `--markdown-editor-width` for the text width and `--editor-zoom` to scale text. Class names follow `md-<construct>`.

## Development

From the repository root:

```sh
pnpm --filter @otterly/markdown-editor check
pnpm --filter @otterly/markdown-editor build
pnpm exec vitest run packages/markdown_editor/tests
```

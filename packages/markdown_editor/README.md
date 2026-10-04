# Markdown editor

A framework-independent Markdown editor built on CodeMirror 6. It keeps Markdown as source and adds rich rendering over the editable text. It has no Svelte, Tauri, filesystem, or application-store dependency.

This package is developed inside Otterly and remains private in the workspace. It has not been published to a package registry. See the [migration validation](../../docs/markdown_editor_validation.md) for current coverage and limits.

## Source ownership

`create_markdown_state` owns the original source, including its BOM, whitespace, and line endings. A second CodeMirror document presents LF-normalized text to the browser and Markdown parser. Edits map back to the original source. Undo and redo operate on that original source, then update the display.

The display is a projection. Saving reads `get_markdown_source(state)`. It never serializes a Markdown syntax tree.

```text
Keyboard or rich control
        |
        v
Visible text transaction
        |
        v
Original source and history ----> get_markdown_source ----> host save
        |
        v
LF display and syntax decorations
```

Use `source_undo` and `source_redo`. Do not add another CodeMirror history extension to the visible editor. Cache each note's complete `EditorState` to preserve its own selection, history, and extension state.

Positions in the public editing API are UTF-16 offsets in the LF-normalized display document. They are not byte offsets in the saved file.

## Use

```ts
import { EditorView } from "@codemirror/view";
import {
  create_markdown_state,
  get_markdown_source,
  markdown_editor_extensions,
} from "@otterly/markdown-editor";

const root = document.querySelector<HTMLElement>("#editor");
if (!root) throw new Error("Missing editor root");

const editor = new EditorView({
  parent: root,
  state: create_markdown_state(original_markdown, [
    markdown_editor_extensions({
      open_link: (target) => app.open_link(target),
      resolve_image: (source, signal) => app.resolve_image(source, signal),
      query_wiki_links: (query, signal) => app.find_notes(query, signal),
    }),
  ]),
});

const markdown_to_save = get_markdown_source(editor.state);
editor.destroy();
```

The host owns link navigation, asset URLs, wiki lookups, clipboard image storage, and saving. Async image and completion callbacks receive an abort signal when their result is no longer needed. The optional HTML clipboard converter receives both HTML and plain text, so the host can retain Markdown copied from a source editor.

Configure code blocks through `code_blocks`. The host supplies `copy_code` for clipboard writes and can provide `code_extensions` for syntax colors or other CodeMirror extensions. `render_diagram` receives the language, source text, and an abort signal. It must return a sanitized HTML or SVG element, or `null`. Use `diagram_languages` to choose which languages show previews. The package does not load a diagram engine itself.

Code-block size, source visibility, and diagram zoom are view state. `on_view_states_change` reports those settings without changing Markdown. They also remain in the cached editor state. Dispatch the `refresh_code_diagrams` effect when a host theme change requires diagrams to render again.

Individual language, rendering, formatting, block-command, clipboard, completion, and find extensions are also exported. Use those when the application needs a different composition. `markdown_block_keymap` contains the heading, list, and code-block shortcuts. The composed editor includes it automatically. Inline-code formatting requires selected text.

## Appearance

The theme uses `--foreground`, `--background`, `--muted`, `--muted-foreground`, `--border`, `--primary`, and `--ring`, with standalone fallbacks. Set `--markdown-editor-width` to control the text width and `--editor-zoom` to scale text.

## Development

From the repository root:

```sh
pnpm --filter @otterly/markdown-editor check
pnpm --filter @otterly/markdown-editor build
pnpm exec vitest run tests/unit/adapters/cm6_*.test.ts
```

The package build emits JavaScript and declarations in `dist`. Otterly's development alias imports the source directly. Publishing has not been enabled.

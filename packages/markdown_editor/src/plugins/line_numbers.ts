import type { Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";

// Line number gutter for source mode and text files. Add it to
// `source_extensions` (Markdown) or to the text state's extensions, never to
// rich mode: a rendered code block or table is one widget, so its lines would
// not line up with the numbers.
//
// The gutter is always installed and the host shows it with a CSS variable:
// set --editor-gutter-display to "flex" on :root. Anything else hides it.
//
// Placement: the gutter sits left of the centered text column, not at the pane
// edge. The gutter takes an auto left margin and the content an auto right
// margin, so the pair is centered together. A hidden gutter has zero width, so
// the text stays centered.
export function line_numbers(): Extension {
  return [lineNumbers(), line_numbers_theme];
}

const line_numbers_theme = EditorView.theme({
  ".cm-gutters": {
    marginLeft: "auto",
    backgroundColor: "transparent",
    border: "none",
    color: "var(--editor-line-number-color, var(--muted-foreground, #737373))",
    fontVariantNumeric: "tabular-nums",
    // Same size as the content in source mode (see source_theme), or the
    // numbers do not follow zoom and drift off the line height.
    fontSize:
      "calc(var(--editor-font-size, 1rem) * 0.9 * var(--editor-zoom, 1))",
  },
  // CodeMirror sets display: flex !important on .cm-gutter to stop margin
  // collapsing, so hiding it needs !important too.
  ".cm-gutter": { display: "var(--editor-gutter-display, none) !important" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 0.75rem" },
  // CodeMirror mounts editor_theme after this theme, so an equally specific
  // selector loses to its "margin: 0 auto". The extra .cm-editor wins on
  // specificity whatever the extension order.
  "&.cm-editor > .cm-scroller > .cm-content": {
    marginLeft: "0",
    marginRight: "auto",
  },
});

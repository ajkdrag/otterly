import { EditorView } from "@codemirror/view";
import type { ThemeSpec } from "./plugin.js";

// Selects this editor's own lines, plus an optional suffix such as
// ".md-blank-line". A line sits directly in .cm-content or inside block
// wrappers (render.wrap). Lines of nested editors in widgets never match.
export function line_selector(suffix = ""): string {
  const content = "& > .cm-scroller > .cm-content";
  return `${content} > .cm-line${suffix}, ${content} .md-wrap > .cm-line${suffix}`;
}

// Base editor appearance. Construct styles live with their plugins. Colors
// come from the host's CSS variables, with standalone fallbacks.
export const editor_theme_spec: ThemeSpec = {
  "&": {
    color: "var(--editor-text, var(--foreground, #242424))",
    backgroundColor: "var(--background, #fff)",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  "& > .cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "var(--editor-line-height, 1.85)",
    overflow: "auto",
  },
  "& > .cm-scroller > .cm-content": {
    padding: "var(--editor-padding-y, 3rem) var(--editor-padding-x, 2rem)",
    boxSizing: "border-box",
    minWidth: "0",
    width: "100%",
    maxWidth:
      "var(--markdown-editor-width, var(--editor-max-width, min(85ch, 90%)))",
    margin: "0 auto",
    flexGrow: "1",
    fontSize: "calc(var(--editor-font-size, 1rem) * var(--editor-zoom, 1))",
    caretColor: "var(--caret-color, var(--foreground, #242424))",
  },
  [line_selector()]: { padding: "0" },
  // Space above a top-level block (render.gap). It lives on a wrapper so the
  // line box keeps the default height.
  "& > .cm-scroller > .cm-content > .md-gap": {
    paddingTop: "max(var(--md-gap-before, 0px), var(--md-gap-after, 0px))",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--caret-color, var(--foreground, #242424))",
  },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "var(--editor-selection-bg, #b5d7ff)" },
  // A single range uses native selection, which follows quote and list text
  // insets. Keep CodeMirror's layer for multiple ranges, and leave focused
  // nested editors alone.
  "&.md-native-selection:not(:has(.cm-content .cm-editor.cm-focused)) > .cm-scroller > .cm-selectionLayer":
    { display: "none" },
  "&.md-native-selection:not(:has(.cm-content .cm-editor.cm-focused)) > .cm-scroller > .cm-content":
    {
      "&::selection, & ::selection": {
        backgroundColor: "var(--editor-selection-bg, #b5d7ff) !important",
      },
    },
  // Native selection inside a block widget only paints static markup: nested
  // editors draw their own selection. A fully covered block draws its own
  // overlay (block_selection), and a partial native selection would paint
  // stripes over table cells. A DOM selection can also linger in static
  // cell markup after a cell editor unmounts.
  "&.md-native-selection:not(:has(.cm-content .cm-editor.cm-focused)) > .cm-scroller > .cm-content [data-md-block], & > .cm-scroller > .cm-content [data-md-block]":
    {
      "&::selection, & ::selection": {
        backgroundColor: "transparent !important",
      },
    },
  // Empty source lines are caret stops. Their line box must fit the font even
  // when block spacing would make it smaller. It is the one line box that
  // differs from the default. That is safe only because a blank row never
  // shows text (its whitespace is hidden), so CodeMirror never samples it for
  // line metrics.
  [line_selector(".md-blank-line")]: {
    // Hidden container prefixes leave no text strut. Reserve the same height.
    boxSizing: "content-box",
    lineHeight:
      "max(1.25em, var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem)))",
    minHeight:
      "max(1.25em, var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem)))",
  },
  // A revealed prefix draws at its natural width, starting where its marker
  // widget starts. A fixed gutter box would overlap the text after a long
  // prefix such as "- [ ] ".
  ".md-source-prefix": {
    whiteSpace: "pre",
    color: "var(--muted-foreground, #737373)",
  },
  [line_selector(".md-source-prefix-visible")]: {
    textIndent: "-1.5rem",
  },
  ".md-syntax": { color: "var(--muted-foreground, #737373)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover, var(--background, white))",
    color: "var(--popover-foreground, var(--foreground, #242424))",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius-md, 0.375rem)",
    boxShadow: "var(--shadow-md, 0 4px 12px #0002)",
    fontFamily: "var(--font-sans, inherit)",
    fontSize: "0.875rem",
  },
};

export const editor_theme = EditorView.theme(editor_theme_spec);

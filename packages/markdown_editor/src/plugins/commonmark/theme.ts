import { line_selector } from "../../core/editor_theme.js";
import type { ThemeSpec } from "../../core/plugin.js";

export const commonmark_theme: ThemeSpec = {
  ".md-heading": {
    fontWeight: "var(--editor-heading-weight, 500)",
    fontFamily: "var(--editor-heading-font, var(--font-family-sans, inherit))",
    color: "var(--editor-heading-color, var(--foreground, #242424))",
    lineHeight: "1.4",
  },
  ".md-heading-1": {
    fontSize: "var(--editor-heading-1, 1.75em)",
    lineHeight: "1.2",
    letterSpacing: "-0.01em",
  },
  ".md-heading-2": {
    fontSize: "var(--editor-heading-2, 1.1875em)",
    lineHeight: "1.3",
    letterSpacing: "-0.005em",
  },
  ".md-heading-3": {
    fontSize: "var(--editor-heading-3, 1.125em)",
    letterSpacing: "-0.005em",
  },
  ".md-heading-4": {
    fontSize: "var(--editor-heading-4, 1.0625em)",
    lineHeight: "1.45",
  },
  ".md-heading-5": {
    fontSize: "var(--editor-heading-5, 1em)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: "1.55",
  },
  ".md-heading-6": {
    fontSize: "var(--editor-heading-6, 0.875em)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted-foreground, #737373)",
    lineHeight: "1.6",
  },
  // Line rules here only touch line boxes that never show plain text alone:
  // headings hide their marks, list and quote lines hide their markers, and
  // blank rows hide their whitespace. Vertical space for anything else goes
  // on wrappers (render.wrap and render.gap). See "Line boxes" in DESIGN.md.
  // Headings nested in lists and quotes keep a paragraph's spacing.
  [line_selector(".md-heading:not(.md-prose-heading)")]: {
    paddingTop:
      "var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem))",
  },
  [line_selector(".md-setext-underline")]: {
    lineHeight: "0",
    fontSize: "0",
  },
  // Space above every item but the first. It sits on the item's wrapper, not
  // on a line (see "Line boxes" in DESIGN.md).
  ".md-wrap.md-list-item-spaced": {
    paddingTop: "var(--editor-list-item-spacing, 0px)",
  },
  [line_selector(".md-list-line")]: {
    paddingLeft: "calc(var(--md-list-depth, 1) * 1.5rem)",
  },
  [line_selector(".md-list-item-start")]: {
    textIndent: "-1.5rem",
  },
  // An empty item's marker line keeps text metrics instead of blank-row
  // metrics, so the first typed character does not move the baseline.
  [line_selector(".md-list-marker-line.md-blank-line")]: {
    lineHeight: "inherit",
    minHeight: "0",
  },
  [line_selector(".md-list-separator:has(> br:only-child)")]: {
    lineHeight: "1.25em",
  },
  ".md-list-source-visible .md-list-marker": {
    display: "inline",
    paddingRight: "0",
    marginRight: "0",
    textAlign: "inherit",
  },
  ".md-list-marker": {
    display: "inline-flex",
    justifyContent: "flex-end",
    alignItems: "baseline",
    width: "1.5rem",
    boxSizing: "border-box",
    paddingRight: "0.4em",
    textAlign: "right",
    whiteSpace: "pre",
    textIndent: "0",
    color: "var(--muted-foreground, #737373)",
  },
  // A quote is one wrapper around its lines and widgets. A nested quote is a
  // wrapper inside it, so each level draws its own bar, and only the
  // outermost paints the background.
  ".md-wrap.md-quote": {
    marginLeft: "calc(var(--editor-spacing, 1.5rem) * 0.5)",
    padding:
      "calc(var(--editor-spacing, 1.5rem) * 0.75) var(--editor-spacing, 1.5rem)",
    borderLeft:
      "2px solid var(--editor-blockquote-border, var(--border, #ddd))",
    borderRadius: "0 var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0",
    backgroundColor: "var(--editor-blockquote-bg, transparent)",
    color: "var(--editor-blockquote-text, var(--muted-foreground, #737373))",
    fontStyle: "italic",
  },
  ".md-wrap.md-quote .md-wrap.md-quote": {
    marginLeft: "0",
    paddingRight: "0",
    backgroundColor: "transparent",
  },
  // An empty quoted line keeps text metrics, so the first typed character
  // does not grow the quote. It has to outrank the core blank-row rule.
  "& > .cm-scroller > .cm-content .md-wrap.md-quote .cm-line.md-blank-line": {
    lineHeight: "inherit",
    minHeight: "0",
  },
  ".md-strong": {
    fontWeight: "var(--editor-bold-weight, 600)",
    color: "var(--editor-bold-color, var(--foreground, inherit))",
  },
  ".md-emphasis": {
    fontStyle: "italic",
    color: "var(--editor-italic-color, inherit)",
  },
  ".md-strike": { textDecoration: "line-through" },
  ".md-horizontal-rule": {
    display: "inline-block",
    width: "100%",
    height: "1px",
    verticalAlign: "middle",
    backgroundColor: "var(--border-strong, var(--border, #ddd))",
  },
  ".md-inline-code": {
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "var(--editor-code-inline-bg, var(--muted, #f2f2f2))",
    color: "var(--editor-code-inline-text, var(--foreground, inherit))",
    fontSize: "0.85em",
    border: "1px solid var(--editor-code-inline-border, var(--border, #ddd))",
    borderRadius: "0.2rem",
    padding: "2px 6px",
    lineHeight: "1.4",
  },
  ".md-code-line": {
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "var(--muted, #f2f2f2)",
  },
};

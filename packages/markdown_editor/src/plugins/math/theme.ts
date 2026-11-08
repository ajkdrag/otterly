import type { ThemeSpec } from "../../core/plugin.js";

export const math_theme: ThemeSpec = {
  ".md-math-source": { fontFamily: "var(--font-mono, monospace)" },
  // The TeX source shows until the engine loads, and stays with an error
  // style when it fails.
  ".md-math-pending, .md-math-error": {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--muted-foreground, #737373)",
  },
  ".md-math-error": { color: "var(--destructive, #dc2626)" },
  ".md-math .katex": { fontSize: "1em" },
  // A $$x$$ formula inside a paragraph is display style but stays in the line,
  // so the text around it does not break.
  ".md-math > div, .md-math .katex-display": {
    display: "inline-block",
    margin: "0",
  },
  // The padding is the block's vertical margin, as for tables and code.
  ".md-math-block .md-block-body": {
    padding: "var(--editor-block-margin-y, 0.5rem) 0",
  },
  ".md-math-block .md-block-layer-marker": {
    top: "var(--editor-block-margin-y, 0.5rem)",
  },
  ".md-math-content": {
    overflowX: "auto",
    overflowY: "hidden",
    textAlign: "center",
  },
  ".md-math-content .katex-display": { margin: "0" },
};

import type { ThemeSpec } from "../../core/plugin.js";

export const code_block_theme: ThemeSpec = {
  ".md-code-language-button": {
    maxWidth: "16rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-code-language-popup": {
    position: "fixed",
    zIndex: "100",
    display: "flex",
    flexDirection: "column",
    padding: "0.25rem",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius, 0.5rem)",
    background: "var(--popover, white)",
    color: "var(--popover-foreground, #222)",
    boxShadow: "0 4px 16px rgb(0 0 0 / 15%)",
    fontFamily: "var(--font-sans, sans-serif)",
    fontSize: "0.8125rem",
    lineHeight: "1.5",
  },
  ".md-code-language-popup input": {
    width: "100%",
    boxSizing: "border-box",
    flexShrink: "0",
    padding: "0.5rem",
    border: "0",
    borderBottom: "1px solid var(--border, #ddd)",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    outline: "none",
  },
  ".md-code-language-list": {
    minHeight: "0",
    overflowY: "auto",
    padding: "0.25rem 0",
  },
  ".md-code-language-option": {
    display: "flex",
    flexDirection: "column",
    padding: "0.35rem 0.5rem",
    borderRadius: "0.25rem",
    cursor: "pointer",
  },
  ".md-code-language-option span": {
    color: "var(--muted-foreground, #666)",
    fontSize: "0.6875rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-code-language-option[data-active=true], .md-code-language-option:hover":
    {
      background: "var(--accent, #eee)",
      color: "var(--accent-foreground, #222)",
    },
  ".md-code-language-option[aria-selected=true]": { fontWeight: "600" },
  ".md-code-language-empty": {
    padding: "0.75rem",
    color: "var(--muted-foreground, #666)",
  },
  // The card keeps a small margin so it never touches a neighbour, even with
  // no blank row. CodeMirror measures the widget's border box, so the margin
  // is transparent padding on the body around the card, not a CSS margin.
  ".md-code-block .md-block-body": {
    padding: "var(--editor-block-margin-y, 0.5rem) 0",
  },
  // A list marker sits at the top of its layer. Line it up with the card.
  ".md-code-block .md-block-layer-marker": {
    top: "var(--editor-block-margin-y, 0.5rem)",
  },
  ".md-code-panel": {
    border: "1px solid var(--editor-code-border, var(--border, #ddd))",
    borderRadius: "var(--editor-code-radius, 0.5rem)",
    background: "var(--editor-code-bg, var(--muted, #f4f4f4))",
    color: "var(--editor-code-block-text, var(--foreground, #222))",
    overflow: "hidden",
  },
  ".md-code-toolbar": {
    display: "flex",
    userSelect: "none",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.35rem 0.5rem",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    borderBottom: "1px solid var(--editor-code-border, var(--border, #ddd))",
    color: "var(--muted-foreground, #666)",
  },
  ".md-code-toolbar[hidden], .md-code-resize[hidden]": { display: "none" },
  ".md-code-toolbar button": {
    font: "inherit",
    height: "1.75rem",
    background: "transparent",
    color: "inherit",
    border: "1px solid transparent",
    borderRadius: "0.25rem",
    padding: "0.125rem 0.375rem",
    cursor: "pointer",
  },
  ".md-code-toolbar button:hover:enabled": {
    background: "var(--accent, #e8e8e8)",
    color: "var(--accent-foreground, #222)",
  },
  ".md-code-toolbar button:focus-visible": {
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "1px",
  },
  ".md-code-toolbar button:disabled": {
    opacity: "0.5",
    cursor: "default",
  },
  ".md-code-toolbar [role=status]": {
    marginLeft: "auto",
    fontSize: "0.6875rem",
  },
  ".md-code-copy, .md-code-remove": { marginLeft: "auto" },
  ".md-code-toolbar [role=status]:empty": { display: "none" },
  ".md-code-copy + .md-code-remove, .md-code-toolbar [role=status]:not(:empty) + .md-code-copy, .md-code-toolbar [role=status]:not(:empty) + .md-code-remove":
    { marginLeft: "0" },
  ".md-code-remove:hover:enabled": {
    color: "var(--destructive, #b91c1c)",
  },
  ".md-code-diagram-controls": {
    justifyContent: "flex-end",
    borderTop: "1px solid var(--editor-code-border, var(--border, #ddd))",
    borderBottom: "0",
  },
  ".md-code-zoom-reset": {
    minWidth: "3.5rem",
    fontVariantNumeric: "tabular-nums",
  },
  ".md-code-source": {
    maxHeight: "4096px",
    overflow: "hidden",
  },
  ".md-code-diagram": {
    overflow: "auto",
    minHeight: "48px",
    maxHeight: "4096px",
    padding: "var(--editor-block-padding-y, 0.75rem)",
    paddingBottom: "0",
  },
  ".md-code-diagram-content": {
    width: "100%",
    transformOrigin: "top left",
  },
  ".md-code-resize": {
    display: "flex",
    userSelect: "none",
    alignItems: "center",
    justifyContent: "center",
    // The handle row is the bottom inset of the box above it, so the card
    // stays even above and below the code. The boxes have no bottom inset of
    // their own: an overlay there would cover the scrollbar and, once the box
    // scrolls, the last visible line. The 0.5rem floor keeps the handle
    // grabbable when a host sets a thinner inset. The card is uneven then.
    height: "max(var(--editor-block-padding-y, 0.75rem), 0.5rem)",
    cursor: "ns-resize",
    touchAction: "none",
  },
  ".md-code-resize::before": {
    content: "''",
    width: "3rem",
    height: "0.1875rem",
    borderRadius: "999px",
    background: "var(--border, #ddd)",
  },
  ".md-code-resize:hover::before, .md-code-resize:focus-visible::before": {
    background: "var(--muted-foreground, #666)",
  },
  ".md-code-resize:focus-visible": { outline: "2px solid var(--ring, #777)" },
  ".md-code-error": {
    color: "var(--destructive, #b91c1c)",
    padding: "0.75rem",
  },
};

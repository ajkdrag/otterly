import type { ThemeSpec } from "../../core/plugin.js";

export const menu_theme: ThemeSpec = {
  ".cm-tooltip-autocomplete.md-slash-menu, .cm-tooltip-autocomplete.md-wiki-menu":
    {
      borderRadius: "calc(var(--radius, 0.5rem) * 0.5)",
    },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans, sans-serif)",
    padding: "var(--space-1, 0.25rem) 0",
    maxWidth: "min(340px, 90vw)",
  },
  ".cm-tooltip-autocomplete.md-slash-menu > ul": {
    // The popup supplies the two border pixels outside this scrolling list.
    boxSizing: "border-box",
    minWidth: "238px",
    maxWidth: "min(338px, calc(90vw - 2px))",
    maxHeight: "318px",
  },
  ".cm-tooltip-autocomplete.md-wiki-menu > ul": {
    minWidth: "200px",
    maxWidth: "min(320px, 90vw)",
    maxHeight: "240px",
  },
  // Match the base completion theme's specificity so its compact row padding
  // does not override the application's menu spacing.
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "var(--space-1-5, 0.375rem) var(--space-2, 0.5rem)",
    cursor: "pointer",
    whiteSpace: "normal",
    transition:
      "background-color var(--duration-fast, 100ms) var(--ease-default, ease)",
  },
  ".cm-tooltip-autocomplete > ul > li:hover": {
    backgroundColor: "var(--muted, #f2f2f2)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--interactive-bg, var(--accent, #eee))",
    color: "var(--interactive, var(--accent-foreground, #242424))",
  },
  ".cm-tooltip-autocomplete > ul > li.md-slash-option": {
    display: "grid",
    gridTemplateColumns: "1.75rem minmax(0, 1fr)",
    columnGap: "var(--space-2-5, 0.625rem)",
    rowGap: "0.1rem",
    alignItems: "center",
  },
  ".md-slash-icon": {
    gridColumn: "1",
    gridRow: "1 / 3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.75rem",
    height: "1.75rem",
    boxSizing: "border-box",
    borderRadius: "calc(var(--radius, 0.5rem) * 0.35)",
    backgroundColor: "var(--background-surface-2, var(--muted, #f2f2f2))",
    border: "1px solid var(--border, #ddd)",
    color: "var(--muted-foreground, #737373)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "var(--text-xs, 0.75rem)",
    fontWeight: "600",
    letterSpacing: "-0.02em",
    lineHeight: "1",
  },
  ".md-slash-option .cm-completionLabel": {
    gridColumn: "2",
    gridRow: "1",
    fontSize: "var(--text-sm, 0.875rem)",
    fontWeight: "500",
    color: "var(--foreground, #242424)",
    lineHeight: "1.3",
  },
  ".md-slash-option .cm-completionDetail": {
    gridColumn: "2",
    gridRow: "2",
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "1.3",
    marginLeft: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-slash-option[aria-selected] .md-slash-icon": {
    backgroundColor: "var(--interactive, var(--primary, #242424))",
    borderColor: "var(--interactive, var(--primary, #242424))",
    color: "var(--interactive-foreground, var(--primary-foreground, white))",
  },
  ".md-slash-option[aria-selected] .cm-completionLabel": {
    color: "var(--interactive, var(--foreground, #242424))",
  },
  ".md-slash-option[aria-selected] .cm-completionDetail": {
    color:
      "color-mix(in oklch, var(--interactive, var(--foreground, #242424)) 70%, var(--muted-foreground, #737373))",
  },
  ".cm-completionDetail": {
    color: "var(--muted-foreground, #737373)",
    fontStyle: "normal",
  },
  ".cm-tooltip-autocomplete > ul > li.md-wiki-option": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-2, 0.5rem)",
    fontSize: "var(--text-sm, 0.875rem)",
  },
  ".md-wiki-option .cm-completionLabel, .md-wiki-option .cm-completionDetail": {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".md-wiki-option .cm-completionDetail": {
    fontSize: "var(--text-xs, 0.75rem)",
    marginLeft: "0",
  },
  ".md-wiki-planned .cm-completionLabel": {
    color: "var(--muted-foreground, #737373)",
  },
  ".md-wiki-planned .cm-completionDetail": {
    flexShrink: "0",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius-sm, 0.25rem)",
    padding: "0 var(--space-1, 0.25rem)",
  },
  ".md-wiki-planned[aria-selected] .cm-completionDetail": {
    color: "inherit",
    borderColor: "currentColor",
  },
};

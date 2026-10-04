import type { ThemeSpec } from "../../core/plugin.js";

export const gfm_theme: ThemeSpec = {
  ".md-table-widget": {
    "--md-table-cell-padding-y":
      "calc(var(--editor-spacing, 1.5rem) * var(--editor-table-cell-padding, 0.65))",
    "--md-table-cell-padding-x":
      "calc(var(--editor-spacing, 1.5rem) * var(--editor-table-cell-padding, 0.65) * 1.3)",
  },
  // The toolbar band is always part of the measured box, so activating a
  // cell does not move the prose below the table. It sits inside any quote
  // layers around the table.
  ".md-table-widget .md-block-body": { padding: "0.5em 0 2.5rem" },
  ".md-table-frame": { position: "relative" },
  ".md-table-host": { overflowX: "auto" },
  ".md-table-widget table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
    lineHeight: "1.5",
    // Keep words intact when the browser allocates column widths. CodeMirror's
    // character wrapping would shrink short columns to one character.
    wordBreak: "normal",
    overflowWrap: "break-word",
  },
  ".md-table-viewport": { overflow: "auto" },
  ".md-table-virtual thead th": { position: "sticky", top: "0", zIndex: "1" },
  // WebKit paints a sticky header wrong with collapsed borders: rows show
  // through above it. Virtual tables use separate borders with no spacing,
  // drawn on the right and bottom of each cell.
  ".md-table-widget table.md-table-virtual": {
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: "0",
    borderTop: "1px solid var(--editor-table-border, var(--border, #d4d4d4))",
    borderLeft: "1px solid var(--editor-table-border, var(--border, #d4d4d4))",
  },
  ".md-table-widget table.md-table-virtual th, .md-table-widget table.md-table-virtual td":
    {
      border: "0",
      borderRight:
        "1px solid var(--editor-table-border, var(--border, #d4d4d4))",
      borderBottom:
        "1px solid var(--editor-table-border, var(--border, #d4d4d4))",
    },
  ".md-table-widget th, .md-table-widget td": {
    verticalAlign: "top",
    border: "1px solid var(--editor-table-border, var(--border, #d4d4d4))",
    padding: "var(--md-table-cell-padding-y) var(--md-table-cell-padding-x)",
  },
  ".md-table-widget td": { height: "2.55em" },
  // An empty cell still holds one line, so an empty row is as tall as a row
  // with text.
  ".md-table-widget th:empty::before, .md-table-widget td:empty::before": {
    content: '"\\200b"',
  },
  ".md-table-widget td.md-table-spacer": { padding: "0", border: "0" },
  ".md-table-widget th": {
    backgroundColor: "var(--editor-table-header-bg, var(--muted, #f2f2f2))",
    fontWeight: "500",
    fontSize: "0.875em",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontFeatureSettings: '"tnum" 1',
    color: "var(--editor-text, var(--foreground, inherit))",
  },
  ".md-table-widget tr:nth-child(odd) td": {
    backgroundColor: "var(--editor-table-stripe, transparent)",
  },
  ".md-table-widget .md-table-cell-active": {
    // Focus only adds the outline. The cell keeps its own typography and
    // background, so activating it does not change how it looks.
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "-2px",
  },
  ".md-table-widget code": {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.85em",
    display: "inline-block",
    lineHeight: "1.4",
    padding: "2px 6px",
    border: "1px solid var(--editor-code-inline-border, var(--border, #ddd))",
    borderRadius: "0.2rem",
    backgroundColor: "var(--editor-code-inline-bg, var(--muted, #f2f2f2))",
    color: "var(--editor-code-inline-text, var(--foreground, inherit))",
  },
  ".md-table-actions": {
    position: "absolute",
    right: "0",
    top: "calc(100% + 0.35rem)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "0.35rem",
    boxSizing: "border-box",
    width: "100%",
    fontFamily: "var(--font-sans, inherit)",
    fontSize: "0.75rem",
    lineHeight: "1.25",
  },
  ".md-table-action": {
    appearance: "none",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius-sm, 0.25rem)",
    padding: "0.3rem 0.55rem",
    minHeight: "1.9rem",
    boxSizing: "border-box",
    backgroundColor: "var(--popover, var(--background, #fff))",
    color: "var(--popover-foreground, var(--foreground, #242424))",
    boxShadow: "var(--shadow-sm, 0 1px 2px #0002)",
    font: "inherit",
    lineHeight: "1.25",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease",
  },
  ".md-table-action:hover:not(:disabled)": {
    backgroundColor: "var(--accent, var(--muted, #f2f2f2))",
    borderColor: "var(--border-strong, var(--border, #bbb))",
  },
  ".md-table-action:focus-visible": {
    outline: "2px solid var(--ring, var(--primary, #2563eb))",
    outlineOffset: "2px",
  },
  ".md-table-action:disabled": {
    opacity: "0.5",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  ".md-task-checkbox": {
    cursor: "pointer",
    appearance: "none",
    display: "inline-grid",
    placeItems: "center",
    width: "var(--editor-checkbox-size, 0.85em)",
    height: "var(--editor-checkbox-size, 0.85em)",
    border: "1.5px solid var(--border-strong, var(--border, #888))",
    borderRadius: "2px",
    backgroundColor: "transparent",
    margin: "0 0.4em 0 0",
    verticalAlign: "middle",
  },
  ".md-task-checkbox:checked": {
    backgroundColor: "var(--primary, #2563eb)",
    borderColor: "var(--primary, #2563eb)",
  },
  ".md-task-checkbox:checked::after": {
    content: '""',
    width: "70%",
    height: "70%",
    backgroundColor: "var(--primary-foreground, white)",
    clipPath: "polygon(0 45%, 15% 30%, 40% 60%, 85% 5%, 100% 20%, 40% 95%)",
  },
  ".md-task-checkbox:hover:not(:disabled)": {
    borderColor: "var(--primary, #2563eb)",
  },
  ".md-task-checkbox:focus-visible": {
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "2px",
  },
  ".md-task-completed": {
    color: "var(--editor-text-muted, var(--muted-foreground, #737373))",
    textDecoration: "line-through",
    textDecorationColor:
      "color-mix(in srgb, var(--muted-foreground, #737373) 50%, transparent)",
  },
};

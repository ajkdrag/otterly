import { EditorView } from "@codemirror/view";

export const markdown_editor_theme = EditorView.theme({
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
  "& > .cm-scroller > .cm-content > .cm-line": {
    padding: "0",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--caret-color, var(--foreground, #242424))",
  },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    {
      backgroundColor: "var(--editor-selection-bg, #b5d7ff)",
    },
  // Native selection follows quote/list text insets. Keep CM's cursor layer
  // and multiple-range painting, and leave focused nested code editors alone.
  "&.md-native-selection:not(:has(.cm-content .cm-editor.cm-focused)) > .cm-scroller > .cm-selectionLayer":
    { display: "none" },
  "&.md-native-selection:not(:has(.cm-content .cm-editor.cm-focused)) > .cm-scroller > .cm-content":
    {
      "&::selection, & ::selection": {
        backgroundColor: "var(--editor-selection-bg, #b5d7ff) !important",
      },
    },
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
  // Empty source lines remain caret stops. Their line box must fit the font
  // even when the prose margin or list gap would otherwise be smaller.
  "& > .cm-scroller > .cm-content > .cm-line.md-blank-line": {
    // Hidden container prefixes have no text strut. Reserve the same content
    // height while exposing syntax, in addition to quote/block padding.
    boxSizing: "content-box",
    lineHeight:
      "max(1.25em, var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem)))",
    minHeight:
      "max(1.25em, var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem)))",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-prose-block-start": {
    paddingTop: "var(--md-prose-gap)",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-heading:not(.md-prose-heading)":
    {
      paddingTop:
        "var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem))",
    },
  "& > .cm-scroller > .cm-content > .cm-line.md-setext-underline": {
    "--md-prose-gap": "0px",
    lineHeight: "0",
    fontSize: "0",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-list-line": {
    paddingLeft: "calc(var(--md-list-depth, 1) * 1.5rem)",
    lineHeight: "1.75",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-list-item-start": {
    paddingBottom: "0.5rem",
    textIndent: "-1.5rem",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-list-separator:has(> br:only-child)":
    {
      lineHeight: "1.25em",
      paddingTop: "0",
      paddingBottom: "0",
    },
  "& > .cm-scroller > .cm-content > .cm-line.md-list-item-end:has(+ .md-list-separator)":
    {
      paddingBottom: "0",
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
  },
  ".md-source-prefix": {
    display: "inline-block",
    width: "1.5rem",
    boxSizing: "border-box",
    paddingRight: "0",
    textAlign: "right",
    whiteSpace: "pre",
    textIndent: "0",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-source-prefix-visible": {
    textIndent: "-1.5rem",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-quote-line": {
    marginLeft:
      "calc(var(--editor-spacing, 1.5rem) * 0.5 + (var(--md-quote-depth, 1) - 1) * 1.5rem)",
    paddingLeft: "var(--editor-spacing, 1.5rem)",
    paddingRight: "var(--editor-spacing, 1.5rem)",
    borderLeft:
      "2px solid var(--editor-blockquote-border, var(--border, #ddd))",
    backgroundColor: "var(--editor-blockquote-bg, transparent)",
    color: "var(--editor-blockquote-text, var(--muted-foreground, #737373))",
    fontStyle: "italic",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-quote-line.md-list-line": {
    paddingLeft:
      "calc(var(--editor-spacing, 1.5rem) + var(--md-list-depth, 1) * 1.5rem)",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-quote-start": {
    paddingTop: "calc(var(--editor-spacing, 1.5rem) * 0.75)",
    borderTopRightRadius: "var(--radius-sm, 0.25rem)",
  },
  "& > .cm-scroller > .cm-content > .cm-line.md-quote-end": {
    paddingBottom: "calc(var(--editor-spacing, 1.5rem) * 0.75)",
    borderBottomRightRadius: "var(--radius-sm, 0.25rem)",
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
  ".md-syntax, .md-list-marker": { color: "var(--muted-foreground, #737373)" },
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
  ".md-code-line, .md-frontmatter": {
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "var(--muted, #f2f2f2)",
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
  ".md-task-completed": {
    color: "var(--editor-text-muted, var(--muted-foreground, #737373))",
    textDecoration: "line-through",
    textDecorationColor:
      "color-mix(in srgb, var(--muted-foreground, #737373) 50%, transparent)",
  },
  ".find-match": { backgroundColor: "var(--editor-find-match-bg, #ffe06666)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover, var(--background, white))",
    color: "var(--popover-foreground, var(--foreground, #242424))",
    border: "1px solid var(--border, #ddd)",
    borderRadius: "var(--radius-md, 0.375rem)",
    boxShadow: "var(--shadow-md, 0 4px 12px #0002)",
    fontFamily: "var(--font-sans, inherit)",
    fontSize: "0.875rem",
  },
  ".cm-link-tooltip": {
    padding: "0",
    maxWidth: "min(36rem, calc(100vw - 2rem))",
    lineHeight: "1.4",
  },
  ".cm-link-tooltip__preview": {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minHeight: "2.25rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "var(--popover, var(--background, white))",
  },
  ".cm-link-tooltip__target": {
    display: "block",
    maxWidth: "280px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "var(--text-sm, 0.8125rem)",
    color: "var(--editor-link, var(--primary, #2563eb))",
    pointerEvents: "none",
    cursor: "default",
    marginRight: "auto",
  },
  ".cm-link-tooltip__status": {
    display: "block",
    color: "var(--muted-foreground, #737373)",
    fontSize: "0.75rem",
    padding: "0 0.75rem 0.5rem",
  },
  ".cm-link-tooltip__status:empty": { display: "none" },
  ".cm-link-tooltip--edit": {
    display: "flex",
    flexDirection: "column",
    gap: "0",
    padding: "0.5rem 0.75rem",
    minWidth: "20rem",
  },
  ".cm-link-tooltip__edit-row": {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minHeight: "1.75rem",
  },
  ".cm-link-tooltip__field": {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flex: "1",
    minWidth: "0",
    color: "var(--muted-foreground, #737373)",
  },
  ".cm-link-tooltip__field-name": {
    flexShrink: "0",
    width: "2.25rem",
    textAlign: "right",
    fontSize: "var(--text-xs, 0.75rem)",
    userSelect: "none",
  },
  ".cm-link-tooltip__field input": {
    flex: "1",
    width: "100%",
    minWidth: "0",
    boxSizing: "border-box",
    padding: "0",
    border: "0",
    outline: "none",
    backgroundColor: "transparent",
    color: "var(--foreground, #242424)",
    fontSize: "var(--text-sm, 0.8125rem)",
    fontFamily: "inherit",
  },
  ".cm-link-tooltip__field input::placeholder": {
    color: "var(--muted-foreground, #737373)",
  },
  ".cm-link-tooltip__separator": {
    height: "1px",
    backgroundColor: "var(--border, #ddd)",
    margin: "0.25rem 0",
    marginLeft: "2.75rem",
  },
  ".cm-link-tooltip__action": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    padding: "0.25rem",
    border: "0",
    borderRadius: "calc(var(--radius, 0.5rem) * 0.35)",
    backgroundColor: "transparent",
    color: "var(--muted-foreground, #737373)",
    cursor: "pointer",
    transition: "all var(--duration-normal, 150ms) var(--ease-default, ease)",
  },
  ".cm-link-tooltip__action svg": { display: "block", flexShrink: "0" },
  ".cm-link-tooltip__action:hover": {
    backgroundColor: "var(--accent, #eee)",
    color: "var(--accent-foreground, #242424)",
  },
  ".cm-link-tooltip__action--save, .cm-link-tooltip__action--cancel": {
    width: "auto",
    padding: "0.25rem 0.5rem",
    fontSize: "var(--text-sm, 0.8125rem)",
  },
  ".cm-link-tooltip__action:focus-visible, .cm-link-tooltip input:focus-visible":
    {
      outline: "2px solid var(--ring, #777)",
      outlineOffset: "2px",
    },
  ".cm-link-tooltip__action-label": {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  },
  ".cm-link-tooltip__field input:disabled": { opacity: "0.6" },
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
  ".md-table-widget": {
    // Keep the toolbar band in the measured widget box so focusing a cell
    // does not move the prose below the table.
    position: "relative",
    padding: "0.5em 0 2.5rem",
    overflowX: "auto",
  },
  ".md-table-widget table": {
    fontSize: "0.95em",
    lineHeight: "1.5",
    // CM's character wrapping makes the intrinsic width of a short column
    // one character. Keep words intact when allocating table columns.
    wordBreak: "normal",
    overflowWrap: "break-word",
  },
  ".md-table-widget th, .md-table-widget td": {
    verticalAlign: "top",
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
    bottom: "0.35rem",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "0.35rem",
    boxSizing: "border-box",
    width: "100%",
    minHeight: "1.9rem",
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
    position: "relative",
    zIndex: "1",
  },
  ".md-table-action:disabled": {
    opacity: "0.5",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  ".md-table-widget th": {
    backgroundColor: "var(--editor-table-header-bg, var(--muted, #f2f2f2))",
    fontWeight: "500",
    fontSize: "0.875em",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontFeatureSettings: '"tnum" 1',
    color: "var(--editor-text, var(--foreground, inherit))",
  },
  ".md-table-widget td": { height: "2.55em" },
  ".md-table-widget tr:nth-child(odd) td": {
    backgroundColor: "var(--editor-table-stripe, transparent)",
  },
  ".md-table-widget [contenteditable]:not([contenteditable=false]):focus": {
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "-2px",
    backgroundColor: "var(--background, white)",
  },
  ".md-task-checkbox:focus-visible, .md-link-rendered:focus-visible": {
    outline: "2px solid var(--ring, #777)",
    outlineOffset: "2px",
  },
  ".md-link-rendered:hover": {
    textDecorationColor: "var(--editor-link-underline-hover, currentColor)",
  },
  ".md-image": {
    display: "inline-block",
    maxWidth: "100%",
    verticalAlign: "middle",
    color: "var(--muted-foreground, #737373)",
  },
  ".md-image img": {
    maxWidth: "100%",
    maxHeight: "32rem",
    objectFit: "contain",
    borderRadius: "0.375rem",
  },
  ".find-match--selected": {
    backgroundColor: "var(--editor-find-match-selected-bg, #ffad4266)",
    outline: "1px solid var(--ring, #c78323)",
  },
});

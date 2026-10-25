import type { ThemeSpec } from "../../core/plugin.js";

// The host sets the --editor-tag-* tokens. The fallbacks are for using the
// package on its own.
const tag_text = "var(--editor-tag-text, var(--primary, #2563eb))";

export const tags_theme: ThemeSpec = {
  ".md-tag": {
    color: tag_text,
    backgroundColor:
      "var(--editor-tag-bg, color-mix(in srgb, currentColor 12%, transparent))",
    // A border that takes no layout width, so a chip never changes the line
    // box or the text position.
    boxShadow: "inset 0 0 0 1px var(--editor-tag-border, transparent)",
    borderRadius: "var(--editor-tag-radius, 0.375rem)",
    // Horizontal padding only: vertical padding would grow the line box.
    padding: "0 var(--editor-tag-padding-x, 0.25em)",
    // A long tag wraps like a word. Each piece gets its own padding and
    // corners.
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  },
  ".md-tag-hash": {
    opacity: "var(--editor-tag-hash-opacity, 0.6)",
  },
  ".md-tag-clickable": {
    cursor: "pointer",
    transition:
      "background-color var(--duration-fast, 100ms) var(--ease-default, ease)",
  },
  ".md-tag-clickable:hover": {
    color: `var(--editor-tag-text-hover, ${tag_text})`,
    backgroundColor:
      "var(--editor-tag-bg-hover, color-mix(in srgb, currentColor 20%, transparent))",
  },
  "&.md-source-mode .md-tag-source": {
    color: tag_text,
  },
};

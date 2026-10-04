import { WidgetType } from "@codemirror/view";
import { line_container } from "../../core/context.js";
import type { MarkdownPlugin } from "../../core/plugin.js";

// Colored callouts in the Obsidian and GitHub style:
//
//   > [!warning] Check the backup first
//   > The restore overwrites newer files.
//
// A callout is a quote whose first line starts with [!type]. Quotes already
// own Enter, Backspace, and lifting, so this plugin only adds styling and a
// label for the marker.
export function callouts(): MarkdownPlugin {
  return {
    name: "callouts",
    requires: ["commonmark"],
    constructs: [
      {
        kind: "line",
        name: "callout",
        nodes: ["Blockquote"],
        decorate(node, render) {
          const { state } = render;
          const first = state.doc.lineAt(node.from);
          const content_from = line_container(state, first).content_from;
          const marker = /^\[!([A-Za-z]+)\][+-]?/.exec(
            state.sliceDoc(content_from, first.to),
          );
          if (!marker?.[1]) return;
          const type = marker[1].toLowerCase();
          // Same node as the quote, so these classes land on the quote's own
          // wrapper element.
          render.wrap(
            node.node,
            `md-callout md-callout-${callout_color(type)}`,
          );
          render.line(first.from, "md-callout-title");
          const marker_to = content_from + marker[0].length;
          if (render.touches(content_from, marker_to)) {
            render.mark(content_from, marker_to, "md-syntax");
            return;
          }
          // Show the type as a label, and drop the space after the marker.
          const space =
            /^[ \t]*/.exec(state.sliceDoc(marker_to, first.to))?.[0] ?? "";
          const title_given = marker_to + space.length < first.to;
          render.replace(
            content_from,
            marker_to + space.length,
            new CalloutLabel(type, title_given),
          );
        },
        insert: [
          {
            id: "callout",
            label: "Callout",
            detail: "Highlighted note, tip, or warning",
            icon: "!",
            aliases: ["callout", "note", "tip", "warning", "admonition"],
            lines: ["> [!note] "],
          },
        ],
      },
    ],
    theme: {
      ".md-callout-note, .md-callout-info": {
        "--md-callout-color": "var(--editor-callout-note, #2563eb)",
      },
      ".md-callout-tip": {
        "--md-callout-color": "var(--editor-callout-tip, #16a34a)",
      },
      ".md-callout-warning": {
        "--md-callout-color": "var(--editor-callout-warning, #d97706)",
      },
      ".md-callout-danger": {
        "--md-callout-color": "var(--editor-callout-danger, #dc2626)",
      },
      ".md-callout-quote": {
        "--md-callout-color": "var(--muted-foreground, #737373)",
      },
      ".md-wrap.md-quote.md-callout": {
        borderLeftColor: "var(--md-callout-color)",
        backgroundColor:
          "color-mix(in srgb, var(--md-callout-color) 8%, transparent)",
        color: "var(--editor-text, var(--foreground, inherit))",
        fontStyle: "normal",
      },
      ".md-callout-title": { fontWeight: "600" },
      ".md-callout-label": {
        color: "var(--md-callout-color)",
        fontWeight: "600",
        textTransform: "capitalize",
      },
    },
  };
}

// Types map onto a few colors, the way GitHub and Obsidian group them.
function callout_color(type: string): string {
  if (["tip", "hint", "success", "check", "done"].includes(type)) return "tip";
  if (["warning", "caution", "attention", "important"].includes(type))
    return "warning";
  if (["danger", "error", "bug", "failure", "fail"].includes(type))
    return "danger";
  if (["quote", "cite"].includes(type)) return "quote";
  return type === "info" ? "info" : "note";
}

class CalloutLabel extends WidgetType {
  constructor(
    readonly type: string,
    readonly title_given: boolean,
  ) {
    super();
  }
  eq(other: CalloutLabel) {
    return this.type === other.type && this.title_given === other.title_given;
  }
  toDOM() {
    const label = document.createElement("span");
    label.className = "md-callout-label";
    // With a title, the type reads as a prefix. Without one, it is the title.
    label.textContent = this.title_given ? `${this.type}: ` : this.type;
    return label;
  }
}

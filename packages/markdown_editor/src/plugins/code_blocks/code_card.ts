import { HighlightStyle, LanguageDescription } from "@codemirror/language";
import type { Line } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import { block_at, is_block_rendered } from "../../core/block_field.js";
import { line_container } from "../../core/context.js";
import type { Render } from "../../core/inline_rendering.js";
import type { LineConstruct } from "../../core/plugin.js";
import {
  code_window,
  read_code_block,
  type CodeBlockSource,
} from "./fence_source.js";
import { find_code_language } from "./language_picker.js";

// A fenced code block that shows its source (Vim's caret in it, or a fence
// being typed) keeps the card look of its widget. The lines get the same
// frame, background and monospace text, and the body is highlighted by its
// language. Fence text shows only on the line the caret is on.
export function code_card(
  languages: readonly LanguageDescription[],
  highlighter: HighlightStyle | null,
): LineConstruct {
  return {
    kind: "line",
    name: "code_card",
    nodes: ["FencedCode"],
    literal: true,
    decorate(node, render) {
      const { state } = render;
      const block = block_at(state, node.from);
      if (block?.node_from === node.from && is_block_rendered(state, block))
        return;
      const first = state.doc.lineAt(node.from);
      const last = state.doc.lineAt(node.to);
      const source = read_code_block(state, first.from, last.to);
      if (!source) return;
      const list_depth = line_container(state, first).layers.filter(
        (layer) => layer.construct.name === "list_item",
      ).length;
      render.wrap(node.node, "md-code-card", {
        "--md-code-card-indent": String(list_depth),
      });
      render.lines(first.from, last.to, "md-code-card-line");
      render.line(first.from, "md-code-fence-line");
      fence(render, first, source.opening_from, source.language);
      if (source.closing_from !== null) {
        render.line(last.from, "md-code-fence-line");
        fence(render, last, source.closing_from, null);
      }
      if (highlighter)
        highlight_body(
          render,
          find_code_language(languages, source.language),
          highlighter,
          source,
        );
    },
  };
}

// The note's own tree has no code trees in rich mode, so the body is parsed
// here. A grammar that is not loaded yet leaves the body plain. The block's
// widget loads it, and the widget was drawn before the caret came in.
function highlight_body(
  render: Render,
  language: LanguageDescription | null,
  highlighter: HighlightStyle,
  source: CodeBlockSource,
) {
  const parser = language?.support?.language.parser;
  if (!parser) return;
  const body = code_window(source);
  highlightTree(
    parser.parse(source.content.toString()),
    highlighter,
    (from, to, classes) => {
      render.mark(body.to_outer(from), body.to_outer(to), classes);
    },
  );
}

// Fence text shows only while the caret is on its line. Otherwise the opening
// fence reads as a small language label and the closing one is an empty row,
// so the card keeps its height.
function fence(
  render: Render,
  line: Line,
  from: number,
  language: string | null,
) {
  if (render.touches(line.from, line.to))
    render.mark(from, line.to, "md-code-fence");
  else if (language === null) render.hide(from, line.to);
  else render.replace(from, line.to, new FenceLabel(language));
}

class FenceLabel extends WidgetType {
  constructor(readonly language: string) {
    super();
  }
  eq(other: FenceLabel): boolean {
    return other.language === this.language;
  }
  toDOM(): HTMLElement {
    const label = document.createElement("span");
    label.className = "md-code-fence-label";
    label.textContent = this.language || "code";
    return label;
  }
}

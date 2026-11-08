import type { BlockConstruct, MarkdownPlugin } from "../../core/plugin.js";
import { math_theme } from "./theme.js";
import { math_syntax, parse_math_source } from "./math_syntax.js";
import {
  InlineMathWidget,
  MathBlockWidget,
  type MathOptions,
} from "./math_widget.js";

export type { MathOptions };

// TeX between dollar signs, drawn by the host's engine. Inline formulas
// ($x^2$) are widgets that give way to their source while a caret touches
// them. A block ($$ on its own lines) does the same. The syntax rules are in
// math_syntax.ts. A fence tagged math is a code block, see code_blocks.
//
// Class names are public: md-math, md-math-block, md-math-content,
// md-math-pending, md-math-error and md-math-source.
//
// @Incomplete: The search index parses tags from the raw text, so a "#tag"
// typed inside a formula counts as a tag there while the editor draws no chip.
export function math(options: MathOptions): MarkdownPlugin {
  const math_block: BlockConstruct = {
    kind: "block",
    name: "math_block",
    nodes: ["MathBlock"],
    reveal: "caret",
    literal: true,
    // An opening "$$" without a closing line stays source.
    complete: (block) => parse_math_source(block.source).closed,
    widget: (block, state) =>
      new MathBlockWidget(block, state.readOnly, options),
    insert: [
      {
        id: "math",
        label: "Math Block",
        detail: "TeX formula",
        icon: "∑",
        aliases: ["math", "tex", "latex", "katex", "equation", "formula"],
        lines: ["$$", "", "$$"],
        caret: [1, 0],
      },
    ],
  };
  return {
    name: "math",
    requires: ["commonmark"],
    syntax: math_syntax,
    constructs: [
      math_block,
      {
        // Monospace source for the block while it shows its lines.
        kind: "line",
        name: "math_block_source",
        nodes: ["MathBlock"],
        decorate(node, render) {
          render.lines(node.from, node.to, "md-math-source");
        },
      },
      {
        kind: "inline",
        name: "inline_math",
        nodes: ["InlineMath"],
        literal: true,
        decorate(node, render) {
          if (render.reveal) {
            render.mark(node.from, node.to, "md-math-source");
            return;
          }
          const { tex, display } = parse_math_source(
            render.text(node.from, node.to),
          );
          render.hide(node.from, node.to);
          render.widget(node.to, new InlineMathWidget(tex, display, options));
        },
        // Table cells that are not being edited have no live editor, so the
        // formula is plain DOM that fills in when the engine is ready.
        render_static(node, context) {
          const { tex, display } = parse_math_source(
            context.state.sliceDoc(node.from, node.to),
          );
          return new InlineMathWidget(tex, display, options).toDOM();
        },
      },
    ],
    theme: math_theme,
  };
}

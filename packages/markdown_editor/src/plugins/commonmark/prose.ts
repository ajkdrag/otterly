import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import {
  continuation_prefix,
  has_ancestor,
  is_literal,
  line_container,
} from "../../core/context.js";
import type { Render } from "../../core/inline_rendering.js";
import type { KeyContext } from "../../core/keys.js";
import type { InlineConstruct, LineConstruct } from "../../core/plugin.js";

// Block spacing. A block sets the space it wants before itself and after
// itself. The next block's first line takes the larger of the two, through
// CSS max(), so a shared boundary is counted once.
export const paragraph_gap =
  "var(--editor-paragraph-spacing, var(--editor-spacing, 1.5rem))";
const heading_gap_before = [0, 2, 1.75, 1.5, 1.25, 1, 0.75];
const heading_gap_after = [0, 1, 0.85, 0.5, 0.5, 0.4, 0.4];

export function set_gap_after(render: Render, node: SyntaxNode, gap: string) {
  if (node.parent?.name !== "Document") return;
  const next = node.nextSibling;
  if (!next) return;
  render.gap(next, { after: gap });
}

export const paragraph: LineConstruct = {
  kind: "line",
  name: "paragraph",
  nodes: ["Paragraph", "Task"],
  decorate(node, render) {
    if (node.name === "Paragraph")
      set_gap_after(render, node.node, paragraph_gap);
  },
  keys: { "Shift-Enter": insert_hard_break },
};

// Shift-Enter: a Markdown hard break, then the line's container prefix, so
// the text stays inside its list item or quote without a new marker.
function insert_hard_break(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || is_literal(state, range.from))
    return false;
  const line = state.doc.lineAt(range.from);
  if (state.doc.lineAt(range.to).number !== line.number) return false;
  const before = state.sliceDoc(line.from, range.from);
  const spaces = before.endsWith("\\")
    ? ""
    : " ".repeat(Math.max(0, 2 - (/ +$/.exec(before)?.[0].length ?? 0)));
  const insert = `${spaces}\n${continuation_prefix(context.line())}`;
  context.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

const heading_details = [
  ["Large section heading", ["title", "large"]],
  ["Medium section heading", ["subtitle", "medium"]],
  ["Small section heading", ["small"]],
  ["Sub-section heading", []],
  ["Minor heading", []],
  ["Minor heading", []],
] as const;

export const heading: LineConstruct = {
  kind: "line",
  name: "heading",
  insert: heading_details.map(([detail, aliases], index) => {
    const level = String(index + 1);
    return {
      id: `h${level}`,
      label: `Heading ${level}`,
      detail,
      icon: `H${level}`,
      aliases: ["heading", `h${level}`, ...aliases],
      lines: ["#".repeat(index + 1) + " "],
    };
  }),
  nodes: [
    "ATXHeading1",
    "ATXHeading2",
    "ATXHeading3",
    "ATXHeading4",
    "ATXHeading5",
    "ATXHeading6",
    "SetextHeading1",
    "SetextHeading2",
  ],
  decorate(node, render) {
    const unfinished = unfinished_bullet(render.state, node.node);
    if (unfinished) {
      decorate_unfinished_bullet(unfinished, render);
      return;
    }
    const level = Number(/\d$/.exec(node.name)?.[0] ?? "1");
    const top_level = node.node.parent?.name === "Document";
    const { doc } = render.state;
    const first = doc.lineAt(node.from);
    const marks = node.node.getChildren("HeaderMark");
    if (node.name.startsWith("ATX")) {
      render.line(first.from, `md-heading md-heading-${String(level)}`);
      decorate_atx_marks(node, marks, render);
    } else {
      const underline = marks.at(-1);
      const underline_line = underline ? doc.lineAt(underline.from) : null;
      const last_text = underline_line
        ? underline_line.number - 1
        : doc.lineAt(node.to).number;
      for (let number = first.number; number <= last_text; number++)
        render.line(
          doc.line(number).from,
          `md-heading md-heading-${String(level)}`,
        );
      // The collapsed underline hides its text too: a visible "---" in a
      // zero-height line box would be a plain-text line CodeMirror could
      // sample for line metrics.
      if (
        underline_line &&
        !render.touches(underline_line.from, underline_line.to)
      ) {
        render.line(underline_line.from, "md-setext-underline");
        render.hide(underline_line.from, underline_line.to);
      }
    }
    if (top_level) {
      render.line(first.from, "md-prose-heading");
      render.gap(node.node, {
        before:
          level === 1 && !node.node.prevSibling
            ? "0px"
            : `calc(var(--editor-spacing, 1.5rem) * ${String(heading_gap_before[level] ?? 1)})`,
      });
      set_gap_after(
        render,
        node.node,
        `calc(var(--editor-spacing, 1.5rem) * ${String(heading_gap_after[level] ?? 0.5)} * var(--editor-heading-spacing-after, 1))`,
      );
    }
  },
};

// The opening marks and their space hide unless the caret is in them. Closing
// marks hide with the space before them.
function decorate_atx_marks(
  node: SyntaxNodeRef,
  marks: readonly SyntaxNode[],
  render: Render,
) {
  const { state } = render;
  const opening = marks.find((mark) => mark.from === node.from);
  if (opening) {
    const line = state.doc.lineAt(opening.from);
    const space =
      /^[ \t]*/.exec(state.sliceDoc(opening.to, line.to))?.[0] ?? "";
    const prefix_from = line_container(state, line).content_from;
    const prefix_to = opening.to + space.length;
    // An empty heading keeps its marks visible, or typing "# " would show
    // nothing at all.
    const empty =
      state
        .sliceDoc(prefix_to, line.to)
        .replace(/#+\s*$/, "")
        .trim() === "";
    if (empty || render.caret_in(prefix_from, prefix_to))
      render.mark(opening.from, opening.to, "md-syntax");
    else render.hide(opening.from, prefix_to);
  }
  for (const mark of marks) {
    if (mark === opening) continue;
    const line = state.doc.lineAt(mark.from);
    const space =
      /[ \t]*$/.exec(state.sliceDoc(line.from, mark.from))?.[0] ?? "";
    if (render.touches(mark.from - space.length, mark.to))
      render.mark(mark.from, mark.to, "md-syntax");
    else render.hide(mark.from - space.length, mark.to);
  }
}

// A single "-" typed under a paragraph parses as a Setext underline. With a
// space after it, the user is starting a bullet, so draw it as one. A bare
// underline with no trailing space stays a heading.
function unfinished_bullet(
  state: EditorState,
  node: SyntaxNode,
): SyntaxNode | null {
  if (node.name !== "SetextHeading2") return null;
  const marker = node.getChild("HeaderMark");
  if (!marker || state.sliceDoc(marker.from, marker.to) !== "-") return null;
  const line = state.doc.lineAt(marker.to);
  const trailing = state.sliceDoc(marker.to, line.to);
  const caret_on_line = state.selection.ranges.some(
    (range) => range.empty && range.head >= line.from && range.head <= line.to,
  );
  return (trailing.length > 0 && /^\s+$/.test(trailing)) || caret_on_line
    ? marker
    : null;
}

function decorate_unfinished_bullet(marker: SyntaxNode, render: Render) {
  const line = render.state.doc.lineAt(marker.from);
  // While the caret is still on a bare "-", leave it as plain source so the
  // next character lands after it.
  const content = render.text(
    line_container(render.state, line).content_from,
    line.to,
  );
  if (content.trim() === "-" && !/\s$/.test(content)) return;
  render.line(
    line.from,
    "md-list-line md-list-depth-1 md-list-item-start md-list-marker-line",
    {
      "--md-list-depth": "1",
      "--md-list-prefix-chars": String(line.to - line.from),
    },
  );
  // Same rule as a real list item: the caret after the space shows the
  // bullet. Only the bullet is replaced, never a quote prefix before it.
  const content_from = line_container(render.state, line).content_from;
  if (render.caret_in(line.from, line.to)) {
    render.line(line.from, "md-list-source-visible");
    render.mark(marker.from, marker.to, "md-list-marker");
  } else {
    render.replace(
      content_from,
      line.to,
      new TextSymbol("•", "md-list-marker"),
    );
  }
}

export const horizontal_rule: LineConstruct = {
  kind: "line",
  name: "horizontal_rule",
  nodes: ["HorizontalRule"],
  decorate(node, render) {
    const line = render.state.doc.lineAt(node.from);
    if (render.touches(line.from, line.to)) return;
    render.replace(
      node.from,
      node.to,
      new TextSymbol("", "md-horizontal-rule"),
    );
  },
  insert: [
    {
      id: "divider",
      label: "Divider",
      detail: "Horizontal rule to separate sections",
      icon: "—",
      aliases: ["divider", "hr", "horizontal", "rule", "separator", "line"],
      lines: ["---", ""],
      caret: [1, 0],
    },
  ],
};

// Escaped punctuation and entities show the character they stand for. The
// source spelling stays as written.
export const escape: InlineConstruct = {
  kind: "inline",
  name: "escape",
  nodes: ["Escape", "Entity"],
  decorate(node, render) {
    if (render.reveal || has_ancestor(node.node, ["Link", "Image"])) return;
    const source = render.text(node.from, node.to);
    if (source.includes("\n")) return;
    const shown =
      node.name === "Escape" ? source.slice(1) : decode_entity(source);
    render.replace(node.from, node.to, new TextSymbol(shown, "md-literal"));
  },
  render_static(node, context) {
    const source = context.state.sliceDoc(node.from, node.to);
    return document.createTextNode(
      node.name === "Escape" ? source.slice(1) : decode_entity(source),
    );
  },
};

// Legacy <br> tags. A <br> alone on a line is a blank line; inline it breaks
// the line. Other HTML stays literal source and never runs.
export const html_break: InlineConstruct = {
  kind: "inline",
  name: "html_break",
  nodes: ["HTMLTag"],
  decorate(node, render) {
    const source = render.text(node.from, node.to);
    if (
      !/^<br\s*\/?>$/i.test(source) ||
      has_ancestor(node.node, ["InlineCode"])
    )
      return;
    const line = render.state.doc.lineAt(node.from);
    const standalone =
      render.text(line.from, node.from).trim() === "" &&
      render.text(node.to, line.to).trim() === "";
    if (standalone)
      render.line(line.from, "md-legacy-blank-line md-blank-line");
    if (render.reveal) return;
    if (standalone)
      render.replace(line.from, line.to, new TextSymbol("", "md-html-break"));
    else render.replace(node.from, node.to, new LineBreak());
  },
};

// Indented code and raw HTML blocks are literal. They keep their source and
// get no inline rendering, completions, or rich paste.
export const indented_code: LineConstruct = {
  kind: "line",
  name: "indented_code",
  nodes: ["CodeBlock"],
  literal: true,
  decorate(node, render) {
    render.lines(node.from, node.to, "md-code-line");
  },
};

export const html_block: LineConstruct = {
  kind: "line",
  name: "html_block",
  nodes: ["HTMLBlock", "CommentBlock", "ProcessingInstructionBlock"],
  literal: true,
};

// Blank lines between the items of a list belong to the list, even though
// they sit outside every item's syntax range.
export const list_spacing: LineConstruct = {
  kind: "line",
  name: "list",
  nodes: ["BulletList", "OrderedList"],
  decorate(node, render) {
    const { doc } = render.state;
    let depth = 1;
    for (let parent = node.node.parent; parent; parent = parent.parent)
      if (parent.name === "ListItem") depth++;
    let previous: SyntaxNode | null = null;
    for (let item = node.node.firstChild; item; item = item.nextSibling) {
      if (item.name !== "ListItem") continue;
      // Items sit at normal line spacing unless the theme sets
      // --editor-list-item-spacing. The blank separator rows of a loose list
      // add their own space on top.
      if (previous) {
        render.wrap(item, "md-list-item-spaced");
        const from = doc.lineAt(previous.to).number + 1;
        const to = doc.lineAt(item.from).number;
        for (let number = from; number < to; number++)
          render.line(
            doc.line(number).from,
            `md-list-separator md-list-line md-list-depth-${String(depth)}`,
            {
              "--md-list-depth": String(depth),
            },
          );
      }
      previous = item;
    }
    set_gap_after(render, node.node, paragraph_gap);
  },
};

// Shared with the links plugin, which decodes entities in link labels and URLs.
export function decode_entity(source: string): string {
  const decoder = document.createElement("textarea");
  decoder.innerHTML = source;
  return decoder.value || source;
}

export class TextSymbol extends WidgetType {
  constructor(
    readonly text: string,
    readonly class_name: string,
  ) {
    super();
  }
  eq(other: TextSymbol) {
    return this.text === other.text && this.class_name === other.class_name;
  }
  toDOM() {
    const symbol = document.createElement("span");
    symbol.className = this.class_name;
    symbol.textContent = this.text;
    symbol.setAttribute("aria-hidden", "true");
    return symbol;
  }
}

class LineBreak extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const line_break = document.createElement("br");
    line_break.className = "md-html-break";
    line_break.setAttribute("aria-hidden", "true");
    return line_break;
  }
}

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  ChangeSet,
  type ChangeSpec,
  type EditorState,
} from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { has_ancestor, is_literal_block } from "../../core/context.js";

type BlockStyle = "bullet" | "ordered" | 1 | 2 | 3;
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
export type TextBlock = {
  from: number;
  to: number;
  node: SyntaxNode | null;
  prefix: string;
};

export const block_style_keys: readonly KeyBinding[] = [
  { key: "Mod-Alt-1", run: set_block_style(1) },
  { key: "Mod-Alt-2", run: set_block_style(2) },
  { key: "Mod-Alt-3", run: set_block_style(3) },
  { key: "Mod-Alt-7", run: set_block_style("ordered") },
  { key: "Mod-Alt-8", run: set_block_style("bullet") },
];

export function set_block_style(style: BlockStyle) {
  return (view: EditorView): boolean => {
    const blocks = selected_blocks(view);
    const changes: ChangeSpec[] = [];
    let number = 1;
    for (const block of blocks) {
      if (typeof style === "number") {
        if (is_first_list_paragraph(block.node)) continue;
        if (
          block.node?.name === `ATXHeading${String(style)}` ||
          block.node?.name === `SetextHeading${String(style)}`
        )
          continue;
        const marks = block.node?.getChildren("HeaderMark") ?? [];
        const opening = marks.find((mark) => mark.from === block.from);
        changes.push({
          from: block.from,
          to: opening?.to ?? block.from,
          insert: "#".repeat(style) + (opening ? "" : " "),
        });
        const setext = block.node?.name.startsWith("Setext");
        for (const mark of marks) {
          if (mark === opening) continue;
          const line = view.state.doc.lineAt(mark.from);
          changes.push({
            from: setext ? line.from - 1 : Math.max(block.from, mark.from - 1),
            to: mark.to,
          });
        }
        // ATX headings have one source line. Join soft line breaks so conversion
        // cannot accidentally leave the remainder as body text.
        for (
          let number = view.state.doc.lineAt(block.from).number + 1;
          number <= view.state.doc.lineAt(block.to).number;
          number++
        ) {
          const line = view.state.doc.line(number);
          if (setext && number === view.state.doc.lineAt(block.to).number)
            continue;
          const prefix_length = line.text.startsWith(block.prefix)
            ? block.prefix.length
            : 0;
          const hard_break = block.node
            ?.getChildren("HardBreak")
            .find((mark) => mark.to === line.from);
          changes.push({
            from: hard_break?.from ?? line.from - 1,
            to: line.from + prefix_length,
            insert: " ",
          });
        }
      } else {
        if (
          has_ancestor(block.node, ["ListItem"]) ||
          (block.node && block.node.name !== "Paragraph")
        )
          continue;
        const marker = style === "bullet" ? "- " : `${String(number++)}. `;
        changes.push({ from: block.from, insert: marker });
        for (
          let line = view.state.doc.lineAt(block.from).number + 1;
          line <= view.state.doc.lineAt(block.to).number;
          line++
        ) {
          const source_line = view.state.doc.line(line);
          const prefix_length = source_line.text.startsWith(block.prefix)
            ? block.prefix.length
            : 0;
          changes.push({
            from: source_line.from + prefix_length,
            insert: " ".repeat(marker.length),
          });
        }
      }
    }
    if (!changes.length) return false;
    const change_set = view.state.changes(changes);
    view.dispatch({
      changes: change_set,
      selection: view.state.selection.map(change_set, 1),
      userEvent: "input.format.block",
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

export function selected_blocks(view: EditorView): TextBlock[] {
  const { state } = view;
  if (state.readOnly || !state.facet(EditorView.editable)) return [];
  const last = state.selection.ranges[state.selection.ranges.length - 1];
  if (!last) return [];
  const tree = ensureSyntaxTree(state, last.to, 50);
  if (!tree) return [];
  const blocks = new Map<number, TextBlock>();
  for (const range of state.selection.ranges) {
    if (is_literal_block(state, range.from)) return [];
    let literal = false;
    tree.iterate({
      from: range.from,
      to: range.to,
      enter(ref) {
        const intersects = range.empty
          ? ref.from <= range.from && ref.to >= range.to
          : ref.from < range.to && ref.to > range.from;
        if (!intersects) return false;
        if (/^(FencedCode|CodeBlock|Table|HTMLBlock)$/.test(ref.name)) {
          literal = true;
          return false;
        }
        if (!/^(Paragraph|(?:ATX|Setext)Heading[1-6])$/.test(ref.name)) return;
        const line = state.doc.lineAt(ref.from);
        blocks.set(ref.from, {
          from: ref.from,
          to: ref.to,
          node: ref.node,
          prefix: state.sliceDoc(line.from, ref.from),
        });
        return false;
      },
    });
    if (literal) return [];
    if (
      range.empty &&
      ![...blocks.values()].some(
        (block) => block.from <= range.from && block.to >= range.to,
      )
    ) {
      const line = state.doc.lineAt(range.from);
      if (!line.text.trim())
        blocks.set(line.from, {
          from: line.from,
          to: line.to,
          node: null,
          prefix: "",
        });
    }
  }
  return [...blocks.values()].sort((left, right) => left.from - right.from);
}

// Block shortcuts skip the first paragraph of a list item (spec FMT-007).
// "- # Title" is valid Markdown, so this is a carried-over product choice from
// the Milkdown editor, not a syntax rule. Lezer keeps the marker as the item's
// first child and that paragraph as the second.
export function is_first_list_paragraph(node: SyntaxNode | null): boolean {
  const item = node?.parent;
  return (
    item?.name === "ListItem" &&
    item.firstChild?.nextSibling?.from === node?.from
  );
}

export function code_content(
  state: EditorState,
  block: TextBlock,
  document: Document,
) {
  const changes: ChangeSpec[] = [];
  const remove = (from: number, to: number, insert = "") => {
    changes.push({ from: from - block.from, to: to - block.from, insert });
  };
  const node = block.node;
  if (node && /Heading/.test(node.name)) {
    const marks = node.getChildren("HeaderMark");
    for (const mark of marks) {
      const line = state.doc.lineAt(mark.from);
      if (/Setext/.test(node.name))
        remove(Math.max(block.from, line.from - 1), line.to);
      else if (mark.from === block.from)
        remove(
          mark.from,
          mark.to + (state.sliceDoc(mark.to, mark.to + 1) === " " ? 1 : 0),
        );
      else remove(Math.max(block.from, mark.from - 1), mark.to);
    }
  }
  for (
    let number = state.doc.lineAt(block.from).number + 1;
    number <= state.doc.lineAt(block.to).number;
    number++
  ) {
    const line = state.doc.line(number);
    if (
      node?.name.startsWith("Setext") &&
      number === state.doc.lineAt(block.to).number
    )
      continue;
    if (block.prefix && line.text.startsWith(block.prefix))
      remove(line.from, line.from + block.prefix.length);
  }
  if (node) {
    const visit = (current: SyntaxNode) => {
      if (current.name === "Image") {
        remove(current.from, current.to);
        return;
      }
      if (current.name === "InlineCode") {
        const opening = current.firstChild;
        const closing = current.lastChild;
        if (!opening || !closing || opening === closing) return;
        const content = state.sliceDoc(opening.to, closing.from);
        const padding =
          /^ .* $/s.test(content) && /[^ \r\n]/.test(content) ? 1 : 0;
        remove(opening.from, opening.to + padding);
        remove(closing.from - padding, closing.to);
        for (let at = opening.to; at < closing.from; at++)
          if (state.sliceDoc(at, at + 1) === "\n") remove(at, at + 1, " ");
        return;
      }
      if (current.name === "Autolink") {
        remove(current.from, current.from + 1);
        remove(current.to - 1, current.to);
        return;
      }
      if (current.name === "Link") {
        const marks = current.getChildren("LinkMark");
        if (marks[0] && marks[1]) {
          remove(marks[0].from, marks[0].to);
          remove(marks[1].from, current.to);
        }
        for (let child = current.firstChild; child; child = child.nextSibling)
          if (
            child.to <= (marks[1]?.from ?? current.to) &&
            child.name !== "LinkMark"
          )
            visit(child);
        return;
      }
      if (current.name === "HardBreak") {
        remove(current.from, current.to, "\n");
        return;
      }
      if (/^(EmphasisMark|StrikethroughMark|CodeMark)$/.test(current.name)) {
        remove(current.from, current.to);
        return;
      }
      if (current.name === "Escape") {
        remove(current.from, current.from + 1);
        return;
      }
      if (current.name === "Entity") {
        const decoder = document.createElement("textarea");
        decoder.innerHTML = state.sliceDoc(current.from, current.to);
        remove(current.from, current.to, decoder.value);
        return;
      }
      for (let child = current.firstChild; child; child = child.nextSibling)
        visit(child);
    };
    visit(node);
  }
  const source = state.doc.slice(block.from, block.to);
  const content_changes = ChangeSet.of(changes, source.length);
  return { text: content_changes.apply(source).toString(), content_changes };
}

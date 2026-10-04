import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  ChangeSet,
  EditorSelection,
  type ChangeSpec,
  type EditorState,
} from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import { get_frontmatter_end } from "./frontmatter_range.js";
import { focus_code_selection } from "./code_block_rendering.js";

type BlockStyle = "bullet" | "ordered" | 1 | 2 | 3;
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
type TextBlock = {
  from: number;
  to: number;
  node: SyntaxNode | null;
  prefix: string;
};

export const markdown_block_keymap = keymap.of([
  { key: "Mod-Alt-1", run: set_block_style(1) },
  { key: "Mod-Alt-2", run: set_block_style(2) },
  { key: "Mod-Alt-3", run: set_block_style(3) },
  { key: "Mod-Alt-7", run: set_block_style("ordered") },
  { key: "Mod-Alt-8", run: set_block_style("bullet") },
  { key: "Mod-Alt-c", run: insert_code_block },
]);

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
          has_list_ancestor(block.node) ||
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

export function insert_code_block(view: EditorView): boolean {
  const blocks = selected_blocks(view).filter(
    (block) => !is_first_list_paragraph(block.node),
  );
  if (!blocks.length) return false;
  const changes: ChangeSpec[] = [];
  const projections: {
    block: TextBlock;
    text: string;
    content_changes: ChangeSet;
    offset: number;
  }[] = [];
  for (const block of blocks) {
    const { text, content_changes } = code_content(
      view.state,
      block,
      view.dom.ownerDocument,
    );
    let longest_run = 2;
    for (const run of text.matchAll(/`+/g))
      longest_run = Math.max(longest_run, run[0].length);
    const fence = "`".repeat(longest_run + 1);
    const content = text
      .split("\n")
      .map((line) => block.prefix + line)
      .join("\n");
    changes.push({
      from: block.from,
      to: block.to,
      insert: `${fence}\n${content}\n${block.prefix}${fence}`,
    });
    projections.push({
      block,
      text,
      content_changes,
      offset: fence.length + 1 + block.prefix.length,
    });
  }
  const change_set = view.state.changes(changes);
  const map_position = (position: number) => {
    const projection = projections.find(
      ({ block }) => position >= block.from && position <= block.to,
    );
    if (!projection) return change_set.mapPos(position);
    const { block, text, content_changes, offset } = projection;
    const content_position = content_changes.mapPos(position - block.from);
    const preceding_lines =
      text.slice(0, content_position).split("\n").length - 1;
    return (
      change_set.mapPos(block.from, -1) +
      offset +
      content_position +
      preceding_lines * block.prefix.length
    );
  };
  const cursors = view.state.selection.ranges.map((range) =>
    EditorSelection.range(map_position(range.anchor), map_position(range.head)),
  );
  view.dispatch({
    changes: change_set,
    selection: EditorSelection.create(cursors, view.state.selection.mainIndex),
    userEvent: "input.format.block",
    scrollIntoView: true,
  });
  if (!focus_code_selection(view)) view.focus();
  return true;
}

function selected_blocks(view: EditorView): TextBlock[] {
  const { state } = view;
  if (state.readOnly || !state.facet(EditorView.editable)) return [];
  const last = state.selection.ranges[state.selection.ranges.length - 1];
  if (!last) return [];
  const tree = ensureSyntaxTree(state, last.to, 50);
  if (!tree) return [];
  const blocks = new Map<number, TextBlock>();
  for (const range of state.selection.ranges) {
    if (range.from < get_frontmatter_end(state)) return [];
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

// Milkdown requires a paragraph before other blocks in each list item. Lezer
// keeps the list marker as its first child and that paragraph as the second.
function is_first_list_paragraph(node: SyntaxNode | null): boolean {
  const item = node?.parent;
  return (
    item?.name === "ListItem" &&
    item.firstChild?.nextSibling?.from === node?.from
  );
}
function has_list_ancestor(node: SyntaxNode | null): boolean {
  for (let parent = node?.parent; parent; parent = parent.parent)
    if (parent.name === "ListItem") return true;
  return false;
}

function code_content(
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

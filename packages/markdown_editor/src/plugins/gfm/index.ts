import { WidgetType, type EditorView } from "@codemirror/view";
import {
  block_at,
  finish_block_construction,
  get_blocks,
  is_block_rendered,
} from "../../core/block_field.js";
import type { KeyContext } from "../../core/keys.js";
import type {
  BlockConstruct,
  InlineConstruct,
  MarkdownPlugin,
} from "../../core/plugin.js";
import { focus_selection } from "../../core/surface.js";
import { strikethrough_keys } from "../commonmark/format_commands.js";
import { strikethrough } from "../commonmark/marks.js";
import { append_row_change } from "./table_model.js";
import { TableWidget, table_model } from "./table_widget.js";
import { gfm_theme } from "./theme.js";

// GitHub Flavored Markdown: tables, task lists, and strikethrough. The parser
// always understands GFM syntax; this plugin renders and edits it.
export function gfm(): MarkdownPlugin {
  return {
    name: "gfm",
    requires: ["commonmark"],
    constructs: [table, task, strikethrough],
    keys: strikethrough_keys,
    theme: gfm_theme,
  };
}

const table: BlockConstruct = {
  kind: "block",
  name: "table",
  nodes: ["Table"],
  reveal: "surface",
  widget: (block, state) => new TableWidget(block, state.readOnly),
  keys: { Enter: finish_table_source },
  insert: [
    {
      id: "table",
      label: "Table",
      detail: "Grid with rows and columns",
      icon: "⊞",
      aliases: ["table", "grid", "spreadsheet", "data"],
      lines: ["| Col 1 | Col 2 |", "| --- | --- |", "|  |  |", ""],
      // The first body cell, after its leading space.
      caret: [2, 2],
    },
  ],
};

// Enter at the end of a delimiter row that is still being typed finishes the
// table. Without a body row it adds one. Focus moves to the first body cell
// before the next key.
function finish_table_source(context: KeyContext): boolean {
  const { state, view } = context;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) return false;
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;
  const block = get_blocks(state).find(
    (candidate) =>
      candidate.construct === table &&
      line.from >= candidate.from &&
      line.to <= candidate.to,
  );
  if (!block || is_block_rendered(state, block)) return false;
  const model = table_model(state, block);
  if (!model || state.doc.lineAt(model.delimiter_from).number !== line.number)
    return false;
  view.dispatch({
    ...(model.rows.length === 1
      ? { changes: append_row_change(state, model) }
      : {}),
    effects: finish_block_construction.of(null),
    userEvent: "input",
  });
  focus_first_body_cell(view, block.from);
  return true;
}

function focus_first_body_cell(view: EditorView, block_from: number) {
  const block = block_at(view.state, block_from);
  const model = block ? table_model(view.state, block) : null;
  const cell = model?.rows[1]?.cells[0];
  if (!cell) return;
  view.dispatch({ selection: { anchor: cell.from } });
  focus_selection(view);
}

// "[ ]" and "[x]" show as checkboxes. The checkbox changes only the one
// character inside the brackets. The source shows while a caret touches it,
// so typing "- [ ]" keeps every character visible until the space after it.
const task: InlineConstruct = {
  kind: "inline",
  name: "task",
  nodes: ["TaskMarker"],
  decorate(node, render) {
    const checked = render.text(node.from, node.to).toLowerCase() === "[x]";
    if (!render.reveal)
      render.replace(node.from, node.to, new TaskCheckbox(node.from, checked));
    const task_node = node.node.parent;
    if (!checked || task_node?.name !== "Task") return;
    const body = render.text(node.to, task_node.to);
    const body_from = node.to + (body.length - body.trimStart().length);
    if (body_from < task_node.to)
      render.mark(body_from, task_node.to, "md-task-completed");
  },
  insert: [
    {
      id: "todo",
      label: "Task List",
      detail: "Checklist item with a checkbox",
      icon: "☐",
      aliases: ["task", "todo", "checkbox", "check", "list"],
      lines: ["- [ ] "],
    },
  ],
};

class TaskCheckbox extends WidgetType {
  constructor(
    readonly from: number,
    readonly checked: boolean,
  ) {
    super();
  }

  eq(other: TaskCheckbox) {
    return this.from === other.from && this.checked === other.checked;
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.disabled = view.state.readOnly;
    input.className = "md-task-checkbox";
    input.setAttribute("aria-label", "Complete task");
    input.addEventListener("change", () => {
      if (view.state.readOnly) return;
      const marker = view.state.sliceDoc(this.from, this.from + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({
        changes: {
          from: this.from + 1,
          to: this.from + 2,
          insert: input.checked ? "x" : " ",
        },
        userEvent: "input.task",
      });
    });
    return input;
  }

  ignoreEvent() {
    return true;
  }
}

export { table_model };

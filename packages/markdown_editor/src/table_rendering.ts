import { syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { redo, undo } from "@codemirror/commands";
import {
  StateField,
  StateEffect,
  Prec,
  Transaction,
  type Extension,
  type Range,
  type StateCommand,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { get_frontmatter_end } from "./frontmatter_range.js";
import { get_find_matches, get_find_query } from "./find_highlights.js";
import { focus_code_selection } from "./code_block_rendering.js";
import { read_code_block } from "./code_block_source.js";
import {
  toggle_bold,
  toggle_inline_code,
  toggle_italic,
  toggle_strikethrough,
} from "./format_commands.js";

type CellRange = {
  from: number;
  to: number;
  source_from: number;
  source_to: number;
  leading_padding: number;
  trailing_padding: number;
  text: string;
  node: SyntaxNode | null;
  virtual?: boolean;
};
type SyntaxNode = NonNullable<
  ReturnType<ReturnType<typeof syntaxTree>["resolve"]>
>;
type TableRow = {
  from: number;
  to: number;
  cells: CellRange[];
  source_cell_count: number;
  trailing_pipe: boolean;
};
type TableModel = {
  node: SyntaxNode;
  from: number;
  to: number;
  rows: TableRow[];
  alignments: string[];
  delimiter_from: number;
  delimiter_to: number;
};
type ActiveCell = {
  table_from: number;
  row: number;
  col: number;
  leading_padding: number;
  trailing_padding: number;
};
type TableFindState = {
  query: string;
  selected_index: number;
  matches: ReturnType<typeof get_find_matches>;
};
type TableFieldValue = {
  tree: ReturnType<typeof syntaxTree>;
  tables: TableModel[];
  active: ActiveCell | null;
  editing_source_from: number | null;
  reference_targets: Map<string, string>;
  read_only: boolean;
  preserve_active_text: boolean;
  find: TableFindState;
};
type TableRenderingOptions = {
  undo_command?: StateCommand;
  redo_command?: StateCommand;
  open_link?: (target: string) => void;
};

const active_cell_effect = StateEffect.define<ActiveCell | null>();
const table_fields = new WeakMap<EditorView, StateField<TableFieldValue>>();
const table_viewports = new WeakMap<HTMLElement, TableViewport>();
const virtualize_after_rows = 100;
const table_viewport_height = 448;
const table_row_height_estimate = 42;
const table_row_overscan = 8;

/** Render parsed GFM tables as a grid and write every cell edit to CM6 source. */
export function table_rendering(
  options: TableRenderingOptions = {},
): Extension {
  const undo_command = options.undo_command ?? undo;
  const redo_command = options.redo_command ?? redo;
  const table_field = StateField.define<TableFieldValue>({
    create(state) {
      const tree = syntaxTree(state);
      const tables = parse_tables(state);
      return {
        tree,
        tables,
        active: null,
        editing_source_from: editing_table_source(
          state,
          tables,
          null,
          null,
          false,
        ),
        reference_targets: find_reference_targets(state),
        read_only: state.readOnly,
        preserve_active_text: false,
        find: read_find_state(state),
      };
    },
    update(previous, transaction) {
      const tree = syntaxTree(transaction.state);
      const reparses = transaction.docChanged || tree !== previous.tree;
      const find = read_find_state(transaction.state);
      const find_changed =
        find.query !== previous.find.query ||
        find.selected_index !== previous.find.selected_index ||
        find.matches !== previous.find.matches;
      let active = map_active_cell(previous.active, transaction);
      for (const effect of transaction.effects) {
        if (effect.is(active_cell_effect)) {
          active = effect.value
            ? {
                ...effect.value,
                table_from: transaction.changes.mapPos(
                  effect.value.table_from,
                  -1,
                ),
              }
            : null;
        }
      }
      const tables = reparses
        ? parse_tables(transaction.state)
        : previous.tables;
      const reference_targets = reparses
        ? find_reference_targets(transaction.state)
        : previous.reference_targets;
      active = resolve_active_cell(active, tables);
      const previous_editing_from =
        previous.editing_source_from === null
          ? null
          : transaction.changes.mapPos(previous.editing_source_from, -1);
      const editing_source_from = editing_table_source(
        transaction.state,
        tables,
        active,
        previous_editing_from,
        transaction.docChanged &&
          (transaction.isUserEvent("input.type") ||
            transaction.isUserEvent("delete")),
      );
      const read_only = transaction.state.readOnly;
      const preserve_active_text =
        transaction.annotation(Transaction.userEvent) ===
        "input.type.table-cell";
      if (
        !reparses &&
        active === previous.active &&
        editing_source_from === previous.editing_source_from &&
        read_only === previous.read_only &&
        preserve_active_text === previous.preserve_active_text &&
        !find_changed
      )
        return previous;
      return {
        tree,
        tables,
        active,
        editing_source_from,
        reference_targets,
        read_only,
        preserve_active_text,
        find,
      };
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) =>
        make_table_decorations(
          value,
          field,
          undo_command,
          redo_command,
          value.find,
          options.open_link,
        ),
      ),
  });

  const parse_refresh = ViewPlugin.fromClass(
    class {
      readonly view: EditorView;
      timer: ReturnType<typeof setTimeout> | null = null;
      destroyed = false;

      constructor(view: EditorView) {
        this.view = view;
        table_fields.set(view, table_field);
        this.schedule_check(view);
      }

      update(update: ViewUpdate) {
        this.schedule_check(update.view);
      }

      destroy() {
        this.destroyed = true;
        table_fields.delete(this.view);
        if (this.timer !== null) clearTimeout(this.timer);
      }

      private schedule_check(view: EditorView) {
        if (this.timer !== null || this.destroyed) return;
        const state = view.state;
        if (
          syntaxTreeAvailable(state, state.doc.length) &&
          syntaxTree(state) === state.field(table_field).tree
        )
          return;
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.destroyed) return;
          const current = view.state;
          if (syntaxTree(current) !== current.field(table_field).tree) {
            view.dispatch({ effects: parse_refresh_effect.of() });
          }
          this.schedule_check(view);
        }, 20);
      }
    },
  );

  const enter_table_on_arrow = EditorView.domEventHandlers({
    keydown(event, view) {
      return enter_table_from_outer_selection(view, table_field, event);
    },
  });

  return [
    table_field,
    parse_refresh,
    // Complete the delimiter before the ordinary Markdown Enter binding.
    Prec.highest(
      keymap.of([
        { key: "Enter", run: (view) => finish_table_source(view, table_field) },
      ]),
    ),
    // Run before the editor's default arrows can jump across the block widget.
    Prec.highest(enter_table_on_arrow),
  ];
}

function editing_table_source(
  state: EditorView["state"],
  tables: TableModel[],
  active: ActiveCell | null,
  previous_from: number | null,
  typing: boolean,
): number | null {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty) return null;
  const line = state.doc.lineAt(selection.head);
  for (const table of tables) {
    if (active?.table_from === table.from) continue;
    const first = state.doc.lineAt(table.from).number;
    const delimiter = state.doc.lineAt(table.delimiter_from).number;
    const last = state.doc.lineAt(table.to).number;
    if (line.number < first || line.number > last) continue;
    // Replacing a delimiter under the native caret redirects the next input
    // into the nearest visible prose. Keep its source until Enter or leaving.
    if (
      line.number === delimiter ||
      previous_from === table.from ||
      (typing && line.number === first)
    )
      return table.from;
  }
  return null;
}

function finish_table_source(
  view: EditorView,
  field: StateField<TableFieldValue>,
): boolean {
  if (view.state.readOnly) return false;
  const value = view.state.field(field);
  const table = value.tables.find(
    (candidate) => candidate.from === value.editing_source_from,
  );
  if (!table) return false;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  if (!selection.empty || selection.head !== line.to) return false;
  if (line.number === view.state.doc.lineAt(table.delimiter_from).number) {
    if (table.rows.length === 1) append_table_row(view, field, table, 0);
    else activate_cell(view, field, table, 1, 0);
    return true;
  }
  return false;
}

export function focus_table_selection(view: EditorView): boolean {
  const field = table_fields.get(view);
  const value = field ? view.state.field(field, false) : undefined;
  if (!value) return false;
  const selection = view.state.selection.main;
  for (const table of value.tables) {
    for (let row = 0; row < table.rows.length; row++) {
      const cells = table.rows[row]?.cells ?? [];
      for (let col = 0; col < cells.length; col++) {
        const cell = cells[col];
        if (!cell || selection.from < cell.from || selection.to > cell.to)
          continue;
        view.dispatch({
          effects: [
            active_cell_effect.of({
              table_from: table.from,
              row,
              col,
              leading_padding: cell.leading_padding,
              trailing_padding: cell.trailing_padding,
            }),
            EditorView.scrollIntoView(selection.from),
          ],
        });
        const element = find_cell_element(view, table.from, row, col);
        if (!element) return false;
        element.focus();
        if (!view.state.readOnly) {
          restore_dom_selection(element, {
            anchor: selection.anchor - cell.from,
            head: selection.head - cell.from,
          });
        }
        return true;
      }
    }
  }
  return false;
}

function read_find_state(state: EditorView["state"]): TableFindState {
  return { ...get_find_query(state), matches: get_find_matches(state) };
}

const parse_refresh_effect = StateEffect.define<void>();

function parse_tables(state: EditorView["state"]): TableModel[] {
  const tables: TableModel[] = [];
  const frontmatter_end = get_frontmatter_end(state);
  const tree = syntaxTree(state);
  const incomplete_boundary =
    tree.length < state.doc.length &&
    !syntaxTreeAvailable(state, state.doc.length);
  tree.iterate({
    enter(reference) {
      if (reference.name !== "Table") return;
      if (incomplete_boundary && reference.to >= tree.length) return false;
      const node = find_syntax_node(
        state,
        reference.name,
        reference.from,
        reference.to,
      );
      if (!node || node.from < frontmatter_end) return false;
      const rows: TableRow[] = [];
      let alignments: string[] = [];
      let delimiter_from = node.from;
      let delimiter_to = node.from;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === "TableHeader" || child.name === "TableRow") {
          rows.push(parse_table_row(state, child));
        } else if (child.name === "TableDelimiter") {
          alignments = parse_alignments(state.sliceDoc(child.from, child.to));
          delimiter_from = child.from;
          delimiter_to = child.to;
        }
      }
      if (rows.length > 0 && rows[0]?.cells.length) {
        const column_count = Math.max(
          rows[0].cells.length,
          ...rows.map((row) => row.cells.length),
        );
        for (const row of rows)
          pad_row_to_column_count(state, row, column_count);
        tables.push({
          node,
          from: node.from,
          to: node.to,
          rows,
          alignments,
          delimiter_from,
          delimiter_to,
        });
      }
      return false;
    },
  });
  return tables;
}

function parse_table_row(
  state: EditorView["state"],
  node: SyntaxNode,
): TableRow {
  const cells: SyntaxNode[] = [];
  const pipes: number[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") cells.push(child);
    if (child.name === "TableDelimiter") pipes.push(child.from);
  }

  const source = state.sliceDoc(node.from, node.to);
  const ranges = split_row_cells(state, node.from, node.to, pipes, cells);
  return {
    from: node.from,
    to: node.to,
    cells: ranges.map((range) => ({
      ...range,
      text: state.sliceDoc(range.from, range.to),
    })),
    source_cell_count: ranges.length,
    trailing_pipe:
      pipes.length > 0 &&
      /^\s*$/.test(source.slice((pipes.at(-1) ?? node.to) - node.from + 1)),
  };
}

function split_row_cells(
  state: EditorView["state"],
  from: number,
  to: number,
  pipe_positions: number[],
  parsed_cells: SyntaxNode[],
): Array<{
  from: number;
  to: number;
  source_from: number;
  source_to: number;
  leading_padding: number;
  trailing_padding: number;
  node: SyntaxNode | null;
}> {
  const line = state.sliceDoc(from, to);
  const pipes = pipe_positions.map((position) => position - from);
  const starts_with_pipe = pipes[0] === first_non_space(line);
  const ends_with_pipe = pipes.at(-1) === last_non_space(line);
  const segments: Array<{ from: number; to: number }> = [];
  let start = starts_with_pipe ? (pipes[0] ?? -1) + 1 : 0;
  for (const pipe of pipes) {
    if (pipe < start) continue;
    segments.push({ from: start, to: pipe });
    start = pipe + 1;
  }
  if (!ends_with_pipe) segments.push({ from: start, to: line.length });

  return segments.map((segment) => {
    const content = line.slice(segment.from, segment.to);
    const leading = content.search(/[^ \t]/);
    if (leading < 0) {
      const point = segment.to;
      return {
        from: from + point,
        to: from + point,
        source_from: from + segment.from,
        source_to: from + segment.to,
        leading_padding: content.length,
        trailing_padding: 0,
        node: null,
      };
    }
    const first = segment.from + leading;
    let last = segment.to;
    while (last > first && /[ \t]/.test(line[last - 1] ?? "")) last--;
    const parsed = parsed_cells.find(
      (cell) => cell.from >= from + first && cell.to <= from + last,
    );
    if (parsed && parsed.from >= from + first && parsed.to <= from + last) {
      return {
        from: parsed.from,
        to: parsed.to,
        source_from: from + segment.from,
        source_to: from + segment.to,
        leading_padding: first - segment.from,
        trailing_padding: segment.to - last,
        node: parsed,
      };
    }
    return {
      from: from + first,
      to: from + last,
      source_from: from + segment.from,
      source_to: from + segment.to,
      leading_padding: first - segment.from,
      trailing_padding: segment.to - last,
      node: null,
    };
  });
}

function pad_row_to_column_count(
  state: EditorView["state"],
  row: TableRow,
  column_count: number,
) {
  while (row.cells.length < column_count) {
    const point = row.to;
    row.cells.push({
      from: point,
      to: point,
      source_from: point,
      source_to: point,
      leading_padding: 0,
      trailing_padding: 0,
      text: "",
      node: null,
      virtual: true,
    });
  }
  for (const cell of row.cells) cell.text = state.sliceDoc(cell.from, cell.to);
}

function parse_alignments(source: string): string[] {
  const parts = source
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|");
  return parts.map((part) => {
    const value = part.trim();
    if (value.startsWith(":") && value.endsWith(":")) return "center";
    if (value.startsWith(":")) return "left";
    if (value.endsWith(":")) return "right";
    return "";
  });
}

function find_reference_targets(
  state: EditorView["state"],
): Map<string, string> {
  const targets = new Map<string, string>();
  const frontmatter_end = get_frontmatter_end(state);
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "LinkReference" || node.from < frontmatter_end) return;
      const source = state.sliceDoc(node.from, node.to);
      const match = /^\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(source);
      const target = match?.[2] ?? match?.[3];
      if (match?.[1] && target)
        targets.set(normalize_reference(match[1]), target);
    },
  });
  return targets;
}

function normalize_reference(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function append_source_text(
  parent: HTMLElement,
  state: EditorView["state"] | null,
  from: number,
  to: number,
  find: TableFindState,
  override?: string,
  unescape_pipes = false,
) {
  const source = override ?? state?.sliceDoc(from, to) ?? "";
  const match_ranges = find.matches.filter(
    (match) => match.from < to && match.to > from,
  );
  let run = "";
  let run_selected: boolean | null = null;
  let source_offset = 0;
  const flush = () => {
    if (!run) return;
    if (run_selected === null) parent.append(document.createTextNode(run));
    else {
      const mark = document.createElement("span");
      mark.className = run_selected
        ? "find-match find-match--selected"
        : "find-match";
      mark.textContent = run;
      parent.append(mark);
    }
    run = "";
  };
  while (source_offset < source.length) {
    let visible = source[source_offset] ?? "";
    let source_length = 1;
    if (
      unescape_pipes &&
      visible === "\\" &&
      source[source_offset + 1] === "|"
    ) {
      visible = "|";
      source_length = 2;
    }
    const match_index = match_ranges.findIndex(
      (match) =>
        match.from < from + source_offset + source_length &&
        match.to > from + source_offset,
    );
    const selected =
      match_index < 0
        ? null
        : match_ranges[match_index] === find.matches[find.selected_index];
    if (run_selected !== selected) {
      flush();
      run_selected = selected;
    }
    run += visible;
    source_offset += source_length;
  }
  flush();
}

function render_inline_node(
  parent: HTMLElement,
  node: SyntaxNode,
  cell_from: number,
  cell_to: number,
  view: EditorView,
  references: Map<string, string>,
  find: TableFindState,
  open_link?: (target: string) => void,
) {
  const name = node.name;
  if (
    [
      "EmphasisMark",
      "StrikethroughMark",
      "CodeMark",
      "LinkMark",
      "LinkLabel",
      "URL",
    ].includes(name)
  )
    return;
  if (name === "WikiLink") {
    const raw_source = view.state.sliceDoc(node.from, node.to);
    const source = raw_source.slice(2, -2).replace(/\\\|/g, "|");
    const [target_part, label_part] = source.split("|");
    const target = target_part?.trim() ?? "";
    const label =
      label_part?.trim() || target.split("#")[0]?.split("/").at(-1) || target;
    const raw_pipe = raw_source.indexOf("|");
    const label_offset =
      raw_pipe >= 0
        ? node.from + 2 + raw_pipe + 1 + (label_part?.indexOf(label) ?? 0)
        : node.from + 2 + Math.max(0, target_part?.indexOf(label) ?? 0);
    append_link(
      parent,
      label,
      wiki_target(target),
      find,
      label_offset,
      open_link,
    );
    return;
  }
  if (name === "Link" || name === "Autolink") {
    const source = view.state.sliceDoc(node.from, node.to);
    const inline = /^\[([^\]]*)\]\((?:<([^>]+)>|(\S+?))(?:\s+[^)]*)?\)$/.exec(
      source,
    );
    const reference = /^\[([^\]]*)\](?:\[([^\]]*)\])?$/.exec(source);
    const autolink = /^<([^>]+)>$/.exec(source);
    let target =
      inline?.[2] ??
      inline?.[3] ??
      autolink?.[1] ??
      (/^(?:https?:\/\/|mailto:)/i.test(source) ? source : undefined);
    const label = inline?.[1] ?? autolink?.[1] ?? reference?.[1] ?? source;
    if (!target && reference)
      target = references.get(
        normalize_reference(reference[2] || reference[1] || ""),
      );
    if (target) {
      const label_from =
        node.from + (source.indexOf(label) >= 0 ? source.indexOf(label) : 0);
      append_link(parent, label, target, find, label_from, open_link);
    } else {
      append_source_text(parent, view.state, node.from, node.to, find);
    }
    return;
  }
  const wrapper_name: Record<string, string> = {
    StrongEmphasis: "strong",
    Emphasis: "em",
    Strikethrough: "del",
    InlineCode: "code",
  };
  const tag = wrapper_name[name];
  const output = tag ? document.createElement(tag) : parent;
  if (tag) parent.append(output);
  if (name === "HardBreak") {
    parent.append(document.createElement("br"));
    return;
  }
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > cursor)
      append_source_text(output, view.state, cursor, child.from, find);
    render_inline_node(
      output,
      child,
      cell_from,
      cell_to,
      view,
      references,
      find,
      open_link,
    );
    cursor = child.to;
  }
  if (!node.firstChild)
    append_source_text(
      output,
      view.state,
      Math.max(node.from, cell_from),
      Math.min(node.to, cell_to),
      find,
    );
  else if (cursor < node.to)
    append_source_text(output, view.state, cursor, node.to, find);
}

function append_link(
  parent: HTMLElement,
  label: string,
  target: string,
  find: TableFindState,
  label_from: number,
  open_link?: (target: string) => void,
) {
  const element = document.createElement(open_link ? "a" : "span");
  append_source_text(
    element,
    null,
    label_from,
    label_from + label.length,
    find,
    label,
  );
  element.title = target;
  if (open_link) {
    const anchor = element as HTMLAnchorElement;
    anchor.setAttribute("role", "link");
    anchor.dataset.tableLinkTarget = target;
    anchor.tabIndex = 0;
    anchor.setAttribute("aria-label", `${label} (${target})`);
    anchor.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      )
        open_link(target);
    });
  }
  parent.append(element);
}

function wiki_target(target: string) {
  const [path, ...fragment] = target.split("#");
  const resolved = path?.endsWith(".md") || !path ? path : `${path}.md`;
  return fragment.length
    ? `${resolved ?? ""}#${fragment.join("#")}`
    : (resolved ?? target);
}

function make_table_decorations(
  value: TableFieldValue,
  field: StateField<TableFieldValue>,
  undo_command: StateCommand,
  redo_command: StateCommand,
  find: TableFindState,
  open_link?: (target: string) => void,
): DecorationSet {
  const ranges: Range<Decoration>[] = value.tables
    .filter((table) => table.from !== value.editing_source_from)
    .map((table) =>
      Decoration.replace({
        widget: new TableWidget(
          table,
          value.active,
          value.read_only,
          field,
          undo_command,
          redo_command,
          value.reference_targets,
          find,
          open_link,
        ),
        block: true,
      }).range(table.from, table.to),
    );
  return Decoration.set(ranges, true);
}

function find_syntax_node(
  state: EditorView["state"],
  name: string,
  from: number,
  to: number,
): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(from, 1);
  while (node) {
    if (node.name === name && node.from === from && node.to === to) return node;
    node = node.parent;
  }
  return null;
}

function map_active_cell(
  active: ActiveCell | null,
  transaction: Transaction,
): ActiveCell | null {
  if (!active || !transaction.docChanged) return active;
  return {
    ...active,
    table_from: transaction.changes.mapPos(active.table_from, -1),
  };
}

function resolve_active_cell(
  active: ActiveCell | null,
  tables: TableModel[],
): ActiveCell | null {
  if (!active) return null;
  const table = tables.find(
    (candidate) =>
      candidate.from === active.table_from ||
      (candidate.from <= active.table_from &&
        candidate.to >= active.table_from),
  );
  if (!table || table.rows.length === 0) return null;
  const row = Math.min(Math.max(active.row, 0), table.rows.length - 1);
  const col = Math.min(
    Math.max(active.col, 0),
    (table.rows[row]?.cells.length ?? 1) - 1,
  );
  return { ...active, table_from: table.from, row, col };
}

function same_table_render(left: TableWidget, right: TableWidget): boolean {
  return (
    left.table === right.table &&
    left.read_only === right.read_only &&
    left.active?.table_from === right.active?.table_from &&
    left.active?.row === right.active?.row &&
    left.active?.col === right.active?.col &&
    left.find.query === right.find.query &&
    left.find.selected_index === right.find.selected_index &&
    left.find.matches === right.find.matches
  );
}

class TableWidget extends WidgetType {
  constructor(
    readonly table: TableModel,
    readonly active: ActiveCell | null,
    readonly read_only: boolean,
    readonly field: StateField<TableFieldValue>,
    readonly undo_command: StateCommand,
    readonly redo_command: StateCommand,
    readonly reference_targets: Map<string, string>,
    readonly find: TableFindState,
    readonly open_link?: (target: string) => void,
  ) {
    super();
  }

  get estimatedHeight(): number {
    // These estimates include the header row. CM measures the mounted table
    // and corrects for wrapped cells and the active theme's font metrics.
    return this.is_virtualized()
      ? table_viewport_height
      : this.table.rows.length * table_row_height_estimate;
  }

  eq(other: TableWidget) {
    return same_table_render(this, other);
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "md-table-widget";
    wrapper.dataset.tableFrom = String(this.table.from);
    const table_element = document.createElement("table");
    table_element.setAttribute("role", "grid");
    table_element.setAttribute("aria-rowcount", String(this.table.rows.length));
    table_element.style.borderCollapse = "collapse";
    table_element.style.width = "100%";
    if (this.is_virtualized()) {
      table_element.style.tableLayout = "fixed";
      this.set_column_widths(table_element);
      const header = document.createElement("thead");
      const header_row = this.create_row(0, view, wrapper);
      for (const cell of header_row.cells) {
        (cell as HTMLElement).style.position = "sticky";
        (cell as HTMLElement).style.top = "0";
        (cell as HTMLElement).style.zIndex = "1";
      }
      header.append(header_row);
      const body = document.createElement("tbody");
      table_element.append(header, body);
      const viewport = document.createElement("div");
      viewport.className = "md-table-viewport";
      viewport.style.maxHeight = `${String(table_viewport_height)}px`;
      viewport.style.overflow = "auto";
      viewport.append(table_element);
      wrapper.append(viewport);
      const controller = new TableViewport(
        viewport,
        body,
        this.table.rows.length,
        this.active?.row ?? null,
        this.selected_table_row(),
        (row) => this.create_row(row, view, wrapper),
        (element, row) => this.update_row(element, row, view),
      );
      table_viewports.set(wrapper, controller);
      controller.mount();
    } else {
      this.table.rows.forEach((_row, row_index) => {
        table_element.append(this.create_row(row_index, view, wrapper));
      });
      wrapper.append(table_element);
    }
    if (this.active && !this.read_only)
      wrapper.append(this.create_actions(view));
    return wrapper;
  }

  private create_actions(view: EditorView) {
    const actions = document.createElement("div");
    actions.className = "md-table-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "Table actions");
    const row = this.active?.row ?? 0;
    const col = this.active?.col ?? 0;
    actions.append(
      table_action_button("Add row", () => {
        append_table_row(view, this.field, this.table, col);
      }),
      table_action_button(
        "Delete row",
        () => {
          delete_table_row(view, this.field, this.table, row, col);
        },
        row === 0,
      ),
      table_action_button("Add column", () => {
        insert_table_column(view, this.field, this.table, row, col);
      }),
      table_action_button(
        "Delete column",
        () => {
          delete_table_column(view, this.field, this.table, row, col);
        },
        (this.table.rows[0]?.cells.length ?? 0) <= 1,
      ),
    );
    return actions;
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    dom.dataset.tableFrom = String(this.table.from);
    if (this.is_virtualized()) {
      const controller = table_viewports.get(dom);
      if (!controller) return false;
      const header = dom.querySelector<HTMLTableRowElement>("thead tr");
      if (!header || !this.update_row(header, 0, view)) return false;
      dom
        .querySelector("table")
        ?.setAttribute("aria-rowcount", String(this.table.rows.length));
      controller.update(
        this.table.rows.length,
        this.active?.row ?? null,
        this.selected_table_row(),
        (row) => this.create_row(row, view, dom),
        (element, row) => this.update_row(element, row, view),
      );
    } else {
      const row_elements = dom.querySelectorAll("tr");
      if (row_elements.length !== this.table.rows.length) return false;
      for (let row = 0; row < this.table.rows.length; row++) {
        const element = row_elements[row];
        if (!element || !this.update_row(element, row, view)) return false;
      }
    }
    const old_actions = dom.querySelector(".md-table-actions");
    if (this.active && !this.read_only) {
      const actions = this.create_actions(view);
      if (old_actions) old_actions.replaceWith(actions);
      else dom.append(actions);
    } else {
      old_actions?.remove();
    }
    return true;
  }

  destroy(dom: HTMLElement) {
    table_viewports.get(dom)?.destroy();
    table_viewports.delete(dom);
  }

  ignoreEvent(_event: Event) {
    return true;
  }

  private field_value(view: EditorView) {
    return view.state.field(this.field);
  }

  private is_virtualized() {
    return this.table.rows.length > virtualize_after_rows;
  }

  private selected_table_row() {
    const match = this.find.matches[this.find.selected_index];
    if (!match) return null;
    const row = this.table.rows.findIndex(
      (candidate, index) =>
        index > 0 && candidate.from <= match.from && match.from < candidate.to,
    );
    return row < 1 ? null : row;
  }

  private set_column_widths(table_element: HTMLTableElement) {
    const columns = this.table.rows[0]?.cells.length ?? 0;
    const widths = Array.from({ length: columns }, (_unused, col) => {
      let width = 8;
      for (const row of this.table.rows)
        width = Math.max(width, Math.min(36, row.cells[col]?.text.length ?? 0));
      return width;
    });
    const total = widths.reduce((sum, width) => sum + width, 0);
    const horizontal_padding =
      "var(--editor-spacing, 1.5rem) * var(--editor-table-cell-padding, 0.65) * 1.3";
    // Mounted rows change during scrolling. Allocate widths from the whole
    // table once, and scroll horizontally instead of crushing narrow cells.
    table_element.style.minWidth = `calc(${String(total)}ch + ${String(columns)} * 2 * ${horizontal_padding})`;
    const group = document.createElement("colgroup");
    for (const width of widths) {
      const column = document.createElement("col");
      column.style.width = `calc(${String(width)}ch + 2 * ${horizontal_padding})`;
      group.append(column);
    }
    table_element.append(group);
  }

  private create_row(
    row_index: number,
    view: EditorView,
    wrapper: HTMLElement,
  ) {
    const row = this.table.rows[row_index];
    if (!row) throw new Error(`Missing table row ${String(row_index)}`);
    const row_element = document.createElement("tr");
    row_element.dataset.row = String(row_index);
    row_element.setAttribute("aria-rowindex", String(row_index + 1));
    row.cells.forEach((cell, col_index) => {
      const is_header = row_index === 0;
      const cell_element = document.createElement(is_header ? "th" : "td");
      if (is_header) cell_element.scope = "col";
      cell_element.dataset.row = String(row_index);
      cell_element.dataset.col = String(col_index);
      cell_element.dataset.from = String(cell.from);
      cell_element.dataset.to = String(cell.to);
      cell_element.setAttribute(
        "aria-label",
        `Row ${String(row_index + 1)}, column ${String(col_index + 1)}`,
      );
      cell_element.style.border =
        "1px solid var(--editor-table-border, var(--border, #d4d4d4))";
      cell_element.style.padding =
        "calc(var(--editor-spacing, 1.5rem) * var(--editor-table-cell-padding, 0.65)) calc(var(--editor-spacing, 1.5rem) * calc(var(--editor-table-cell-padding, 0.65) * 1.3))";
      cell_element.style.textAlign = this.table.alignments[col_index] || "left";
      this.render_cell(cell_element, cell, row_index, col_index, view);
      this.set_cell_editable(cell_element, row_index, col_index, view);
      cell_element.addEventListener("mousedown", (event) => {
        if (view.state.readOnly) return;
        if ((event.target as HTMLElement).closest("[data-table-link-target]"))
          return;
        const current_row = Number(cell_element.dataset.row);
        const current_col = Number(cell_element.dataset.col);
        const current_table_from = Number(wrapper.dataset.tableFrom);
        const current_active = view.state.field(this.field).active;
        if (
          current_active?.table_from === current_table_from &&
          current_active.row === current_row &&
          current_active.col === current_col
        )
          return;

        event.preventDefault();
        const current_cell = view.state
          .field(this.field)
          .tables.find((table) => table.from === current_table_from)?.rows[
          current_row
        ]?.cells[current_col];
        view.dispatch({
          effects: active_cell_effect.of({
            table_from: current_table_from,
            row: current_row,
            col: current_col,
            leading_padding: current_cell?.leading_padding ?? 0,
            trailing_padding: current_cell?.trailing_padding ?? 0,
          }),
        });
        const active_element = find_cell_element(
          view,
          current_table_from,
          current_row,
          current_col,
        );
        if (active_element) {
          focus_cell_at_point(active_element, event.clientX, event.clientY);
          sync_cell_selection(view, this.field, active_element);
        }
      });
      cell_element.addEventListener("mouseup", () => {
        requestAnimationFrame(() => {
          if (
            view.dom.isConnected &&
            cell_element.isConnected &&
            document.activeElement === cell_element &&
            !view.state.readOnly
          )
            sync_cell_selection(view, this.field, cell_element);
        });
      });
      cell_element.addEventListener("input", () => {
        update_cell_source(view, this.field, cell_element);
      });
      cell_element.addEventListener("compositionstart", () => {
        cell_element.dataset.composing = "true";
      });
      cell_element.addEventListener("compositionend", () => {
        delete cell_element.dataset.composing;
        update_cell_source(view, this.field, cell_element);
      });
      cell_element.addEventListener("paste", (event) => {
        if (view.state.readOnly) return;
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return;
        event.preventDefault();
        insert_plain_text(cell_element, text.replace(/[\r\n]+/g, " "));
        update_cell_source(view, this.field, cell_element);
      });
      cell_element.addEventListener("keydown", (event) => {
        const link = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-table-link-target]",
        );
        if (link && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this.open_link?.(link.dataset.tableLinkTarget ?? "");
          return;
        }
        handle_cell_keydown(
          view,
          this.field,
          this.undo_command,
          this.redo_command,
          event,
          Number(cell_element.dataset.row),
          Number(cell_element.dataset.col),
        );
        if (!event.defaultPrevented && !event.isComposing)
          requestAnimationFrame(() => {
            if (
              view.dom.isConnected &&
              cell_element.isConnected &&
              document.activeElement === cell_element
            )
              sync_cell_selection(view, this.field, cell_element);
          });
      });
      row_element.append(cell_element);
    });
    return row_element;
  }

  private update_row(
    row_element: HTMLTableRowElement,
    row_index: number,
    view: EditorView,
  ) {
    const row = this.table.rows[row_index];
    if (!row || row_element.children.length !== row.cells.length) return false;
    row_element.dataset.row = String(row_index);
    for (let col = 0; col < row.cells.length; col++) {
      const cell = row.cells[col];
      const element = row_element.children[col];
      if (!cell || !(element instanceof HTMLElement)) return false;
      element.dataset.from = String(cell.from);
      element.dataset.to = String(cell.to);
      element.dataset.row = String(row_index);
      element.dataset.col = String(col);
      element.setAttribute(
        "aria-label",
        `Row ${String(row_index + 1)}, column ${String(col + 1)}`,
      );
      element.style.textAlign = this.table.alignments[col] || "left";
      const active =
        this.active?.table_from === this.table.from &&
        this.active.row === row_index &&
        this.active.col === col;
      const selection = active ? capture_dom_selection(element) : null;
      this.set_cell_editable(element, row_index, col, view);
      if (
        active &&
        (this.field_value(view).preserve_active_text ||
          element.dataset.composing === "true")
      ) {
        if (selection) restore_dom_selection(element, selection);
        continue;
      }
      this.render_cell(element, cell, row_index, col, view);
      if (selection && active) restore_dom_selection(element, selection);
    }
    return true;
  }

  private render_cell(
    element: HTMLElement,
    cell: CellRange,
    row: number,
    col: number,
    view: EditorView,
  ) {
    const active =
      this.active?.table_from === this.table.from &&
      this.active.row === row &&
      this.active.col === col;
    if (active) {
      while (element.firstChild) element.removeChild(element.firstChild);
      append_source_text(element, view.state, cell.from, cell.to, this.find);
      return;
    }
    while (element.firstChild) element.removeChild(element.firstChild);
    if (cell.node)
      render_inline_node(
        element,
        cell.node,
        cell.from,
        cell.to,
        view,
        this.reference_targets,
        this.find,
        this.open_link,
      );
    else
      append_source_text(
        element,
        view.state,
        cell.from,
        cell.to,
        this.find,
        undefined,
        true,
      );
  }

  private set_cell_editable(
    element: HTMLElement,
    row: number,
    col: number,
    view: EditorView,
  ) {
    const active =
      this.active?.table_from === this.table.from &&
      this.active.row === row &&
      this.active.col === col;
    if (!view.state.readOnly && active) {
      element.setAttribute("contenteditable", "plaintext-only");
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-multiline", "false");
    } else {
      element.removeAttribute("contenteditable");
      element.removeAttribute("aria-multiline");
      element.setAttribute("role", row === 0 ? "columnheader" : "gridcell");
    }
  }
}

class TableViewport {
  private row_heights: number[];
  private row_offsets: number[];
  private readonly rows = new Map<number, HTMLTableRowElement>();
  private readonly spacer_rows: HTMLTableRowElement[] = [];
  private spacer_count = 0;
  private readonly resize_observer: ResizeObserver | null;
  private active_row: number | null;
  private selected_row: number | null;
  private render_row: (row: number) => HTMLTableRowElement;
  private update_row: (element: HTMLTableRowElement, row: number) => boolean;
  private frame: number | null = null;
  private destroyed = false;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly body: HTMLTableSectionElement,
    private row_count: number,
    active_row: number | null,
    selected_row: number | null,
    render_row: (row: number) => HTMLTableRowElement,
    update_row: (element: HTMLTableRowElement, row: number) => boolean,
  ) {
    this.row_heights = Array.from(
      { length: row_count },
      () => table_row_height_estimate,
    );
    this.row_offsets = [];
    this.active_row = active_row;
    this.selected_row = selected_row;
    this.render_row = render_row;
    this.update_row = update_row;
    this.rebuild_offsets();
    this.resize_observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            this.measure_rows(entries);
          });
    this.viewport.addEventListener("scroll", this.on_scroll, { passive: true });
  }

  mount() {
    const header = this.viewport.parentElement?.querySelector("thead tr");
    if (header) this.resize_observer?.observe(header);
    this.render_window();
    if (this.selected_row !== null) this.ensure_row(this.selected_row);
  }

  update(
    row_count: number,
    active_row: number | null,
    selected_row: number | null,
    render_row: (row: number) => HTMLTableRowElement,
    update_row: (element: HTMLTableRowElement, row: number) => boolean,
  ) {
    if (row_count !== this.row_count) {
      this.row_heights = Array.from(
        { length: row_count },
        () => table_row_height_estimate,
      );
      this.row_count = row_count;
      this.rebuild_offsets();
    }
    this.active_row = active_row;
    this.render_row = render_row;
    this.update_row = update_row;
    const selected_changed = selected_row !== this.selected_row;
    this.selected_row = selected_row;
    this.render_window(true);
    if (selected_changed && selected_row !== null)
      this.ensure_row(selected_row);
  }

  ensure_row(row: number) {
    if (row < 1 || row >= this.row_count) return null;
    this.rebuild_offsets();
    const viewport_top = this.viewport.scrollTop;
    const viewport_height = this.viewport.clientHeight || table_viewport_height;
    const row_top = this.row_offsets[row] ?? 0;
    const row_bottom = this.row_offsets[row + 1] ?? row_top;
    if (row_top < viewport_top || row_bottom > viewport_top + viewport_height) {
      this.viewport.scrollTop = Math.max(
        0,
        row_top - table_row_height_estimate,
      );
    }
    this.render_window();
    return this.rows.get(row) ?? null;
  }

  destroy() {
    this.destroyed = true;
    this.viewport.removeEventListener("scroll", this.on_scroll);
    this.resize_observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.rows.clear();
  }

  private on_scroll = () => {
    this.render_window();
  };

  private measure_rows(entries: readonly ResizeObserverEntry[]) {
    let changed = false;
    const header_height = this.row_heights[0] ?? table_row_height_estimate;
    const anchor_row = this.row_at_offset(
      this.viewport.scrollTop + header_height,
    );
    const anchor_offset = this.row_offsets[anchor_row] ?? 0;
    for (const entry of entries) {
      const row = Number((entry.target as HTMLElement).dataset.row);
      const height = entry.contentRect.height;
      if (row < 0 || row >= this.row_count || height <= 0) continue;
      if (Math.abs((this.row_heights[row] ?? 0) - height) < 0.5) continue;
      this.row_heights[row] = height;
      changed = true;
    }
    if (!changed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.destroyed) return;
      this.rebuild_offsets();
      this.viewport.scrollTop +=
        (this.row_offsets[anchor_row] ?? 0) - anchor_offset;
      this.render_window();
    });
  }

  private rebuild_offsets() {
    this.row_offsets = new Array<number>(this.row_count + 1);
    this.row_offsets[0] = 0;
    for (let row = 0; row < this.row_count; row++)
      this.row_offsets[row + 1] =
        (this.row_offsets[row] ?? 0) +
        (this.row_heights[row] ?? table_row_height_estimate);
  }

  private row_at_offset(offset: number) {
    let low = 1;
    let high = this.row_count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.row_offsets[middle] ?? 0) < offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, this.row_count - 1);
  }

  private render_window(update_existing_rows = false) {
    if (this.destroyed) return;
    const viewport_height = this.viewport.clientHeight || table_viewport_height;
    const header_height = this.row_heights[0] ?? table_row_height_estimate;
    const first_visible = this.row_at_offset(
      this.viewport.scrollTop + header_height,
    );
    const last_visible = this.row_at_offset(
      this.viewport.scrollTop + viewport_height,
    );
    const start = Math.max(1, first_visible - table_row_overscan);
    const end = Math.min(
      this.row_count,
      Math.max(start + 1, last_visible + table_row_overscan + 1),
    );
    const visible = new Set<number>();
    for (let row = start; row < end; row++) visible.add(row);
    if (
      this.active_row !== null &&
      this.active_row > 0 &&
      this.active_row < this.row_count
    )
      visible.add(this.active_row);
    if (
      this.selected_row !== null &&
      this.selected_row > 0 &&
      this.selected_row < this.row_count
    )
      visible.add(this.selected_row);

    const row_indexes = [...visible].sort((left, right) => left - right);
    const desired: Node[] = [];
    this.spacer_count = 0;
    let next_row = 1;
    for (const row of row_indexes) {
      if (row > next_row) desired.push(this.create_spacer(next_row, row));
      let element = this.rows.get(row);
      if (
        !element ||
        (update_existing_rows && !this.update_row(element, row))
      ) {
        if (element) this.resize_observer?.unobserve(element);
        element = this.render_row(row);
        this.rows.set(row, element);
      }
      desired.push(element);
      next_row = row + 1;
    }
    if (next_row < this.row_count)
      desired.push(this.create_spacer(next_row, this.row_count));
    this.spacer_rows.length = this.spacer_count;

    const retained = new Set(row_indexes);
    for (const [row, element] of this.rows) {
      if (retained.has(row)) continue;
      this.resize_observer?.unobserve(element);
      this.rows.delete(row);
    }
    const desired_set = new Set(desired);
    for (let current = this.body.firstChild; current; ) {
      const next = current.nextSibling;
      if (!desired_set.has(current)) this.body.removeChild(current);
      current = next;
    }
    let current = this.body.firstChild;
    for (const element of desired) {
      if (current === element) current = current.nextSibling;
      else this.body.insertBefore(element, current);
    }
    for (const [row, element] of this.rows) {
      if (retained.has(row)) this.resize_observer?.observe(element);
    }
  }

  private create_spacer(from: number, to: number) {
    const index = this.spacer_count++;
    let row = this.spacer_rows[index];
    if (!row) {
      row = document.createElement("tr");
      row.setAttribute("aria-hidden", "true");
      row.dataset.spacer = "true";
      const cell = document.createElement("td");
      cell.colSpan =
        this.body.parentElement?.querySelectorAll("col").length || 1;
      cell.style.padding = "0";
      cell.style.border = "0";
      cell.setAttribute("aria-hidden", "true");
      row.append(cell);
      this.spacer_rows[index] = row;
    }
    row.style.height = `${String((this.row_offsets[to] ?? 0) - (this.row_offsets[from] ?? 0))}px`;
    const cell = row.firstElementChild;
    if (cell instanceof HTMLElement) cell.style.height = row.style.height;
    return row;
  }
}

function update_cell_source(
  view: EditorView,
  field: StateField<TableFieldValue>,
  element: HTMLElement,
) {
  if (view.state.readOnly) return;
  const state = view.state.field(field);
  const table_from = Number(
    element.closest<HTMLElement>("[data-table-from]")?.dataset.tableFrom,
  );
  const row = Number(element.dataset.row);
  const col = Number(element.dataset.col);
  const table = state.tables.find((candidate) => candidate.from === table_from);
  const cell = table?.rows[row]?.cells[col];
  if (
    !cell ||
    state.active?.table_from !== table_from ||
    state.active.row !== row ||
    state.active.col !== col
  )
    return;
  const typed_text = (element.textContent ?? "").replace(/[\r\n]+/g, " ");
  const selection = capture_dom_selection(element);
  const source_text = escape_cell_pipes(typed_text);
  if (
    !cell.virtual &&
    view.state.sliceDoc(cell.from, cell.to) === source_text
  ) {
    const anchor =
      cell.from +
      (selection === null
        ? source_text.length
        : escape_cell_pipes(typed_text.slice(0, selection.anchor)).length);
    const head =
      cell.from +
      (selection === null
        ? source_text.length
        : escape_cell_pipes(typed_text.slice(0, selection.head)).length);
    if (
      view.state.selection.main.anchor !== anchor ||
      view.state.selection.main.head !== head
    )
      view.dispatch({ selection: { anchor, head } });
    return;
  }
  if (cell.virtual && source_text === "") return;
  const change = cell.virtual
    ? virtual_cell_change(table?.rows[row], col, source_text)
    : {
        from: cell.source_from + state.active.leading_padding,
        to: cell.source_to - state.active.trailing_padding,
        insert: source_text,
      };
  if (!change) return;
  const inserted_prefix = cell.virtual
    ? change.insert.length - source_text.length
    : 0;
  const selection_head_offset =
    inserted_prefix +
    (selection === null
      ? source_text.length
      : escape_cell_pipes(typed_text.slice(0, selection.head)).length);
  const selection_anchor_offset =
    inserted_prefix +
    (selection === null
      ? source_text.length
      : escape_cell_pipes(typed_text.slice(0, selection.anchor)).length);
  view.dispatch({
    changes: change,
    selection: {
      anchor: change.from + selection_anchor_offset,
      head: change.from + selection_head_offset,
    },
    annotations: Transaction.userEvent.of("input.type.table-cell"),
  });
}

function handle_cell_keydown(
  view: EditorView,
  field: StateField<TableFieldValue>,
  undo_command: StateCommand,
  redo_command: StateCommand,
  event: KeyboardEvent,
  row: number,
  col: number,
) {
  if (event.isComposing) return;
  const cell_element = event.currentTarget as HTMLElement;
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "a"
  ) {
    event.preventDefault();
    select_cell_contents(cell_element);
    sync_cell_selection(view, field, cell_element);
    return;
  }
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    const command =
      key === "b"
        ? toggle_bold
        : key === "i"
          ? toggle_italic
          : key === "e"
            ? toggle_inline_code
            : key === "x" && (event.shiftKey || event.altKey)
              ? toggle_strikethrough
              : null;
    if (command) {
      event.preventDefault();
      sync_cell_selection(view, field, event.currentTarget as HTMLElement);
      command({
        state: view.state,
        dispatch: (transaction: Transaction) => {
          view.dispatch(transaction);
        },
      });
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    sync_cell_selection(view, field, cell_element);
    const target = {
      state: view.state,
      dispatch: (transaction: Transaction) => {
        view.dispatch(transaction);
      },
    };
    const changed = event.shiftKey
      ? redo_command(target)
      : undo_command(target);
    if (changed) focus_active_cell_from_state(view, field);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    leave_table(view);
    return;
  }
  const state = view.state.field(field);
  const active = state.active;
  if (!active || active.row !== row || active.col !== col) return;
  const table = state.tables.find(
    (candidate) => candidate.from === active.table_from,
  );
  if (!table) return;
  if (navigate_cell_on_arrow(view, field, table, row, col, event)) return;
  const direction = table_exit_direction(event, view, table, row, col);
  if (direction) {
    const code = adjacent_code_block(view, table, direction);
    if (code) {
      event.preventDefault();
      view.dispatch({
        selection: {
          anchor: direction > 0 ? code.content_from : code.content_to,
        },
        effects: active_cell_effect.of(null),
        scrollIntoView: true,
      });
      focus_code_selection(view);
      return;
    }
    const position = adjacent_text_position(view, table, direction);
    if (position !== null) {
      event.preventDefault();
      view.dispatch({
        selection: { anchor: position },
        effects: active_cell_effect.of(null),
        scrollIntoView: true,
      });
      view.focus();
      return;
    }
    // A table at the document boundary has no neighboring caret stop.
    event.preventDefault();
    return;
  }
  if (
    (event.key !== "Tab" && event.key !== "Enter") ||
    event.altKey ||
    event.metaKey ||
    event.ctrlKey
  )
    return;
  const next =
    event.key === "Tab"
      ? adjacent_cell(table, row, col, event.shiftKey ? -1 : 1)
      : adjacent_row(table, row, col, event.shiftKey ? -1 : 1);
  if (next) {
    event.preventDefault();
    activate_cell(view, field, table, next.row, next.col);
    return;
  }
  if (
    (event.key === "Tab" && !event.shiftKey) ||
    (event.key === "Enter" && !event.shiftKey)
  ) {
    event.preventDefault();
    append_table_row(view, field, table, event.key === "Enter" ? col : 0);
  } else if (event.key === "Tab" && event.shiftKey) {
    event.preventDefault();
    leave_table(view);
  } else if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    leave_table(view);
  }
}

function enter_table_from_outer_selection(
  view: EditorView,
  field: StateField<TableFieldValue>,
  event: KeyboardEvent,
) {
  if (
    (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
    event.shiftKey ||
    event.altKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.isComposing ||
    view.state.readOnly ||
    (event.target instanceof Element &&
      event.target.closest(".md-table-widget"))
  )
    return false;

  const state = view.state;
  const selection = state.selection.main;
  if (!selection.empty || state.selection.ranges.length !== 1) return false;
  const value = state.field(field);
  const line = state.doc.lineAt(selection.head);
  const moving_down = event.key === "ArrowDown";
  const table = adjacent_table(
    state,
    value.tables,
    selection.head,
    moving_down,
  );
  if (!table) return false;
  if (view.lineWrapping) {
    const next = view.moveVertically(selection, moving_down);
    if (
      next.head !== selection.head &&
      state.doc.lineAt(next.head).number === line.number
    )
      return false;
  }
  const row = moving_down ? 0 : table.rows.length - 1;
  const col = table_column_at_cursor_x(view, table, row, selection.head);
  const cell = table.rows[row]?.cells[col];
  if (!cell) return false;
  if (!find_cell_element(view, table.from, row, col)) return false;

  event.preventDefault();
  view.dispatch({
    selection: { anchor: moving_down ? cell.from : cell.to },
    effects: active_cell_effect.of({
      table_from: table.from,
      row,
      col,
      leading_padding: cell.leading_padding,
      trailing_padding: cell.trailing_padding,
    }),
  });
  const active_element = find_cell_element(view, table.from, row, col);
  if (active_element) focus_cell_at(active_element, !moving_down);
  return true;
}

function adjacent_table(
  state: EditorView["state"],
  tables: TableModel[],
  position: number,
  moving_down: boolean,
) {
  const candidates = moving_down ? tables : [...tables].reverse();
  for (const table of candidates) {
    if (moving_down ? table.from < position : table.to > position) continue;
    const edge = state.doc.lineAt(moving_down ? table.from : table.to);
    // Keep every blank source row as a caret stop, just like code blocks.
    if (Math.abs(edge.number - state.doc.lineAt(position).number) === 1)
      return table;
    return null;
  }
  return null;
}

function table_column_at_cursor_x(
  view: EditorView,
  table: TableModel,
  row: number,
  position: number,
) {
  const cells = table.rows[row]?.cells ?? [];
  if (cells.length < 2) return 0;
  const wrapper = find_table_element(view, table.from);
  const header_cells = wrapper?.querySelectorAll<HTMLElement>(
    '[data-row="0"][data-col]',
  );
  if (!header_cells?.length) return 0;
  let x: number | undefined;
  try {
    x = view.coordsAtPos(position)?.left;
  } catch {
    // JSDOM and hidden editors may not expose text-range geometry.
    return 0;
  }
  if (x === undefined) return 0;
  let closest_col = 0;
  let closest_distance = Number.POSITIVE_INFINITY;
  header_cells.forEach((element, index) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0) return;
    const distance = Math.abs(x - (bounds.left + bounds.right) / 2);
    if (distance < closest_distance) {
      closest_col = index;
      closest_distance = distance;
    }
  });
  return closest_col;
}

function table_exit_direction(
  event: KeyboardEvent,
  view: EditorView,
  table: TableModel,
  row: number,
  col: number,
): -1 | 1 | null {
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey)
    return null;
  const cell = table.rows[row]?.cells[col];
  if (!cell) return null;
  const selection = capture_dom_selection(event.currentTarget as HTMLElement);
  if (!selection || selection.anchor !== selection.head) return null;
  const text_length =
    (event.currentTarget as HTMLElement).textContent?.length ?? 0;
  if (
    (event.key === "ArrowUp" || event.key === "ArrowLeft") &&
    ((event.key === "ArrowUp" && row === 0) ||
      (event.key === "ArrowLeft" && row === 0 && col === 0)) &&
    (event.key === "ArrowUp" || selection.head === 0)
  )
    return -1;
  if (
    (event.key === "ArrowDown" || event.key === "ArrowRight") &&
    ((event.key === "ArrowDown" && row === table.rows.length - 1) ||
      (event.key === "ArrowRight" &&
        row === table.rows.length - 1 &&
        col === (table.rows[row]?.cells.length ?? 0) - 1)) &&
    (event.key === "ArrowDown" || selection.head >= text_length)
  )
    return 1;
  return null;
}

function navigate_cell_on_arrow(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  row: number,
  col: number,
  event: KeyboardEvent,
) {
  if (
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
    event.shiftKey ||
    event.altKey ||
    event.metaKey ||
    event.ctrlKey
  )
    return false;
  const element = event.currentTarget as HTMLElement;
  const selection = capture_dom_selection(element);
  if (!selection || selection.anchor !== selection.head) return false;
  if (
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    move_within_cell_line(element, event.key === "ArrowDown")
  ) {
    event.preventDefault();
    sync_cell_selection(view, field, element);
    return true;
  }
  const at_start = selection.head === 0;
  const at_end = selection.head >= (element.textContent?.length ?? 0);
  let next: { row: number; col: number } | null = null;
  let at_end_of_next = false;
  if (event.key === "ArrowUp" && row > 0) {
    next = { row: row - 1, col };
    at_end_of_next = true;
  } else if (event.key === "ArrowDown" && row < table.rows.length - 1) {
    next = { row: row + 1, col };
  } else if (event.key === "ArrowLeft" && at_start) {
    next = adjacent_cell(table, row, col, -1);
    at_end_of_next = true;
  } else if (event.key === "ArrowRight" && at_end) {
    next = adjacent_cell(table, row, col, 1);
  }
  if (!next) return false;
  const activated = activate_arrow_neighbor(
    view,
    table,
    next.row,
    next.col,
    at_end_of_next,
  );
  if (activated) event.preventDefault();
  return activated;
}

function activate_arrow_neighbor(
  view: EditorView,
  table: TableModel,
  next_row: number,
  next_col: number,
  at_end: boolean,
) {
  const cell = table.rows[next_row]?.cells[next_col];
  if (!cell || !find_cell_element(view, table.from, next_row, next_col))
    return false;
  view.dispatch({
    selection: { anchor: at_end ? cell.to : cell.from },
    effects: active_cell_effect.of({
      table_from: table.from,
      row: next_row,
      col: next_col,
      leading_padding: cell.leading_padding,
      trailing_padding: cell.trailing_padding,
    }),
  });
  const active_element = find_cell_element(
    view,
    table.from,
    next_row,
    next_col,
  );
  if (active_element) focus_cell_at(active_element, at_end);
  return true;
}

function move_within_cell_line(
  element: HTMLElement,
  forward: boolean,
): boolean {
  const selection = element.ownerDocument.getSelection();
  if (!selection?.rangeCount || typeof selection.modify !== "function")
    return false;
  const before = selection.getRangeAt(0).cloneRange();
  const before_rect = before.getBoundingClientRect();
  // Let the browser preserve its soft-wrap affinity. Rebuilding a caret Range
  // from a text offset loses which visual row the caret belongs to.
  selection.modify("move", forward ? "forward" : "backward", "line");
  const after = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (
    after &&
    element.contains(after.startContainer) &&
    Math.abs(after.getBoundingClientRect().top - before_rect.top) > 1
  )
    return true;
  selection.removeAllRanges();
  selection.addRange(before);
  return false;
}

function adjacent_code_block(
  view: EditorView,
  table: TableModel,
  direction: -1 | 1,
) {
  const node = direction < 0 ? table.node.prevSibling : table.node.nextSibling;
  if (node?.name !== "FencedCode") return null;
  const edge = view.state.doc.lineAt(direction < 0 ? table.from : table.to);
  const code_edge = view.state.doc.lineAt(direction < 0 ? node.to : node.from);
  if (Math.abs(edge.number - code_edge.number) !== 1) return null;
  return read_code_block(view.state, node.from, node.to);
}

function adjacent_text_position(
  view: EditorView,
  table: TableModel,
  direction: -1 | 1,
) {
  const state = view.state;
  const edge = state.doc.lineAt(direction < 0 ? table.from : table.to);
  const line_number = edge.number + direction;
  if (line_number < 1 || line_number > state.doc.lines) return null;
  const line = state.doc.line(line_number);
  if (line.text.trim() === "") return direction < 0 ? line.to : line.from;
  const node = direction < 0 ? table.node.prevSibling : table.node.nextSibling;
  if (!node) return null;
  const gap =
    direction < 0
      ? state.sliceDoc(node.to, table.from)
      : state.sliceDoc(table.to, node.from);
  if (
    !/^\s*$/.test(gap) ||
    !/^(?:Paragraph|ATXHeading|SetextHeading|Blockquote|List|BulletList|OrderedList)$/.test(
      node.name,
    )
  )
    return null;
  return direction < 0
    ? state.doc.lineAt(node.to).to
    : state.doc.lineAt(node.from).from;
}

function sync_cell_selection(
  view: EditorView,
  field: StateField<TableFieldValue>,
  element: HTMLElement,
) {
  if (view.state.readOnly) return;
  const selection = capture_dom_selection(element);
  if (selection === null) return;
  const state = view.state.field(field);
  const table_from = Number(
    element.closest<HTMLElement>("[data-table-from]")?.dataset.tableFrom,
  );
  const row = Number(element.dataset.row);
  const col = Number(element.dataset.col);
  const cell = state.tables.find((table) => table.from === table_from)?.rows[
    row
  ]?.cells[col];
  if (!cell || cell.virtual) return;
  const typed_text = (element.textContent ?? "").replace(/[\r\n]+/g, " ");
  const anchor =
    cell.from + escape_cell_pipes(typed_text.slice(0, selection.anchor)).length;
  const head =
    cell.from + escape_cell_pipes(typed_text.slice(0, selection.head)).length;
  if (
    view.state.selection.main.anchor === anchor &&
    view.state.selection.main.head === head
  )
    return;
  view.dispatch({ selection: { anchor, head } });
}

function adjacent_cell(
  table: TableModel,
  row: number,
  col: number,
  direction: -1 | 1,
) {
  const column_count = table.rows[row]?.cells.length ?? 0;
  if (column_count === 0) return null;
  if (direction > 0) {
    if (col + 1 < column_count) return { row, col: col + 1 };
    return table.rows[row + 1] ? { row: row + 1, col: 0 } : null;
  }
  if (col > 0) return { row, col: col - 1 };
  const previous = table.rows[row - 1];
  return previous ? { row: row - 1, col: previous.cells.length - 1 } : null;
}

function adjacent_row(
  table: TableModel,
  row: number,
  col: number,
  direction: -1 | 1,
) {
  const next_row = table.rows[row + direction];
  if (!next_row) return null;
  return {
    row: row + direction,
    col: Math.min(col, next_row.cells.length - 1),
  };
}

function activate_cell(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  row: number,
  col: number,
) {
  view.dispatch({
    effects: active_cell_effect.of({
      table_from: table.from,
      row,
      col,
      leading_padding: table.rows[row]?.cells[col]?.leading_padding ?? 0,
      trailing_padding: table.rows[row]?.cells[col]?.trailing_padding ?? 0,
    }),
  });
  focus_cell(find_cell_element(view, table.from, row, col));
}

function append_table_row(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  col: number,
) {
  const template = table.rows.at(-1) ?? table.rows[0];
  if (!template) return;
  let row_source = view.state.sliceDoc(template.from, template.to);
  for (const cell of [...template.cells].sort(
    (left, right) => right.from - left.from,
  )) {
    const start = cell.from - template.from;
    const end = cell.to - template.from;
    row_source = row_source.slice(0, start) + row_source.slice(end);
  }
  const next_row = table.rows.length;
  view.dispatch({
    changes: { from: table.to, insert: `\n${row_source}` },
    effects: active_cell_effect.of({
      table_from: table.from,
      row: next_row,
      col,
      leading_padding: template.cells[col]?.leading_padding ?? 0,
      trailing_padding: template.cells[col]?.trailing_padding ?? 0,
    }),
    annotations: Transaction.userEvent.of("input.table-row"),
  });
  focus_active_table_cell(view, field, table.from, next_row, col, true);
}

function delete_table_row(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  row: number,
  col: number,
) {
  if (row <= 0) return;
  const target_row = table.rows[row];
  if (!target_row) return;
  const line = view.state.doc.lineAt(target_row.from);
  const change =
    line.to < view.state.doc.length
      ? { from: line.from, to: line.to + 1, insert: "" }
      : { from: Math.max(0, line.from - 1), to: line.to, insert: "" };
  const next_row = Math.max(0, row - 1);
  const next_cell =
    table.rows[next_row]?.cells[
      Math.min(col, (table.rows[next_row]?.cells.length ?? 1) - 1)
    ];
  if (!next_cell) return;
  const next_col = Math.min(col, (table.rows[next_row]?.cells.length ?? 1) - 1);
  view.dispatch({
    changes: change,
    effects: active_cell_effect.of({
      table_from: table.from,
      row: next_row,
      col: next_col,
      leading_padding: next_cell.leading_padding,
      trailing_padding: next_cell.trailing_padding,
    }),
    annotations: Transaction.userEvent.of("input.table-row"),
  });
  focus_active_table_cell(view, field, table.from, next_row, next_col, true);
}

function insert_table_column(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  active_row: number,
  col: number,
) {
  const column_count = table.rows[0]?.cells.length ?? 0;
  if (column_count === 0) return;
  const changes = table.rows.flatMap((row) => {
    const line = view.state.sliceDoc(row.from, row.to);
    return [insert_column_change(row.from, line, col + 1, "  ")];
  });
  const delimiter_line = view.state.sliceDoc(
    table.delimiter_from,
    table.delimiter_to,
  );
  changes.push(
    insert_column_change(
      table.delimiter_from,
      delimiter_line,
      col + 1,
      " --- ",
    ),
  );
  const next_col = col + 1;
  const current_cell = table.rows[active_row]?.cells[col];
  if (!current_cell) return;
  view.dispatch({
    changes: changes.sort((left, right) => left.from - right.from),
    effects: active_cell_effect.of({
      table_from: table.from,
      row: active_row,
      col: next_col,
      leading_padding: 1,
      trailing_padding: 1,
    }),
    annotations: Transaction.userEvent.of("input.table-column"),
  });
  focus_active_table_cell(view, field, table.from, active_row, next_col, false);
}

function delete_table_column(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table: TableModel,
  active_row: number,
  col: number,
) {
  const column_count = table.rows[0]?.cells.length ?? 0;
  if (column_count <= 1 || col < 0 || col >= column_count) return;
  const changes = table.rows.flatMap((row) => {
    const line = view.state.sliceDoc(row.from, row.to);
    const change = delete_column_change(row.from, line, col);
    return change ? [change] : [];
  });
  const delimiter_line = view.state.sliceDoc(
    table.delimiter_from,
    table.delimiter_to,
  );
  const delimiter_change = delete_column_change(
    table.delimiter_from,
    delimiter_line,
    col,
  );
  if (delimiter_change) changes.push(delimiter_change);
  const next_col = Math.min(col, column_count - 2);
  const next_cell = table.rows[active_row]?.cells[next_col];
  if (!next_cell) return;
  view.dispatch({
    changes: changes.sort((left, right) => left.from - right.from),
    effects: active_cell_effect.of({
      table_from: table.from,
      row: active_row,
      col: next_col,
      leading_padding: next_cell.leading_padding,
      trailing_padding: next_cell.trailing_padding,
    }),
    annotations: Transaction.userEvent.of("input.table-column"),
  });
  focus_active_table_cell(view, field, table.from, active_row, next_col, true);
}

function insert_column_change(
  line_from: number,
  line: string,
  column: number,
  new_cell: string,
) {
  const segments = table_line_segments(line);
  const leading_pipe = line.slice(0, segments[0]?.from ?? 0).includes("|");
  const next = segments[column];
  if (next) {
    if (column === 0 && leading_pipe)
      return { from: line_from + next.from, insert: `${new_cell}|` };
    if (column === 0)
      return { from: line_from + next.from, insert: `|${new_cell}|` };
    return { from: line_from + next.from, insert: `${new_cell}|` };
  }
  const trailing_pipe =
    (segments.at(-1)?.to ?? 0) < line.length &&
    line.slice(segments.at(-1)?.to ?? 0).includes("|");
  return trailing_pipe
    ? {
        from: line_from + (segments.at(-1)?.to ?? line.length),
        insert: `|${new_cell}`,
      }
    : { from: line_from + line.length, insert: ` |${new_cell}` };
}

function delete_column_change(line_from: number, line: string, column: number) {
  const segments = table_line_segments(line);
  const segment = segments[column];
  if (!segment || segments.length <= 1) return null;
  const next = segments[column + 1];
  return {
    from: line_from + segment.from,
    to: line_from + (next?.from ?? line.length),
    insert: "",
  };
}

function table_line_segments(line: string) {
  const pipes: number[] = [];
  for (let index = 0; index < line.length; index++) {
    if (line[index] !== "|") continue;
    let slashes = 0;
    for (
      let previous = index - 1;
      previous >= 0 && line[previous] === "\\";
      previous--
    )
      slashes++;
    if (slashes % 2 === 0) pipes.push(index);
  }
  const first_non_space_position = first_non_space(line);
  const last_non_space_position = last_non_space(line);
  const starts_with_pipe = pipes[0] === first_non_space_position;
  const ends_with_pipe = pipes.at(-1) === last_non_space_position;
  const segments: Array<{ from: number; to: number }> = [];
  let start = starts_with_pipe ? (pipes[0] ?? -1) + 1 : 0;
  for (const pipe of pipes) {
    if (pipe < start) continue;
    segments.push({ from: start, to: pipe });
    start = pipe + 1;
  }
  if (!ends_with_pipe) segments.push({ from: start, to: line.length });
  return segments;
}

function focus_active_table_cell(
  view: EditorView,
  field: StateField<TableFieldValue>,
  table_from: number,
  row: number,
  col: number,
  at_end: boolean,
) {
  const table = view.state
    .field(field)
    .tables.find((candidate) => candidate.from === table_from);
  if (!table?.rows[row]?.cells[col]) return;
  const element = find_cell_element(view, table.from, row, col);
  if (element) focus_cell_at(element, at_end);
}

function focus_active_cell_from_state(
  view: EditorView,
  field: StateField<TableFieldValue>,
) {
  const value = view.state.field(field);
  const active = value.active;
  if (!active) return;
  const table = value.tables.find(
    (candidate) => candidate.from === active.table_from,
  );
  const cell = table?.rows[active.row]?.cells[active.col];
  const element = find_cell_element(
    view,
    active.table_from,
    active.row,
    active.col,
  );
  if (!cell || !element?.hasAttribute("contenteditable")) return;

  element.focus({ preventScroll: true });
  const source_selection = view.state.selection.main;
  const text_length = element.textContent?.length ?? 0;
  const anchor =
    source_selection.anchor >= cell.from && source_selection.anchor <= cell.to
      ? Math.min(Math.max(source_selection.anchor - cell.from, 0), text_length)
      : 0;
  const head =
    source_selection.head >= cell.from && source_selection.head <= cell.to
      ? Math.min(Math.max(source_selection.head - cell.from, 0), text_length)
      : anchor;
  if (!restore_dom_selection(element, { anchor, head }))
    focus_cell_at(element, false);
}

function table_action_button(
  label: string,
  action: () => void,
  disabled = false,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-table-action";
  button.setAttribute("aria-label", label);
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) action();
  });
  return button;
}

function virtual_cell_change(
  row: TableRow | undefined,
  col: number,
  text: string,
): { from: number; to: number; insert: string } | null {
  if (!row) return null;
  const missing_separators = col - row.source_cell_count;
  const separators = Math.max(
    0,
    missing_separators + (row.trailing_pipe ? 0 : 1),
  );
  return {
    from: row.to,
    to: row.to,
    insert: `${"|".repeat(separators)}${text}`,
  };
}

function leave_table(view: EditorView) {
  view.dispatch({ effects: active_cell_effect.of(null) });
  view.focus();
}

function find_cell_element(
  view: EditorView,
  table_from: number,
  row: number,
  col: number,
): HTMLElement | null {
  const wrapper = find_table_element(view, table_from);
  if (!wrapper) return null;
  table_viewports.get(wrapper)?.ensure_row(row);
  return (
    wrapper?.querySelector<HTMLElement>(
      `[data-row="${String(row)}"][data-col="${String(col)}"]`,
    ) ?? null
  );
}

function find_table_element(view: EditorView, table_from: number) {
  return [...view.dom.querySelectorAll<HTMLElement>(".md-table-widget")].find(
    (element) => Number(element.dataset.tableFrom) === table_from,
  );
}

function focus_cell(element: HTMLElement | null) {
  if (!element || !element.hasAttribute("contenteditable")) return;
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function focus_cell_at(element: HTMLElement, at_end: boolean) {
  if (!element.hasAttribute("contenteditable")) return;
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!at_end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function select_cell_contents(element: HTMLElement) {
  element.focus({ preventScroll: true });
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function focus_cell_at_point(element: HTMLElement, x: number, y: number) {
  if (!element.hasAttribute("contenteditable")) return;
  element.focus();
  const document_with_caret = element.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const caret = document_with_caret.caretPositionFromPoint?.(x, y);
  const range = element.ownerDocument.createRange();
  if (caret && element.contains(caret.offsetNode)) {
    range.setStart(caret.offsetNode, caret.offset);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  range.collapse(true);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insert_plain_text(element: HTMLElement, text: string) {
  element.focus();
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    element.append(document.createTextNode(text));
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function capture_dom_selection(
  element: HTMLElement,
): { anchor: number; head: number } | null {
  const selection = window.getSelection();
  if (
    !selection?.rangeCount ||
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  )
    return null;
  return {
    anchor: selection_offset(
      element,
      selection.anchorNode,
      selection.anchorOffset,
    ),
    head: selection_offset(element, selection.focusNode, selection.focusOffset),
  };
}

function selection_offset(
  element: HTMLElement,
  node: Node | null,
  offset: number,
) {
  if (!node) return 0;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return range.toString().length;
}

function restore_dom_selection(
  element: HTMLElement,
  offsets: { anchor: number; head: number },
): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  const anchor = find_text_position(element, offsets.anchor);
  const head = find_text_position(element, offsets.head);
  if (!anchor || !head) return false;
  selection.removeAllRanges();
  selection.setBaseAndExtent(
    anchor.node,
    anchor.offset,
    head.node,
    head.offset,
  );
  return true;
}

function find_text_position(element: HTMLElement, offset: number) {
  let remaining = offset;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && remaining > (node.textContent?.length ?? 0)) {
    remaining -= node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  if (!node) return null;
  return {
    node,
    offset: Math.min(remaining, node.textContent?.length ?? 0),
  };
}

function escape_cell_pipes(value: string): string {
  let result = "";
  let backslashes = 0;
  for (const character of value) {
    if (character === "|") {
      if (backslashes % 2 === 0) result += "\\";
      result += character;
      backslashes = 0;
      continue;
    }
    result += character;
    backslashes = character === "\\" ? backslashes + 1 : 0;
  }
  return result;
}

function first_non_space(value: string): number {
  const index = value.search(/[^ \t]/);
  return index < 0 ? -1 : index;
}

function last_non_space(value: string): number {
  for (let index = value.length - 1; index >= 0; index--) {
    if (!/[ \t]/.test(value[index] ?? "")) return index;
  }
  return -1;
}

import type { SyntaxNode } from "@lezer/common";
import { Text, type ChangeSpec, type EditorState } from "@codemirror/state";
import type { SourceWindow } from "../../core/surface.js";

// One cell. [from, to) is the cell text without layout padding. Padding stays
// outside the editable range, so editing a cell never rewrites alignment.
export type TableCell = {
  from: number;
  to: number;
  source_from: number;
  source_to: number;
  node: SyntaxNode | null;
  // A short row has fewer cells than the header. Its missing cells are
  // virtual: typing into one appends separators and text to the row.
  virtual: boolean;
};

export type TableRow = {
  from: number;
  to: number;
  cells: TableCell[];
  source_cell_count: number;
  trailing_pipe: boolean;
};

export type TableModel = {
  node: SyntaxNode;
  rows: TableRow[];
  alignments: string[];
  delimiter_from: number;
  delimiter_to: number;
};

export function read_table(
  state: EditorState,
  node: SyntaxNode,
): TableModel | null {
  if (node.name !== "Table") return null;
  const rows: TableRow[] = [];
  let alignments: string[] = [];
  let delimiter_from = node.from;
  let delimiter_to = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableHeader" || child.name === "TableRow")
      rows.push(read_row(state, child));
    else if (child.name === "TableDelimiter") {
      alignments = read_alignments(state.sliceDoc(child.from, child.to));
      delimiter_from = child.from;
      delimiter_to = child.to;
    }
  }
  const header = rows[0];
  if (!header?.cells.length) return null;
  const columns = Math.max(...rows.map((row) => row.cells.length));
  for (const row of rows) {
    while (row.cells.length < columns) {
      row.cells.push({
        from: row.to,
        to: row.to,
        source_from: row.to,
        source_to: row.to,
        node: null,
        virtual: true,
      });
    }
  }
  return { node, rows, alignments, delimiter_from, delimiter_to };
}

function read_row(state: EditorState, node: SyntaxNode): TableRow {
  const parsed: SyntaxNode[] = [];
  const pipes: number[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") parsed.push(child);
    if (child.name === "TableDelimiter") pipes.push(child.from - node.from);
  }
  const line = state.sliceDoc(node.from, node.to);
  const segments = row_segments(line, pipes);
  const cells = segments.map((segment): TableCell => {
    const content = line.slice(segment.from, segment.to);
    const leading = content.search(/[^ \t]/);
    if (leading < 0) {
      // Typing into "|  |" should give "| x |", so an empty cell's caret
      // position sits after one leading space.
      const point =
        node.from + segment.from + (segment.to > segment.from ? 1 : 0);
      return {
        from: point,
        to: point,
        source_from: node.from + segment.from,
        source_to: node.from + segment.to,
        node: null,
        virtual: false,
      };
    }
    const first = segment.from + leading;
    let last = segment.to;
    while (last > first && /[ \t]/.test(line[last - 1] ?? "")) last--;
    const cell_node =
      parsed.find(
        (cell) => cell.from >= node.from + first && cell.to <= node.from + last,
      ) ?? null;
    return {
      from: node.from + first,
      to: node.from + last,
      source_from: node.from + segment.from,
      source_to: node.from + segment.to,
      node: cell_node,
      virtual: false,
    };
  });
  const last_pipe = pipes.at(-1);
  return {
    from: node.from,
    to: node.to,
    cells,
    source_cell_count: cells.length,
    trailing_pipe:
      last_pipe !== undefined && line.slice(last_pipe + 1).trim() === "",
  };
}

// Cell segments between unescaped pipes. Leading and trailing pipes are
// optional in GFM.
function row_segments(line: string, pipes?: readonly number[]) {
  const positions = pipes ? [...pipes] : unescaped_pipes(line);
  const first_text = line.search(/[^ \t]/);
  const starts_with_pipe = positions[0] === first_text;
  let last_text = line.length - 1;
  while (last_text >= 0 && /[ \t]/.test(line[last_text] ?? "")) last_text--;
  const ends_with_pipe = positions.at(-1) === last_text;
  const segments: { from: number; to: number }[] = [];
  let start = starts_with_pipe ? (positions[0] ?? -1) + 1 : 0;
  for (const pipe of positions) {
    if (pipe < start) continue;
    segments.push({ from: start, to: pipe });
    start = pipe + 1;
  }
  if (!ends_with_pipe) segments.push({ from: start, to: line.length });
  return segments;
}

function unescaped_pipes(line: string): number[] {
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
  return pipes;
}

function read_alignments(source: string): string[] {
  return source
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((part) => {
      const value = part.trim();
      if (value.startsWith(":") && value.endsWith(":")) return "center";
      if (value.endsWith(":")) return "right";
      return value.startsWith(":") ? "left" : "";
    });
}

// A cell as a source window. An escaped pipe in source shows as a plain pipe
// in the cell, and typed pipes are escaped on the way back. Newlines become
// spaces because a row is one line.
//
// Pass the padding the cell had when it became active. Then everything between
// that padding stays editable, including a space typed at the end, which a
// fresh parse would otherwise count as layout padding.
export type CellPadding = { leading: number; trailing: number };

export function cell_padding(cell: TableCell): CellPadding {
  return {
    leading: cell.from - cell.source_from,
    trailing: cell.source_to - cell.to,
  };
}

export function cell_window(
  state: EditorState,
  row: TableRow,
  column: number,
  padding: CellPadding | null = null,
): SourceWindow | null {
  const parsed = row.cells[column];
  if (!parsed) return null;
  const cell =
    padding && !parsed.virtual ? with_padding(parsed, padding) : parsed;
  const source = state.sliceDoc(cell.from, cell.to);
  // outer_at[i] is the outer position of inner position i.
  const outer_at: number[] = [];
  let shown = "";
  for (let index = 0; index < source.length; index++) {
    outer_at.push(cell.from + index);
    if (source[index] === "\\" && source[index + 1] === "|") index++;
    shown += source[index] ?? "";
  }
  outer_at.push(cell.to);
  const to_outer = (position: number) =>
    outer_at[Math.max(0, Math.min(position, outer_at.length - 1))] ?? cell.to;
  return {
    text: Text.of([shown]),
    to_outer,
    to_inner(position) {
      let inner = 0;
      while (
        inner < outer_at.length - 1 &&
        (outer_at[inner + 1] ?? cell.to) <= position
      )
        inner++;
      return inner;
    },
    contains: (position) => position >= cell.from && position <= cell.to,
    outer_changes(current, changes) {
      const specs: ChangeSpec[] = [];
      changes.iterChanges((from, to, _from_b, _to_b, inserted) => {
        const text = escape_cell_pipes(
          inserted.toString().replace(/[\r\n]+/g, " "),
        );
        if (!cell.virtual)
          specs.push({ from: to_outer(from), to: to_outer(to), insert: text });
        else if (text) specs.push(virtual_cell_insert(row, column, text));
      });
      return current.changes(specs);
    },
  };
}

function with_padding(cell: TableCell, padding: CellPadding): TableCell {
  const from = Math.min(cell.source_to, cell.source_from + padding.leading);
  const to = Math.max(from, cell.source_to - padding.trailing);
  return { ...cell, from, to };
}

function virtual_cell_insert(
  row: TableRow,
  column: number,
  text: string,
): ChangeSpec {
  const missing = column - row.source_cell_count;
  const separators = Math.max(0, missing + (row.trailing_pipe ? 0 : 1));
  return { from: row.to, insert: `${"|".repeat(separators)}${text}` };
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

// Row and column edits. Each returns changes for the table's own lines only.

export function append_row_change(
  state: EditorState,
  table: TableModel,
): ChangeSpec {
  const template = table.rows.at(-1) ?? table.rows[0];
  if (!template) return [];
  // Reuse the last row's spelling with every cell emptied, so padding and
  // pipes look like the rows around it.
  let row = state.sliceDoc(template.from, template.to);
  for (const cell of [...template.cells].sort(
    (left, right) => right.from - left.from,
  )) {
    if (cell.virtual) continue;
    row =
      row.slice(0, cell.from - template.from) +
      row.slice(cell.to - template.from);
  }
  return { from: table.node.to, insert: `\n${row}` };
}

export function delete_row_change(
  state: EditorState,
  table: TableModel,
  row: number,
): ChangeSpec | null {
  const target = table.rows[row];
  if (row <= 0 || !target) return null;
  const line = state.doc.lineAt(target.from);
  return line.to < state.doc.length
    ? { from: line.from, to: line.to + 1 }
    : { from: Math.max(0, line.from - 1), to: line.to };
}

export function insert_column_changes(
  state: EditorState,
  table: TableModel,
  column: number,
): ChangeSpec[] {
  const lines = [
    ...table.rows.map((row) => ({ from: row.from, to: row.to, cell: "  " })),
    { from: table.delimiter_from, to: table.delimiter_to, cell: " --- " },
  ];
  return lines
    .map(({ from, to, cell }) =>
      insert_column_change(from, state.sliceDoc(from, to), column, cell),
    )
    .sort((left, right) => left.from - right.from);
}

export function delete_column_changes(
  state: EditorState,
  table: TableModel,
  column: number,
): ChangeSpec[] {
  const lines = [
    ...table.rows.map((row) => ({ from: row.from, to: row.to })),
    { from: table.delimiter_from, to: table.delimiter_to },
  ];
  return lines.flatMap(({ from, to }) => {
    const change = delete_column_change(from, state.sliceDoc(from, to), column);
    return change ? [change] : [];
  });
}

function insert_column_change(
  line_from: number,
  line: string,
  column: number,
  cell: string,
) {
  const segments = row_segments(line);
  const leading_pipe = line.slice(0, segments[0]?.from ?? 0).includes("|");
  const next = segments[column];
  if (next) {
    if (column === 0 && !leading_pipe)
      return { from: line_from + next.from, insert: `|${cell}|` };
    return { from: line_from + next.from, insert: `${cell}|` };
  }
  const last_end = segments.at(-1)?.to ?? 0;
  const trailing_pipe =
    last_end < line.length && line.slice(last_end).includes("|");
  return trailing_pipe
    ? { from: line_from + last_end, insert: `|${cell}` }
    : { from: line_from + line.length, insert: ` |${cell}` };
}

function delete_column_change(line_from: number, line: string, column: number) {
  const segments = row_segments(line);
  const segment = segments[column];
  if (!segment || segments.length <= 1) return null;
  const next = segments[column + 1];
  return {
    from: line_from + segment.from,
    to: line_from + (next?.from ?? line.length),
  };
}

import type { SyntaxNode } from "@lezer/common";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
} from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import {
  BlockWidget,
  block_for_dom,
  edit_block_source,
  wrap_in_layers,
  type Block,
  type BlockController,
} from "../../core/block_field.js";
import { current_tree } from "../../core/context.js";
import { render_static } from "../../core/static_render.js";
import {
  NestedEditor,
  caret_x,
  leave_block,
  vertical_cursor,
  type SourceWindow,
} from "../../core/surface.js";
import {
  toggle_bold,
  toggle_inline_code,
  toggle_italic,
  toggle_strikethrough,
} from "../commonmark/format_commands.js";
import {
  append_row_change,
  cell_padding,
  cell_window,
  delete_column_changes,
  delete_row_change,
  insert_column_changes,
  read_table,
  type CellPadding,
  type TableModel,
} from "./table_model.js";

const virtualize_after_rows = 100;
const viewport_height = 448;
const row_height_estimate = 42;
const row_overscan = 8;

// The block field finds tables in a tree it parsed further than the state's
// stored tree. A fresh state stores only the first few thousand characters,
// so parse through this block before reading it.
export function table_model(
  state: EditorState,
  block: Block,
): TableModel | null {
  let node: SyntaxNode | null = current_tree(state, block.to).resolveInner(
    block.node_from,
    1,
  );
  while (node && !(node.name === "Table" && node.from === block.node_from))
    node = node.parent;
  return node ? read_table(state, node) : null;
}

export class TableWidget extends BlockWidget {
  protected estimate_height(): number {
    const rows = this.block.source.split("\n").length - 1;
    return rows > virtualize_after_rows
      ? viewport_height
      : rows * row_height_estimate;
  }

  protected create_controller(view: EditorView): BlockController {
    return new TableController(view, this);
  }
}

type ActiveCell = { row: number; column: number };
type CaretPlacement =
  | { position: number }
  | { inner: number }
  | { point: { x: number; y: number } }
  | { edge: "start" | "end"; goal_x?: number | null };

class TableController implements BlockController {
  readonly root = document.createElement("div");
  private readonly frame = document.createElement("div");
  private readonly table_host = document.createElement("div");
  private readonly actions = document.createElement("div");
  private viewport: TableViewport | null = null;
  private model: TableModel;
  private widget: TableWidget;
  private active: ActiveCell | null = null;
  // The active cell's layout padding, fixed when it became active. See
  // cell_window.
  private active_padding: CellPadding | null = null;
  private editor: NestedEditor | null = null;

  constructor(
    readonly view: EditorView,
    widget: TableWidget,
  ) {
    this.widget = widget;
    this.model = require_model(view.state, widget.block);
    this.root.className = "md-table-widget";
    this.frame.className = "md-table-frame";
    this.actions.className = "md-table-actions";
    this.actions.setAttribute("role", "toolbar");
    this.actions.setAttribute("aria-label", "Table actions");
    this.table_host.className = "md-table-host";
    this.frame.append(this.table_host, this.actions);
    this.root.append(wrap_in_layers(widget.block, this.frame));
    this.build_table();
    this.root.addEventListener("mousedown", this.on_mousedown);
    this.root.addEventListener("focusout", this.on_focusout);
  }

  update(widget: BlockWidget): boolean {
    if (!(widget instanceof TableWidget)) return false;
    const model = table_model(this.view.state, widget.block);
    if (!model) return false;
    const same_shape =
      model.rows.length === this.model.rows.length &&
      model.rows.every(
        (row, index) =>
          row.cells.length === this.model.rows[index]?.cells.length,
      );
    const read_only_changed = widget.read_only !== this.widget.read_only;
    this.widget = widget;
    this.model = model;
    if (same_shape && !read_only_changed) {
      this.refresh_cells();
      return true;
    }
    // Rows or columns changed. Rebuild, then mount the editor again in the
    // cell that was active, keeping focus if it had it.
    const active = this.active;
    const had_focus = this.editor?.inner.hasFocus ?? false;
    const head = this.editor?.inner.state.selection.main.head ?? 0;
    this.drop_editor();
    this.build_table();
    if (active && !widget.read_only) {
      const row = Math.min(active.row, model.rows.length - 1);
      const column = Math.min(
        active.column,
        (model.rows[row]?.cells.length ?? 1) - 1,
      );
      this.activate({ row, column }, { inner: head }, false, true);
      // Focus waits until the outer update is done. Moving focus fires focus
      // listeners, such as the link tooltip's, and a dispatch from one of
      // them inside this update throws. Activating again also remounts the
      // editor if a focusout from the rebuild dropped it meanwhile. A table
      // action that focused another cell after its change wins.
      if (had_focus)
        queueMicrotask(() => {
          const focused = this.root.ownerDocument.activeElement;
          if (!this.root.isConnected || this.widget.read_only) return;
          if (focused && this.root.contains(focused)) return;
          this.activate({ row, column }, { inner: head });
        });
    }
    return true;
  }

  destroy(): void {
    this.drop_editor();
    this.viewport?.destroy();
    this.root.removeEventListener("mousedown", this.on_mousedown);
    this.root.removeEventListener("focusout", this.on_focusout);
  }

  owns(position: number): boolean {
    return this.cell_at(position) !== null;
  }

  focus(position: number | null): boolean {
    const cell =
      position === null ? { row: 0, column: 0 } : this.cell_at(position);
    if (!cell || this.widget.read_only) return false;
    this.activate(cell, position === null ? { edge: "start" } : { position });
    return true;
  }

  sync_selection(): void {
    this.editor?.sync_selection_from_outer();
  }

  enter(side: -1 | 1, goal_x: number | null): boolean {
    if (this.widget.read_only) return false;
    const row = side > 0 ? 0 : this.model.rows.length - 1;
    const column =
      goal_x === null
        ? side > 0
          ? 0
          : this.last_column(row)
        : this.column_at_x(goal_x);
    this.activate(
      { row, column },
      { edge: side > 0 ? "start" : "end", goal_x },
    );
    return true;
  }

  refresh_highlights(): void {
    this.refresh_cells(true);
    this.editor?.refresh_highlights();
  }

  // Cell activation. The active cell hosts a nested editor; every other cell
  // is static rendered Markdown.
  // During an outer update pass in_update: the caret is placed without
  // dispatching a selection to the outer editor.
  private activate(
    cell: ActiveCell,
    placement: CaretPlacement,
    take_focus = true,
    in_update = false,
  ) {
    if (this.widget.read_only) return;
    const element = this.cell_element(cell.row, cell.column);
    if (!element) return;
    const already_active =
      this.active?.row === cell.row && this.active.column === cell.column;
    if (!already_active || !this.editor) this.mount_editor(cell, element);
    const editor = this.editor;
    if (!editor) return;
    if ("position" in placement) {
      editor.focus(placement.position);
      return;
    }
    editor.place_caret(caret_selection(editor.inner, placement), {
      focus: take_focus,
      publish: !in_update,
    });
  }

  private mount_editor(cell: ActiveCell, element: HTMLElement) {
    this.drop_editor();
    this.active = cell;
    const parsed = this.model.rows[cell.row]?.cells[cell.column];
    this.active_padding = parsed ? cell_padding(parsed) : null;
    element.replaceChildren();
    element.classList.add("md-table-cell-active");
    const window = this.window_for(this.view.state, this.model, cell);
    if (!window) return;
    this.editor = new NestedEditor({
      outer: this.view,
      parent: element,
      initial_window: window,
      read_window: () => this.current_window(),
      read_only: this.widget.read_only,
      extensions: [EditorView.lineWrapping, cell_editor_theme],
      keys: this.cell_keys(),
      on_edge: (direction, vertical) =>
        this.move_from_edge(direction, vertical),
    });
    this.render_actions();
  }

  private drop_editor() {
    if (!this.editor || !this.active) {
      this.active = null;
      return;
    }
    const { row, column } = this.active;
    this.editor.destroy();
    this.editor = null;
    this.active = null;
    const element = this.cell_element(row, column, false);
    if (element) {
      element.classList.remove("md-table-cell-active");
      this.render_cell(element, row, column);
    }
    this.render_actions();
  }

  private current_window(): SourceWindow | null {
    if (!this.active) return null;
    const block = block_for_dom(this.view, this.root);
    const model = block ? table_model(this.view.state, block) : null;
    return model ? this.window_for(this.view.state, model, this.active) : null;
  }

  private window_for(state: EditorState, model: TableModel, cell: ActiveCell) {
    const row = model.rows[cell.row];
    const padding =
      this.active?.row === cell.row && this.active.column === cell.column
        ? this.active_padding
        : null;
    return row ? cell_window(state, row, cell.column, padding) : null;
  }

  private cell_at(position: number): ActiveCell | null {
    const block = block_for_dom(this.view, this.root);
    const model = block ? table_model(this.view.state, block) : this.model;
    if (!model) return null;
    for (let row = 0; row < model.rows.length; row++) {
      const cells = model.rows[row]?.cells ?? [];
      for (let column = 0; column < cells.length; column++) {
        const cell = cells[column];
        if (
          cell &&
          !cell.virtual &&
          position >= cell.from &&
          position <= cell.to
        )
          return { row, column };
      }
    }
    return null;
  }

  // Keys inside the active cell. Tab and Enter move between cells. The
  // note's formatting shortcuts apply to the cell's text.
  private cell_keys(): KeyBinding[] {
    const outer = (command: StateCommand) => () => command(this.view);
    return [
      {
        key: "Tab",
        run: () => this.move_cell(1, false),
        shift: () => this.move_cell(-1, false),
      },
      { key: "Enter", run: () => this.move_cell(1, true) },
      { key: "Shift-Enter", run: () => this.move_cell(-1, true) },
      { key: "Escape", run: () => this.leave(1) },
      { key: "Mod-b", run: outer(toggle_bold) },
      { key: "Mod-i", run: outer(toggle_italic) },
      { key: "Mod-e", run: outer(toggle_inline_code) },
      { key: "Mod-Shift-x", run: outer(toggle_strikethrough) },
      { key: "Mod-Alt-x", run: outer(toggle_strikethrough) },
    ];
  }

  // Tab moves along the row and wraps; Enter moves down the column. Moving
  // forward past the last row appends a row.
  private move_cell(direction: -1 | 1, by_row: boolean): boolean {
    if (!this.active) return false;
    const { row, column } = this.active;
    let next: ActiveCell | null;
    if (by_row) {
      next = this.model.rows[row + direction]
        ? { row: row + direction, column }
        : null;
    } else {
      next = this.horizontal_neighbor(this.active, direction);
    }
    if (next) {
      this.activate(next, { edge: "end" });
      return true;
    }
    if (direction > 0 && !this.widget.read_only) {
      this.append_row(by_row ? column : 0);
      return true;
    }
    return this.leave(-1);
  }

  private move_from_edge(direction: -1 | 1, vertical: boolean): boolean {
    if (!this.active) return false;
    const { row, column } = this.active;
    const goal_x = vertical && this.editor ? caret_x(this.editor.inner) : null;
    if (vertical) {
      if (this.model.rows[row + direction]) {
        this.activate(
          { row: row + direction, column },
          { edge: direction > 0 ? "start" : "end", goal_x },
        );
        return true;
      }
      return this.leave(direction, goal_x);
    }
    const next = this.horizontal_neighbor(this.active, direction);
    if (next) {
      this.activate(next, { edge: direction > 0 ? "start" : "end" });
      return true;
    }
    return this.leave(direction);
  }

  // The next cell along the row, wrapping to the next or previous row.
  private horizontal_neighbor(
    { row, column }: ActiveCell,
    direction: -1 | 1,
  ): ActiveCell | null {
    if (direction > 0) {
      if (column < this.last_column(row)) return { row, column: column + 1 };
      return this.model.rows[row + 1] ? { row: row + 1, column: 0 } : null;
    }
    if (column > 0) return { row, column: column - 1 };
    return row > 0 ? { row: row - 1, column: this.last_column(row - 1) } : null;
  }

  private leave(direction: -1 | 1, goal_x: number | null = null): boolean {
    const block = block_for_dom(this.view, this.root);
    if (!block) return false;
    this.drop_editor();
    return leave_block(this.view, block, direction, goal_x);
  }

  // Structure edits change only this table's lines, then focus a surviving
  // or new cell.
  private change_structure(
    changes: ChangeSpec,
    next: ActiveCell,
    edge: "start" | "end",
  ) {
    this.view.dispatch({ changes, userEvent: "input.table" });
    const row = Math.min(next.row, this.model.rows.length - 1);
    this.activate(
      { row, column: Math.min(next.column, this.last_column(row)) },
      { edge },
    );
  }

  private append_row(column: number) {
    this.change_structure(
      append_row_change(this.view.state, this.model),
      { row: this.model.rows.length, column },
      "start",
    );
  }

  private render_actions() {
    this.actions.replaceChildren();
    const active = this.active;
    if (!active || this.widget.read_only) return;
    const columns = this.model.rows[0]?.cells.length ?? 0;
    this.actions.append(
      action_button("Add row", () => {
        this.append_row(active.column);
      }),
      action_button(
        "Delete row",
        () => {
          const change = delete_row_change(
            this.view.state,
            this.model,
            active.row,
          );
          if (change)
            this.change_structure(
              change,
              { row: active.row - 1, column: active.column },
              "end",
            );
        },
        active.row === 0,
      ),
      action_button("Add column", () => {
        this.change_structure(
          insert_column_changes(this.view.state, this.model, active.column + 1),
          { row: active.row, column: active.column + 1 },
          "start",
        );
      }),
      action_button(
        "Delete column",
        () => {
          this.change_structure(
            delete_column_changes(this.view.state, this.model, active.column),
            { row: active.row, column: Math.min(active.column, columns - 2) },
            "end",
          );
        },
        columns <= 1,
      ),
      action_button("Edit Markdown", () => {
        const block = block_for_dom(this.view, this.root);
        if (!block) return;
        this.drop_editor();
        this.view.dispatch({
          effects: edit_block_source.of(block.from),
          selection: { anchor: block.from },
        });
        this.view.focus();
      }),
    );
  }

  // Clicking a cell activates it with the caret under the pointer. The
  // default mousedown would place a native caret before the editor exists.
  private on_mousedown = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || this.widget.read_only) return;
    if (target.closest("[data-md-link-target], .md-table-actions")) return;
    const element = target.closest<HTMLElement>("[data-row][data-col]");
    if (!element || !this.root.contains(element)) return;
    const cell = {
      row: Number(element.dataset.row),
      column: Number(element.dataset.col),
    };
    if (this.active?.row === cell.row && this.active.column === cell.column)
      return;
    event.preventDefault();
    this.activate(cell, { point: { x: event.clientX, y: event.clientY } });
  };

  private on_focusout = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && this.root.contains(next)) return;
    // Wait a tick: the toolbar's mousedown moves focus before its click runs.
    queueMicrotask(() => {
      if (!this.root.contains(this.root.ownerDocument.activeElement))
        this.drop_editor();
    });
  };

  private build_table() {
    this.viewport?.destroy();
    this.viewport = null;
    const table = document.createElement("table");
    table.setAttribute("role", "grid");
    table.setAttribute("aria-rowcount", String(this.model.rows.length));
    if (this.model.rows.length <= virtualize_after_rows) {
      for (let row = 0; row < this.model.rows.length; row++)
        table.append(this.create_row(row));
      this.table_host.replaceChildren(table);
      return;
    }
    table.classList.add("md-table-virtual");
    table.append(this.column_widths());
    const head = document.createElement("thead");
    head.append(this.create_row(0));
    const body = document.createElement("tbody");
    table.append(head, body);
    const scroller = document.createElement("div");
    scroller.className = "md-table-viewport";
    scroller.style.maxHeight = `${String(viewport_height)}px`;
    scroller.append(table);
    this.table_host.replaceChildren(scroller);
    this.viewport = new TableViewport(
      scroller,
      body,
      this.model.rows.length,
      (row) => this.create_row(row),
    );
    this.viewport.mount();
  }

  // Mounted rows change while scrolling. Allocate column widths from the
  // whole table once, and scroll sideways instead of crushing narrow cells.
  private column_widths(): HTMLElement {
    const columns = this.model.rows[0]?.cells.length ?? 0;
    const group = document.createElement("colgroup");
    for (let column = 0; column < columns; column++) {
      let width = 8;
      for (const row of this.model.rows) {
        const cell = row.cells[column];
        if (cell) width = Math.max(width, Math.min(36, cell.to - cell.from));
      }
      const element = document.createElement("col");
      element.style.width = `calc(${String(width)}ch + 2 * var(--md-table-cell-padding-x))`;
      group.append(element);
    }
    return group;
  }

  private create_row(row: number): HTMLTableRowElement {
    const element = document.createElement("tr");
    element.dataset.row = String(row);
    element.setAttribute("aria-rowindex", String(row + 1));
    const cells = this.model.rows[row]?.cells ?? [];
    for (let column = 0; column < cells.length; column++) {
      const cell = document.createElement(row === 0 ? "th" : "td");
      if (row === 0) cell.scope = "col";
      cell.dataset.row = String(row);
      cell.dataset.col = String(column);
      cell.setAttribute("role", row === 0 ? "columnheader" : "gridcell");
      cell.setAttribute(
        "aria-label",
        `Row ${String(row + 1)}, column ${String(column + 1)}`,
      );
      cell.style.textAlign = this.model.alignments[column] || "left";
      this.render_cell(cell, row, column);
      element.append(cell);
    }
    return element;
  }

  private render_cell(element: HTMLElement, row: number, column: number) {
    const cell = this.model.rows[row]?.cells[column];
    element.replaceChildren();
    element.style.textAlign = this.model.alignments[column] || "left";
    element.dataset.source = cell
      ? this.view.state.sliceDoc(cell.from, cell.to)
      : "";
    if (cell)
      render_static(this.view.state, cell.node, cell.from, cell.to, element);
  }

  // Re-render inactive cells whose text changed. The active cell keeps its
  // editor; it learns about outer edits through refresh.
  private refresh_cells(force = false) {
    for (const element of this.root.querySelectorAll<HTMLElement>(
      "[data-row][data-col]",
    )) {
      const row = Number(element.dataset.row);
      const column = Number(element.dataset.col);
      if (this.active?.row === row && this.active.column === column) continue;
      const cell = this.model.rows[row]?.cells[column];
      const source = cell ? this.view.state.sliceDoc(cell.from, cell.to) : "";
      if (
        force ||
        element.dataset.source !== source ||
        element.style.textAlign !== (this.model.alignments[column] || "left")
      )
        this.render_cell(element, row, column);
    }
    const window = this.active
      ? this.window_for(this.view.state, this.model, this.active)
      : null;
    if (window) this.editor?.refresh(window);
  }

  private cell_element(
    row: number,
    column: number,
    mount = true,
  ): HTMLElement | null {
    if (mount) this.viewport?.ensure_row(row);
    return this.root.querySelector<HTMLElement>(
      `[data-row="${String(row)}"][data-col="${String(column)}"]`,
    );
  }

  private last_column(row: number): number {
    return (this.model.rows[row]?.cells.length ?? 1) - 1;
  }

  private column_at_x(x: number): number {
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;
    this.root
      .querySelectorAll<HTMLElement>('[data-row="0"][data-col]')
      .forEach((element, index) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.width === 0) return;
        const center = Math.abs(x - (bounds.left + bounds.right) / 2);
        if (center < distance) {
          closest = index;
          distance = center;
        }
      });
    return closest;
  }
}

type CaretPlacementInCell = Exclude<CaretPlacement, { position: number }>;

function caret_selection(
  inner: EditorView,
  placement: CaretPlacementInCell,
): EditorSelection {
  const end = inner.state.doc.length;
  if ("inner" in placement) return cursor_at(Math.min(placement.inner, end));
  if ("point" in placement)
    return cursor_at(inner.posAtCoords(placement.point) ?? end);
  const position = placement.edge === "start" ? 0 : end;
  return placement.goal_x == null
    ? cursor_at(position)
    : vertical_cursor(inner, position, placement.goal_x);
}

function cursor_at(position: number): EditorSelection {
  return EditorSelection.create([EditorSelection.cursor(position)]);
}

function require_model(state: EditorState, block: Block): TableModel {
  const model = table_model(state, block);
  if (!model) throw new RangeError("Table block has no table node");
  return model;
}

function action_button(
  label: string,
  action: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-table-action";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  // Keep focus in the cell editor while pressing a toolbar button.
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

const cell_editor_theme = EditorView.theme({
  "&": { display: "block", background: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
  },
  ".cm-content": { padding: "0", minHeight: "1lh", fontSize: "inherit" },
  ".cm-line": { padding: "0" },
});

// Large tables mount only the rows near the visible part of their own
// scroller. Row heights are measured as rows mount, and the scroll position
// stays anchored to the row at the top when heights change.
class TableViewport {
  private row_heights: number[];
  private row_offsets: number[] = [];
  private readonly rows = new Map<number, HTMLTableRowElement>();
  private readonly resize_observer: ResizeObserver | null;
  private frame: number | null = null;
  private destroyed = false;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly body: HTMLElement,
    private readonly row_count: number,
    private readonly render_row: (row: number) => HTMLTableRowElement,
  ) {
    this.row_heights = Array.from(
      { length: row_count },
      () => row_height_estimate,
    );
    this.rebuild_offsets();
    this.resize_observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            this.measure_rows(entries);
          });
    this.scroller.addEventListener("scroll", this.on_scroll, { passive: true });
  }

  mount() {
    const header = this.scroller.querySelector("thead tr");
    if (header) this.resize_observer?.observe(header);
    this.render_window();
  }

  // Mount a row, scrolling the table's own viewport only if it is not
  // already visible.
  ensure_row(row: number) {
    if (row < 1 || row >= this.row_count) return;
    if (!this.rows.has(row)) {
      const top = this.row_offsets[row] ?? 0;
      const bottom = this.row_offsets[row + 1] ?? top;
      const view_top = this.scroller.scrollTop;
      const view_height = this.scroller.clientHeight || viewport_height;
      if (top < view_top || bottom > view_top + view_height)
        this.scroller.scrollTop = Math.max(0, top - row_height_estimate);
      this.render_window(row);
    }
  }

  destroy() {
    this.destroyed = true;
    this.scroller.removeEventListener("scroll", this.on_scroll);
    this.resize_observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.rows.clear();
  }

  private on_scroll = () => {
    this.render_window();
  };

  private measure_rows(entries: readonly ResizeObserverEntry[]) {
    let changed = false;
    const header_height = this.row_heights[0] ?? row_height_estimate;
    const anchor_row = this.row_at(this.scroller.scrollTop + header_height);
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
      this.scroller.scrollTop +=
        (this.row_offsets[anchor_row] ?? 0) - anchor_offset;
      this.render_window();
    });
  }

  private rebuild_offsets() {
    this.row_offsets = [0];
    for (let row = 0; row < this.row_count; row++)
      this.row_offsets.push(
        (this.row_offsets[row] ?? 0) +
          (this.row_heights[row] ?? row_height_estimate),
      );
  }

  private row_at(offset: number) {
    let low = 1;
    let high = this.row_count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.row_offsets[middle] ?? 0) < offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, this.row_count - 1);
  }

  private render_window(keep_row: number | null = null) {
    if (this.destroyed) return;
    const wanted = this.wanted_rows(keep_row);
    const nodes: Node[] = [];
    this.spacer_index = 0;
    let next = 1;
    for (const row of [...wanted].sort((left, right) => left - right)) {
      if (row > next) nodes.push(this.spacer(next, row));
      let element = this.rows.get(row);
      if (!element) {
        element = this.render_row(row);
        this.rows.set(row, element);
        this.resize_observer?.observe(element);
      }
      nodes.push(element);
      next = row + 1;
    }
    if (next < this.row_count) nodes.push(this.spacer(next, this.row_count));
    for (const [row, element] of this.rows) {
      if (wanted.has(row)) continue;
      this.resize_observer?.unobserve(element);
      this.rows.delete(row);
    }
    this.reconcile_body(nodes);
  }

  // Rows near the visible part of the scroller, plus keep_row.
  private wanted_rows(keep_row: number | null): Set<number> {
    const height = this.scroller.clientHeight || viewport_height;
    const header_height = this.row_heights[0] ?? row_height_estimate;
    const first = this.row_at(this.scroller.scrollTop + header_height);
    const last = this.row_at(this.scroller.scrollTop + height);
    const start = Math.max(1, first - row_overscan);
    const end = Math.min(
      this.row_count,
      Math.max(start + 1, last + row_overscan + 1),
    );
    const wanted = new Set<number>();
    for (let row = start; row < end; row++) wanted.add(row);
    if (keep_row !== null) wanted.add(keep_row);
    // A row with a focused editor stays mounted while it scrolls away.
    for (const [row, element] of this.rows)
      if (element.contains(element.ownerDocument.activeElement))
        wanted.add(row);
    return wanted;
  }

  // Reconcile in place. Removing and re-adding a row that holds the focused
  // cell editor would blur it.
  private reconcile_body(nodes: readonly Node[]) {
    const keep = new Set(nodes);
    for (let current = this.body.firstChild; current; ) {
      const next_sibling = current.nextSibling;
      if (!keep.has(current)) this.body.removeChild(current);
      current = next_sibling;
    }
    let current = this.body.firstChild;
    for (const node of nodes) {
      if (current === node) current = current.nextSibling;
      else this.body.insertBefore(node, current);
    }
  }

  private readonly spacers: HTMLTableRowElement[] = [];
  private spacer_index = 0;

  private spacer(from: number, to: number): HTMLTableRowElement {
    const height = `${String((this.row_offsets[to] ?? 0) - (this.row_offsets[from] ?? 0))}px`;
    // Reuse spacer rows so reconciliation does not churn them.
    const existing = this.spacers[this.spacer_index];
    this.spacer_index++;
    if (existing) {
      (existing.firstElementChild as HTMLElement).style.height = height;
      return existing;
    }
    const row = document.createElement("tr");
    row.setAttribute("aria-hidden", "true");
    const cell = document.createElement("td");
    cell.colSpan = this.scroller.querySelectorAll("col").length || 1;
    cell.className = "md-table-spacer";
    cell.style.height = height;
    row.append(cell);
    this.spacers.push(row);
    return row;
  }
}

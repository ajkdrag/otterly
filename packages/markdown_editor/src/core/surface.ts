import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Facet,
  Prec,
  StateEffect,
  StateField,
  Transaction,
  countColumn,
  findColumn,
  type ChangeSet,
  type Extension,
  type SelectionRange,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  keymap,
  type DecorationSet,
  type KeyBinding,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  block_at,
  controller_for_block,
  get_blocks,
  is_block_rendered,
  reveal_surfaces_at_caret,
  surface_input,
  type Block,
} from "./block_field.js";
import { line_container } from "./context.js";
import { end_reveal_freeze } from "./reveal.js";
import { source_redo, source_undo } from "./source_state.js";

// A source window is the part of the outer document a surface edits, as one
// inner text. A code body strips container prefixes from each line. A table
// cell unescapes pipes. The window maps positions and changes both ways.
export type SourceWindow = {
  readonly text: Text;
  to_outer(position: number): number;
  to_inner(position: number): number;
  outer_changes(state: EditorState, changes: ChangeSet): ChangeSet;
  contains(position: number): boolean;
};

export type NestedEditorOptions = {
  outer: EditorView;
  parent: HTMLElement;
  // The current window, read fresh for every edit. CodeMirror reuses an equal
  // widget after text above it moves, so stored positions go stale.
  read_window(): SourceWindow | null;
  initial_window: SourceWindow;
  read_only: boolean;
  extensions?: Extension;
  keys?: readonly KeyBinding[];
  // Arrow keys reached the edge of the inner text. Return true if handled.
  on_edge(direction: -1 | 1, vertical: boolean): boolean;
};

const sync_inner = Annotation.define<boolean>();

// Keys typed in a surface go to these first. A host that owns every key in
// the outer editor, like Vim, returns true for a key it took. The keyboard
// then goes back to the outer editor: the reveal freeze ends, so the block at
// the caret shows its source, and the outer editor gets focus.
export const surface_keydown =
  Facet.define<(outer: EditorView, event: KeyboardEvent) => boolean>();

// Outer ranges that surfaces should highlight inside their own text, such as
// find matches. Each surface draws the ranges inside its window.
export type SurfaceHighlight = {
  from: number;
  to: number;
  class_name: string;
  selected?: boolean;
};
export const surface_highlights =
  Facet.define<(state: EditorState) => readonly SurfaceHighlight[]>();

const set_inner_highlights = StateEffect.define<DecorationSet>();
const inner_highlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(set_inner_highlights)) return effect.value;
    return value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// A CodeMirror view nested inside a block widget. It is an editing surface,
// not a document owner: every inner edit becomes an outer change in the same
// tick, and history lives only in the outer source.
export class NestedEditor {
  readonly inner: EditorView;
  readonly outer: EditorView;
  private syncing = false;
  private readonly editable = new Compartment();

  constructor(private readonly options: NestedEditorOptions) {
    this.outer = options.outer;
    this.inner = new EditorView({
      parent: options.parent,
      doc: options.initial_window.text,
      extensions: [
        Prec.highest(
          EditorView.domEventHandlers({
            keydown: (event) => this.outer_takes_key(event),
          }),
        ),
        // The outer drawSelection theme hides native carets in nested
        // contenteditable nodes too. This editor needs its own cursor layer.
        drawSelection(),
        inner_highlights,
        this.editable.of(editable_extension(options.read_only)),
        options.extensions ?? [],
        keymap.of([
          { key: "Mod-z", run: () => this.run_history(source_undo) },
          { key: "Mod-Shift-z", run: () => this.run_history(source_redo) },
          { key: "Mod-y", run: () => this.run_history(source_redo) },
          { key: "ArrowUp", run: () => this.edge(-1, true) },
          { key: "ArrowLeft", run: () => this.edge(-1, false) },
          { key: "ArrowDown", run: () => this.edge(1, true) },
          { key: "ArrowRight", run: () => this.edge(1, false) },
          ...(options.keys ?? []),
          ...defaultKeymap,
        ]),
      ],
      dispatchTransactions: (transactions) => {
        this.dispatch_inner(transactions);
      },
    });
  }

  // Called when the outer document changed. Outer edits that did not come
  // from this surface replace the inner text.
  refresh(window: SourceWindow) {
    if (this.syncing || this.inner.state.doc.eq(window.text)) return;
    const head = Math.min(
      this.inner.state.selection.main.head,
      window.text.length,
    );
    this.syncing = true;
    try {
      this.inner.dispatch({
        changes: {
          from: 0,
          to: this.inner.state.doc.length,
          insert: window.text,
        },
        selection: { anchor: head },
        annotations: [sync_inner.of(true), Transaction.addToHistory.of(false)],
      });
    } finally {
      this.syncing = false;
    }
  }

  // Draw the outer highlights that fall inside this window. Returns the
  // highlights it drew, so the owner can react to a selected match.
  // Pass the window when calling during an outer update, where DOM positions
  // are not reliable yet.
  refresh_highlights(
    window: SourceWindow | null = this.options.read_window(),
  ): SurfaceHighlight[] {
    const drawn: SurfaceHighlight[] = [];
    const ranges = [];
    if (window) {
      for (const source of this.outer.state.facet(surface_highlights)) {
        for (const highlight of source(this.outer.state)) {
          if (
            !window.contains(highlight.from) ||
            !window.contains(highlight.to)
          )
            continue;
          const from = window.to_inner(highlight.from);
          const to = window.to_inner(highlight.to);
          if (from >= to) continue;
          drawn.push(highlight);
          ranges.push(
            Decoration.mark({ class: highlight.class_name }).range(from, to),
          );
        }
      }
    }
    this.inner.dispatch({
      effects: set_inner_highlights.of(Decoration.set(ranges, true)),
      annotations: sync_inner.of(true),
    });
    return drawn;
  }

  set_read_only(read_only: boolean) {
    this.inner.dispatch({
      effects: this.editable.reconfigure(editable_extension(read_only)),
      annotations: sync_inner.of(true),
    });
  }

  // Show the outer selection inside this surface without moving focus.
  sync_selection_from_outer() {
    const window = this.options.read_window();
    const selection = this.outer.state.selection.main;
    if (
      !window ||
      !window.contains(selection.from) ||
      !window.contains(selection.to)
    )
      return;
    const projected = map_range(selection, (position) =>
      window.to_inner(position),
    );
    if (this.inner.state.selection.main.eq(projected.main, true)) return;
    this.syncing = true;
    try {
      this.inner.dispatch({
        selection: projected,
        annotations: sync_inner.of(true),
      });
    } finally {
      this.syncing = false;
    }
  }

  // Focus without scrolling the page. The inner selection shows the outer
  // selection when it fits in this window, keeping a range and its direction.
  // Otherwise the caret goes to outer_position, or stays where it was.
  focus(outer_position: number | null) {
    const window = this.options.read_window();
    const outer = this.outer.state.selection.main;
    let selection: EditorSelection | null = null;
    if (window && window.contains(outer.from) && window.contains(outer.to)) {
      selection = map_range(outer, (position) => window.to_inner(position));
    } else if (window && outer_position !== null) {
      selection = EditorSelection.create([
        EditorSelection.cursor(window.to_inner(outer_position)),
      ]);
    }
    if (selection) {
      this.syncing = true;
      try {
        this.inner.dispatch({ selection, annotations: sync_inner.of(true) });
      } finally {
        this.syncing = false;
      }
    }
    this.inner.focus();
    this.publish_selection();
  }

  // Set the inner caret. During an outer update, pass publish: false: the
  // outer selection is already right and cannot change mid-update.
  place_caret(
    selection: EditorSelection,
    options: { focus?: boolean; publish?: boolean } = {},
  ) {
    const { focus = true, publish = true } = options;
    this.inner.dispatch({
      selection,
      ...(publish ? {} : { annotations: sync_inner.of(true) }),
    });
    if (focus) this.inner.focus();
  }

  destroy() {
    this.inner.destroy();
  }

  private dispatch_inner(transactions: readonly Transaction[]) {
    if (this.syncing || transactions.every((tr) => tr.annotation(sync_inner))) {
      this.inner.update(transactions);
      return;
    }
    if (
      this.inner.state.readOnly &&
      transactions.some((transaction) => transaction.docChanged)
    )
      return;
    for (const transaction of transactions) {
      const window = this.options.read_window();
      this.inner.update([transaction]);
      if (!window) continue;
      if (!transaction.docChanged) {
        if (transaction.selection) this.publish_selection();
        continue;
      }
      const outer_changes = window.outer_changes(
        this.outer.state,
        transaction.changes,
      );
      // Map the new inner selection back through the inner change, then
      // forward through the outer change.
      const inverted = transaction.changes.invertedDesc;
      const selection = map_range(transaction.newSelection.main, (position) =>
        outer_changes.mapPos(window.to_outer(inverted.mapPos(position, 1)), 1),
      );
      this.syncing = true;
      try {
        this.outer.dispatch({
          changes: outer_changes,
          selection,
          // Keep typing/deletion/paste semantics so outer history groups a
          // typing burst exactly as it does in prose.
          userEvent:
            transaction.annotation(Transaction.userEvent) ?? "input.surface",
          annotations: surface_input.of(true),
        });
      } finally {
        this.syncing = false;
      }
    }
  }

  private publish_selection() {
    const window = this.options.read_window();
    if (!window) return;
    const selection = map_range(this.inner.state.selection.main, (position) =>
      window.to_outer(position),
    );
    if (this.outer.state.selection.eq(selection, true)) return;
    this.outer.dispatch({
      selection,
      userEvent: "select.surface",
      annotations: surface_input.of(true),
    });
  }

  private outer_takes_key(event: KeyboardEvent): boolean {
    const outer = this.outer;
    const taken = outer.state
      .facet(surface_keydown)
      .some((run) => run(outer, event));
    if (taken) {
      // Once this key is done: showing the source destroys this view.
      queueMicrotask(() => {
        end_reveal_freeze(outer);
      });
      take_focus_back(outer);
    }
    return taken;
  }

  private run_history(command: typeof source_undo): boolean {
    const changed = command(this.outer);
    if (changed) focus_selection(this.outer);
    return true;
  }

  private edge(direction: -1 | 1, vertical: boolean): boolean {
    const { state } = this.inner;
    const selection = state.selection.main;
    if (!selection.empty || state.selection.ranges.length !== 1) return false;
    const line = state.doc.lineAt(selection.head);
    const at_edge = vertical
      ? direction < 0
        ? line.number === 1
        : line.number === state.doc.lines
      : direction < 0
        ? selection.head === 0
        : selection.head === state.doc.length;
    if (
      !at_edge ||
      (vertical && moves_within_wrapped_line(this.inner, direction))
    )
      return false;
    return this.options.on_edge(direction, vertical);
  }
}

function editable_extension(read_only: boolean): Extension {
  return [
    EditorView.editable.of(!read_only),
    EditorState.readOnly.of(read_only),
  ];
}

function map_range(
  range: SelectionRange,
  map: (position: number) => number,
): EditorSelection {
  return EditorSelection.create([
    EditorSelection.range(
      map(range.anchor),
      map(range.head),
      range.goalColumn,
      range.bidiLevel ?? undefined,
      range.assoc,
    ),
  ]);
}

// Give focus back to the outer editor, keeping its selection, so the next key
// lands where Vim sees it. Focus is on the body when the nested view went away
// and inside a nested editor when it stayed. Anywhere else it is there on
// purpose, such as the find bar or Vim's own prompt.
export function take_focus_back(view: EditorView) {
  // Focusing dispatches, which cannot happen inside an update.
  queueMicrotask(() => {
    if (view.hasFocus) return;
    const doc = view.contentDOM.ownerDocument;
    const nested_editor = doc.activeElement?.closest(".cm-editor");
    const in_nested_editor =
      nested_editor &&
      nested_editor !== view.dom &&
      view.dom.contains(nested_editor);
    if (doc.activeElement === doc.body || in_nested_editor) view.focus();
  });
}

// Focus the surface that owns the outer selection, scrolling only when the
// block is off screen. Returns false when no surface owns it.
export function focus_selection(view: EditorView): boolean {
  const position = view.state.selection.main.head;
  const block = block_at(view.state, position);
  if (!block || !is_block_rendered(view.state, block)) return false;
  let controller = controller_for_block(view, block);
  if (!controller) {
    // An offscreen block has no DOM. Scrolling to it mounts the widget.
    view.dispatch({
      effects: EditorView.scrollIntoView(block.from, { y: "nearest" }),
    });
    controller = controller_for_block(view, block);
  }
  if (!controller?.focus || (controller.owns && !controller.owns(position)))
    return false;
  return controller.focus(position);
}

// Arrow keys in prose that reach a rendered surface enter it. Every blank
// source row is a caret stop, so this only runs on the row right next to
// the block.
export function enter_adjacent_block(
  view: EditorView,
  direction: -1 | 1,
  vertical: boolean,
): boolean {
  const { state } = view;
  const reveals_source = state.facet(reveal_surfaces_at_caret);
  // Left and right already step onto the block's edge, which shows its source.
  if (reveals_source && !vertical) return false;
  const selection = state.selection.main;
  if (!selection.empty || state.selection.ranges.length !== 1) return false;
  const line = state.doc.lineAt(selection.head);
  if (!vertical) {
    const content_start = line_container(state, line).content_from;
    if (selection.head !== (direction > 0 ? line.to : content_start))
      return false;
  } else if (moves_within_wrapped_line(view, direction)) {
    return false;
  }
  const target_number = line.number + direction;
  if (target_number < 1 || target_number > state.doc.lines) return false;
  const target = state.doc.line(target_number);
  const block = get_blocks(state).find((candidate) =>
    direction > 0 ? candidate.from === target.from : candidate.to === target.to,
  );
  if (!block || !is_block_rendered(state, block)) return false;
  if (reveals_source) {
    // The outer view owns every key, so no nested editor takes the caret. The
    // browser's own up and down step over the widget, so go to the nearest
    // line ourselves. It shows the block's source.
    const column = Math.min(selection.head - line.from, target.length);
    view.dispatch({
      selection: EditorSelection.cursor(target.from + column),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  }
  const controller = controller_for_block(view, block);
  if (!controller?.enter) return false;
  return controller.enter(
    direction > 0 ? 1 : -1,
    vertical ? caret_x(view) : null,
  );
}

// A surface's arrow key reached its edge. Move to the next caret stop
// outside the block: a neighboring surface, or the adjacent source row.
// Arrows never create source. Mod-Enter is the command that adds prose.
export function leave_block(
  view: EditorView,
  block: Block,
  direction: -1 | 1,
  goal_x: number | null,
): boolean {
  const { state } = view;
  if (
    (direction < 0 && block.from === 0) ||
    (direction > 0 && block.to === state.doc.length)
  )
    return true;
  const target = state.doc.lineAt(
    direction < 0 ? block.from - 1 : block.to + 1,
  );
  const neighbor = get_blocks(state).find((candidate) =>
    direction > 0 ? candidate.from === target.from : candidate.to === target.to,
  );
  if (neighbor && is_block_rendered(state, neighbor)) {
    const controller = controller_for_block(view, neighbor);
    if (controller?.enter?.(direction, goal_x)) return true;
  }
  const content_start = line_container(state, target).content_from;
  let anchor = direction < 0 ? target.to : content_start;
  if (goal_x !== null) {
    const at_x = position_at_x(view, target.from, goal_x);
    if (at_x !== null)
      anchor = Math.max(content_start, Math.min(target.to, at_x));
  }
  view.dispatch({
    selection: EditorSelection.cursor(
      anchor,
      0,
      undefined,
      goal_x ?? undefined,
    ),
    userEvent: "select",
  });
  view.focus();
  return true;
}

export function caret_x(view: EditorView): number | null {
  const head = view.state.selection.main.head;
  try {
    const rect = view.coordsAtPos(head);
    return rect ? rect.left : null;
  } catch {
    // Hidden editors and jsdom have no layout.
    return null;
  }
}

function position_at_x(
  view: EditorView,
  line_from: number,
  x: number,
): number | null {
  try {
    const rect = view.coordsAtPos(line_from);
    if (!rect || rect.bottom <= rect.top) return null;
    return view.posAtCoords({ x, y: (rect.top + rect.bottom) / 2 });
  } catch {
    return null;
  }
}

// Vertical caret placement inside a target editor at a screen x. Falls back
// to the same text column when the target line has no layout yet.
export function vertical_cursor(
  target: EditorView,
  target_position: number,
  goal_x: number | null,
  column_hint = 0,
): EditorSelection {
  const line = target.state.doc.lineAt(target_position);
  if (goal_x !== null) {
    try {
      const rect = target.coordsAtPos(target_position);
      if (rect && rect.bottom > rect.top) {
        const hit = target.posAndSideAtCoords({
          x: goal_x,
          y: (rect.top + rect.bottom) / 2,
        });
        if (hit)
          // A wrap boundary has two visual positions at one offset. Keep the
          // hit side so the next vertical arrow visits the right row.
          return EditorSelection.create([
            EditorSelection.cursor(
              Math.max(line.from, Math.min(line.to, hit.pos)),
              hit.assoc,
            ),
          ]);
      }
    } catch {
      // Offscreen lines may not have geometry yet.
    }
  }
  const text = line.text;
  const offset = findColumn(
    text,
    Math.min(column_hint, countColumn(text, target.state.tabSize)),
    target.state.tabSize,
  );
  return EditorSelection.create([EditorSelection.cursor(line.from + offset)]);
}

function moves_within_wrapped_line(
  view: EditorView,
  direction: number,
): boolean {
  if (!view.lineWrapping) return false;
  const selection = view.state.selection.main;
  try {
    const next = view.moveVertically(selection, direction > 0);
    return (
      next.head !== selection.head &&
      view.state.doc.lineAt(next.head).number ===
        view.state.doc.lineAt(selection.head).number
    );
  } catch {
    return false;
  }
}

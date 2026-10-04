import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
} from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import type { LineContainer } from "./context.js";

type Range = { readonly from: number; readonly to: number };

// Plugins can force source to show for extra ranges. Find uses this for the
// selected match, so a match inside a link shows the link's source.
export const reveal_ranges =
  Facet.define<(state: EditorState) => readonly Range[]>();

// Inline constructs: an empty caret touches the node, inclusive at both ends.
// A non-empty selection does not reveal anything, so text does not shift
// while the user is selecting it.
export function touches(state: EditorState, from: number, to: number): boolean {
  if (state.field(reveal_freeze, false)?.frozen) {
    return frozen_selection_touches(state, from, to, true);
  }
  for (const range of state.selection.ranges) {
    if (range.empty && range.head >= from && range.head <= to) return true;
  }
  return forced(state, from, to);
}

// Line prefixes: an empty caret is inside [from, to). The caret at the start
// of a list item's text does not reveal its marker, which keeps the text
// column still while typing a new item.
export function caret_in(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  if (state.field(reveal_freeze, false)?.frozen) {
    return frozen_selection_touches(state, from, to, false);
  }
  for (const range of state.selection.ranges) {
    if (range.empty && range.head >= from && range.head < to) return true;
  }
  return forced(state, from, to);
}

// A line's container prefix shows while an empty caret is inside it. The
// caret right after "- " is not inside, so a new item shows its bullet at
// once and the first typed character changes nothing on screen.
export function prefix_revealed(
  state: EditorState,
  container: LineContainer,
): boolean {
  const { line, content_from } = container;
  if (content_from === line.from) return false;
  return caret_in(state, line.from, content_from);
}

function forced(state: EditorState, from: number, to: number): boolean {
  for (const source of state.facet(reveal_ranges)) {
    for (const range of source(state)) {
      if (range.from < to && range.to > from) return true;
      if (range.from === range.to && range.from >= from && range.from <= to)
        return true;
    }
  }
  return false;
}

// Reveal does not change while the mouse button is down, or for a short time
// after release. Otherwise clicking a heading shows its `#` marks, the text
// shifts under the pointer, and the release lands somewhere else.
const reveal_release_delay_ms = 100;

type FreezeState = {
  frozen: boolean;
  selection: EditorState["selection"] | null;
};

const set_reveal_freeze = StateEffect.define<boolean>();

export const reveal_freeze = StateField.define<FreezeState>({
  create: () => ({ frozen: false, selection: null }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(set_reveal_freeze)) continue;
      return effect.value
        ? { frozen: true, selection: transaction.startState.selection }
        : { frozen: false, selection: null };
    }
    if (value.frozen && value.selection && transaction.docChanged)
      return { ...value, selection: value.selection.map(transaction.changes) };
    return value;
  },
});

function frozen_selection_touches(
  state: EditorState,
  from: number,
  to: number,
  inclusive: boolean,
): boolean {
  const selection = state.field(reveal_freeze).selection;
  for (const range of selection?.ranges ?? []) {
    if (!range.empty) continue;
    if (range.head >= from && (inclusive ? range.head <= to : range.head < to))
      return true;
  }
  return forced(state, from, to);
}

const reveal_freeze_plugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null;

    // Capture on the outer element so the freeze starts before CodeMirror's
    // own mousedown handler moves the selection.
    constructor(readonly view: EditorView) {
      view.dom.addEventListener("mousedown", this.press, true);
    }

    destroy() {
      this.view.dom.removeEventListener("mousedown", this.press, true);
      window.removeEventListener("mouseup", this.release, true);
      if (this.timer !== null) clearTimeout(this.timer);
    }

    press = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !this.view.contentDOM.contains(event.target as Node)
      )
        return;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      if (!this.view.state.field(reveal_freeze).frozen)
        this.view.dispatch({ effects: set_reveal_freeze.of(true) });
      window.addEventListener("mouseup", this.release, true);
    };

    release = () => {
      window.removeEventListener("mouseup", this.release, true);
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.view.state.field(reveal_freeze).frozen)
          this.view.dispatch({ effects: set_reveal_freeze.of(false) });
      }, reveal_release_delay_ms);
    };
  },
);

export const reveal_freeze_extension = [reveal_freeze, reveal_freeze_plugin];

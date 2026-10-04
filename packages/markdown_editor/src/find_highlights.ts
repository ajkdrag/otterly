import { RegExpCursor } from "@codemirror/search";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

type FindMatch = { from: number; to: number };
type FindState = {
  query: string;
  selected_index: number;
  matches: readonly FindMatch[];
};

export const set_find_query = StateEffect.define<{
  query: string;
  selected_index: number;
}>();

export function markdown_find_highlights() {
  return [find_state, find_rendering];
}

export function get_find_matches(state: EditorState): readonly FindMatch[] {
  return state.field(find_state, false)?.matches ?? [];
}

export function selected_find_intersects(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const find = state.field(find_state, false);
  const match = find?.matches[find.selected_index];
  return Boolean(match && match.from < to && match.to > from);
}

const empty_query = { query: "", selected_index: -1 };

export function get_find_query(state: EditorState): {
  query: string;
  selected_index: number;
} {
  return state.field(find_state, false) ?? empty_query;
}

export function update_find_query(
  view: EditorView,
  query: string,
  selected_index: number,
) {
  view.dispatch({ effects: set_find_query.of({ query, selected_index }) });
  const match = get_find_matches(view.state)[selected_index];
  if (match)
    view.dispatch({
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
}

const find_state = StateField.define<FindState>({
  create: () => ({ query: "", selected_index: 0, matches: [] }),
  update(value, transaction) {
    let query = value.query;
    let selected_index = value.selected_index;
    for (const effect of transaction.effects) {
      if (!effect.is(set_find_query)) continue;
      query = effect.value.query;
      selected_index = effect.value.selected_index;
    }
    if (query === value.query && !transaction.docChanged) {
      return selected_index === value.selected_index
        ? value
        : { ...value, selected_index };
    }
    return {
      query,
      selected_index,
      matches: find_matches(transaction.newDoc, query),
    };
  },
});

const find_rendering = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = decorate_matches(view);
    }
    update(update: ViewUpdate) {
      if (
        update.viewportChanged ||
        update.startState.field(find_state) !== update.state.field(find_state)
      ) {
        this.decorations = decorate_matches(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

function find_matches(document: Text, query: string): FindMatch[] {
  if (!query) return [];
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Search the text tree directly. No full-document string is needed, and
  // regex case folding keeps offsets valid for Unicode characters.
  return Array.from(
    new RegExpCursor(document, pattern, { ignoreCase: true }),
    ({ from, to }) => ({ from, to }),
  );
}

function decorate_matches(view: EditorView) {
  const { matches, selected_index } = view.state.field(find_state);
  const decorations = [];
  for (const visible of view.visibleRanges) {
    let low = 0;
    let high = matches.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((matches[middle]?.to ?? 0) < visible.from) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < matches.length; index++) {
      const match = matches[index];
      if (!match || match.from > visible.to) break;
      decorations.push(
        Decoration.mark({
          class:
            index === selected_index
              ? "find-match find-match--selected"
              : "find-match",
        }).range(match.from, match.to),
      );
    }
  }
  return Decoration.set(decorations, true);
}

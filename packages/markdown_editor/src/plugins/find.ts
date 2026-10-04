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
import type { MarkdownPlugin } from "../core/plugin.js";
import { reveal_ranges } from "../core/reveal.js";
import { surface_highlights, type SurfaceHighlight } from "../core/surface.js";

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

// Literal, case-insensitive find. Matches highlight in prose and inside
// surfaces (code bodies, table cells), and the selected match shows the
// source of whatever construct it sits in.
export function find(): MarkdownPlugin {
  return {
    name: "find",
    extensions: [
      find_state,
      find_rendering,
      reveal_ranges.of(selected_match_ranges),
      surface_highlights.of(match_highlights),
    ],
    theme: {
      ".find-match": {
        backgroundColor: "var(--editor-find-match-bg, #ffe06666)",
      },
      ".find-match--selected": {
        backgroundColor: "var(--editor-find-match-selected-bg, #ffad4266)",
        outline: "1px solid var(--ring, #c78323)",
      },
    },
  };
}

// Both functions return the same array for an unchanged find state, which
// lets the core skip work when nothing about find changed.
const selected_cache = new WeakMap<FindState, readonly FindMatch[]>();
function selected_match_ranges(state: EditorState): readonly FindMatch[] {
  const find = state.field(find_state, false);
  if (!find) return [];
  let ranges = selected_cache.get(find);
  if (!ranges) {
    const match = find.matches[find.selected_index];
    ranges = match ? [match] : [];
    selected_cache.set(find, ranges);
  }
  return ranges;
}

const highlight_cache = new WeakMap<FindState, readonly SurfaceHighlight[]>();
function match_highlights(state: EditorState): readonly SurfaceHighlight[] {
  const find = state.field(find_state, false);
  if (!find) return [];
  let highlights = highlight_cache.get(find);
  if (!highlights) {
    highlights = find.matches.map((match, index) => {
      const selected = index === find.selected_index;
      return {
        ...match,
        class_name: selected ? "find-match find-match--selected" : "find-match",
        selected,
      };
    });
    highlight_cache.set(find, highlights);
  }
  return highlights;
}

export function get_find_matches(state: EditorState): readonly FindMatch[] {
  return state.field(find_state, false)?.matches ?? [];
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
    const matches = find_matches(transaction.newDoc, query);
    // Deleting the selected match keeps a valid selection on what is left.
    return {
      query,
      selected_index: Math.min(selected_index, matches.length - 1),
      matches,
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

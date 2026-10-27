import { setSearchQuery, type SearchQuery } from "@codemirror/search";
import { StateField, type EditorState, type Text } from "@codemirror/state";
import {
  surface_highlights,
  type SurfaceHighlight,
} from "../../core/surface.js";

// The engine publishes its active search as a setSearchQuery effect flagged
// forVim, and clears it with the same effect once the flag is off (:noh). The
// engine draws the matches in the outer text only, so this hands the same
// matches to the surfaces, with the class names find uses.
const vim_search = StateField.define<SearchQuery | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setSearchQuery)) continue;
      const query = effect.value;
      value = "forVim" in query && query.forVim === true ? query : null;
    }
    return value;
  },
});

type Match = { from: number; to: number };

// The memos keep surface_highlights from redrawing on every caret move, since
// it compares the arrays it gets by identity.
let matches_memo: { query: SearchQuery; doc: Text; matches: Match[] } | null =
  null;
let highlights_memo: {
  matches: Match[];
  selected: number;
  highlights: SurfaceHighlight[];
} | null = null;

const no_highlights: readonly SurfaceHighlight[] = [];

function vim_search_highlights(
  state: EditorState,
): readonly SurfaceHighlight[] {
  const query = state.field(vim_search);
  if (!query?.valid) return no_highlights;
  const matches = find_matches(query, state);
  const { head } = state.selection.main;
  const selected = matches.findIndex(
    (match) => match.from <= head && head < match.to,
  );
  if (
    highlights_memo?.matches === matches &&
    highlights_memo.selected === selected
  )
    return highlights_memo.highlights;
  const highlights = matches.map((match, index) => ({
    ...match,
    class_name:
      index === selected ? "find-match find-match--selected" : "find-match",
    selected: index === selected,
  }));
  highlights_memo = { matches, selected, highlights };
  return highlights;
}

function find_matches(query: SearchQuery, state: EditorState): Match[] {
  if (matches_memo?.query === query && matches_memo.doc === state.doc)
    return matches_memo.matches;
  const matches: Match[] = [];
  const cursor = query.getCursor(state);
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    const { from, to } = step.value;
    if (from < to) matches.push({ from, to });
  }
  matches_memo = { query, doc: state.doc, matches };
  return matches;
}

export const vim_surface_search = [
  vim_search,
  surface_highlights.of(vim_search_highlights),
];

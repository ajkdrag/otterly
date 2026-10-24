import { isolateHistory } from "@codemirror/commands";
import {
  StateEffect,
  StateField,
  Transaction,
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

export type FindSpec = {
  text: string;
  regex: boolean;
  case_sensitive: boolean;
  whole_word: boolean;
};

type FindMatch = { from: number; to: number };
type FindState = {
  spec: FindSpec;
  selected_index: number;
  matches: readonly FindMatch[];
};

export const literal_find_spec = (text: string): FindSpec => ({
  text,
  regex: false,
  case_sensitive: false,
  whole_word: false,
});

export const set_find_query = StateEffect.define<{
  spec: FindSpec;
  selected_index: number;
}>();

// After a replace, select the first match at or after this position of the
// new document instead of keeping the index.
const select_match_from = StateEffect.define<number>();

// Find highlights in prose and inside surfaces (code bodies, table cells), and
// the selected match shows the source of whatever construct it sits in. The
// default spec is literal and case-insensitive.
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

// JS \b only knows ASCII letters, so "café" or "привет" as a whole word would
// never match here, while Rust's \b is Unicode and finds them. This builds the
// Unicode \b out of lookarounds, with Rust's definition of a word character.
// Old WebKit has no lookbehind and keeps the plain \b.
function supports_lookbehind(): boolean {
  try {
    new RegExp("(?<!a)b", "u");
    return true;
  } catch {
    return false;
  }
}

const word_char = "[\\p{Alphabetic}\\p{M}\\p{Nd}\\p{Pc}\\p{Join_Control}]";
const word_boundary = supports_lookbehind()
  ? `(?:(?<=${word_char})(?!${word_char})|(?<!${word_char})(?=${word_char}))`
  : "\\b";

// The pattern for a spec, or null for an empty or invalid one. Matching runs
// one line at a time (`\s` never crosses a line), like the vault find in Rust.
// Callers that count matches outside the editor should use this too, so the
// count and the highlights cannot disagree.
export function find_regexp(spec: FindSpec): RegExp | null {
  if (!spec.text || spec.text.includes("\n")) return null;
  const flags = spec.case_sensitive ? "gu" : "giu";
  const source = spec.regex
    ? allow_punctuation_escapes(spec.text)
    : spec.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    // Check the bare pattern first: wrapping "a)|(b" for whole word would
    // turn an invalid pattern into a valid one.
    const bare = new RegExp(source, flags);
    return spec.whole_word
      ? new RegExp(`${word_boundary}(?:${source})${word_boundary}`, flags)
      : bare;
  } catch {
    return null;
  }
}

// Rust accepts a backslash before any ASCII punctuation or space (`\#`, `\-`,
// `\_`). With the u flag JS only accepts it before syntax characters, so those
// patterns would be "Invalid regex" here and fine in the vault find. Write the
// character as \xNN instead. `\<` and `\>` stay as they are: Rust reads them
// as word boundaries, which JS does not have, so they stay invalid here.
function allow_punctuation_escapes(source: string): string {
  return source.replace(/\\([\s\S])/g, (whole, char: string) =>
    /[!"#%&',\-:;=@_`~ ]/.test(char)
      ? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`
      : whole,
  );
}

// Yields the non-empty matches of a global pattern in one line. Empty matches
// (`^`, `a*`) are skipped in find and replace.
export function* find_matches_in_line(
  line: string,
  pattern: RegExp,
): Generator<RegExpExecArray> {
  pattern.lastIndex = 0;
  for (let found = pattern.exec(line); found; found = pattern.exec(line)) {
    if (found[0]) {
      yield found;
      continue;
    }
    // exec does not move past an empty match on its own. Step one code
    // point, so the next try never starts inside a surrogate pair.
    const code_point = line.codePointAt(found.index) ?? 0;
    pattern.lastIndex = found.index + (code_point > 0xffff ? 2 : 1);
  }
}

// Regex mode replacement template, the same syntax as Rust's
// Captures::expand: $1, ${1}, $name, ${name}, $0, and $$ for a literal $.
// An unbraced name is the longest run of [0-9A-Za-z_], so "$1a" means the
// group named "1a". A group that did not match expands to "".
export function expand_replacement(
  template: string,
  match: RegExpMatchArray,
): string {
  let expanded = "";
  let rest = template;
  for (
    let dollar = rest.indexOf("$");
    dollar >= 0;
    dollar = rest.indexOf("$")
  ) {
    expanded += rest.slice(0, dollar);
    rest = rest.slice(dollar);
    if (rest[1] === "$") {
      expanded += "$";
      rest = rest.slice(2);
      continue;
    }
    const reference = parse_capture_reference(rest);
    if (!reference) {
      expanded += "$";
      rest = rest.slice(1);
      continue;
    }
    rest = rest.slice(reference.end);
    const value = /^[0-9]+$/.test(reference.name)
      ? match[Number(reference.name)]
      : match.groups?.[reference.name];
    expanded += value ?? "";
  }
  return expanded + rest;
}

function parse_capture_reference(
  text: string,
): { name: string; end: number } | null {
  if (text[1] === "{") {
    const close = text.indexOf("}", 2);
    return close < 0 ? null : { name: text.slice(2, close), end: close + 1 };
  }
  const name = /^[0-9A-Za-z_]+/.exec(text.slice(1))?.[0];
  return name ? { name, end: name.length + 1 } : null;
}

// Replaces the selected match and selects the next one after it, so you can
// keep pressing replace. One transaction with its own undo step. Returns
// false when there is nothing to replace.
export function replace_find_match(
  view: EditorView,
  replacement: string,
): boolean {
  const find = view.state.field(find_state, false);
  const match = find?.matches[find.selected_index];
  if (!find || !match || view.state.readOnly) return false;
  const insert = replacement_builder(
    view.state.doc,
    find.spec,
    replacement,
  )(match);
  view.dispatch({
    changes: { from: match.from, to: match.to, insert },
    effects: select_match_from.of(match.from + insert.length),
    annotations: [
      Transaction.userEvent.of("input.replace"),
      isolateHistory.of("full"),
    ],
  });
  scroll_to_selected_match(view);
  return true;
}

// Replaces every match in one transaction, so one undo reverts all of them.
// Returns the number of replaced matches.
export function replace_all_find_matches(
  view: EditorView,
  replacement: string,
): number {
  const find = view.state.field(find_state, false);
  if (!find || find.matches.length === 0 || view.state.readOnly) return 0;
  const replacement_for = replacement_builder(
    view.state.doc,
    find.spec,
    replacement,
  );
  const changes = find.matches.map((match) => ({
    from: match.from,
    to: match.to,
    insert: replacement_for(match),
  }));
  view.dispatch({
    changes,
    annotations: [
      Transaction.userEvent.of("input.replace.all"),
      isolateHistory.of("full"),
    ],
  });
  return changes.length;
}

// Returns the inserted text for each match. Regex mode runs the pattern again
// at the match start to get its groups. A sticky copy matches exactly there,
// and leftmost-first gives the same match.
function replacement_builder(
  document: Text,
  spec: FindSpec,
  replacement: string,
): (match: FindMatch) => string {
  const pattern = spec.regex ? find_regexp(spec) : null;
  if (!pattern) return () => replacement;
  const sticky = new RegExp(pattern.source, pattern.flags.replace("g", "y"));
  return (match) => {
    const line = document.lineAt(match.from);
    sticky.lastIndex = match.from - line.from;
    const found = sticky.exec(line.text);
    return found ? expand_replacement(replacement, found) : replacement;
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

const empty_query = { spec: literal_find_spec(""), selected_index: -1 };

export function get_find_query(state: EditorState): {
  spec: FindSpec;
  selected_index: number;
} {
  return state.field(find_state, false) ?? empty_query;
}

export function update_find_query(
  view: EditorView,
  spec: FindSpec,
  selected_index: number,
) {
  view.dispatch({ effects: set_find_query.of({ spec, selected_index }) });
  scroll_to_selected_match(view);
}

function scroll_to_selected_match(view: EditorView) {
  const find = view.state.field(find_state, false);
  const match = find?.matches[find.selected_index];
  if (match)
    view.dispatch({
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
}

function same_spec(left: FindSpec, right: FindSpec) {
  return (
    left.text === right.text &&
    left.regex === right.regex &&
    left.case_sensitive === right.case_sensitive &&
    left.whole_word === right.whole_word
  );
}

const find_state = StateField.define<FindState>({
  create: () => ({
    spec: literal_find_spec(""),
    selected_index: 0,
    matches: [],
  }),
  update(value, transaction) {
    let spec = value.spec;
    let selected_index = value.selected_index;
    let select_from: number | undefined;
    for (const effect of transaction.effects) {
      if (effect.is(set_find_query)) {
        spec = effect.value.spec;
        selected_index = effect.value.selected_index;
      } else if (effect.is(select_match_from)) {
        select_from = effect.value;
      }
    }
    if (same_spec(spec, value.spec) && !transaction.docChanged) {
      return selected_index === value.selected_index
        ? value
        : { ...value, selected_index };
    }
    const matches = find_matches(transaction.newDoc, spec);
    if (select_from !== undefined) {
      const next = matches.findIndex((match) => match.from >= select_from);
      selected_index = next >= 0 ? next : 0;
    }
    // Deleting the selected match keeps a valid selection on what is left.
    // With nothing left it stays 0, not -1, so that undoing a replace brings
    // the first match back as the selected one.
    return {
      spec,
      selected_index: Math.max(0, Math.min(selected_index, matches.length - 1)),
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

// Walks the text tree line by line. No full-document string is needed, and
// matching the original text keeps offsets valid under Unicode case folding.
function find_matches(document: Text, spec: FindSpec): FindMatch[] {
  const pattern = find_regexp(spec);
  if (!pattern) return [];
  const matches: FindMatch[] = [];
  let line_start = 0;
  for (const line of document.iterLines()) {
    for (const found of find_matches_in_line(line, pattern)) {
      const from = line_start + found.index;
      matches.push({ from, to: from + found[0].length });
    }
    line_start += line.length + 1;
  }
  return matches;
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

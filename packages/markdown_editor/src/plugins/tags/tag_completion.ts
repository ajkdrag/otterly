import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorState, Extension, Line } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { current_tree, has_ancestor, is_literal } from "../../core/context.js";
import { menu_support } from "../menus/menu_support.js";
import type { TagOptions } from "./index.js";
import { inside_link, starts_tag } from "./tag_syntax.js";

type QueryTags = NonNullable<TagOptions["query_tags"]>;

// Typing `#` and one tag char offers the vault's tags. Ctrl-Space right after
// a `#` shows the top tags. The host ranks (one ranker for the omnibar and
// here), so we ask again on every keystroke with filter off, and a lookup
// that is stale when it returns is dropped.
export function tag_completion(query_tags: QueryTags): Extension {
  return [
    menu_support,
    abort_on_destroy,
    markdownLanguage.data.of({ autocomplete: tag_source(query_tags) }),
  ];
}

const tag_before_caret = /#([\p{Alphabetic}\p{N}\p{M}_\-/]*)$/u;
const tag_chars_after_caret = /^[\p{Alphabetic}\p{N}\p{M}_\-/]*/u;

// Lookups still running when the view goes away are aborted, so the host can
// drop the work. Same pattern as wiki links.
const pending_lookups = new WeakMap<EditorView, Set<AbortController>>();
const abort_on_destroy = ViewPlugin.define((view) => ({
  destroy() {
    for (const lookup of pending_lookups.get(view) ?? []) lookup.abort();
    pending_lookups.delete(view);
  },
}));

function tag_source(query_tags: QueryTags) {
  return (
    context: CompletionContext,
  ): Promise<CompletionResult | null> | null => {
    const { state, pos } = context;
    if (state.readOnly || !state.selection.main.empty || is_literal(state, pos))
      return null;
    const line = state.doc.lineAt(pos);
    const typed = tag_before_caret.exec(state.sliceDoc(line.from, pos));
    if (!typed) return null;
    const partial = typed[1] ?? "";
    if (!partial && !context.explicit) return null;
    const hash = line.from + typed.index;
    if (!starts_a_tag(state, line, typed.index)) return null;
    if (in_link(state, hash)) return null;

    const abort = new AbortController();
    context.addEventListener(
      "abort",
      () => {
        abort.abort();
      },
      { onDocChange: true },
    );
    const view = context.view;
    if (view) {
      const lookups = pending_lookups.get(view) ?? new Set();
      lookups.add(abort);
      pending_lookups.set(view, lookups);
      abort.signal.addEventListener("abort", () => lookups.delete(abort), {
        once: true,
      });
    }
    return query_tags(partial, abort.signal)
      .finally(() => {
        if (view) pending_lookups.get(view)?.delete(abort);
      })
      .then((suggestions): CompletionResult | null => {
        if (context.aborted || abort.signal.aborted) return null;
        // The typed tag is already complete. Offering it would make Enter
        // accept a no-op instead of making a newline.
        const typed_key = tag_key(partial);
        const options = suggestions
          .filter((suggestion) => tag_key(suggestion.tag) !== typed_key)
          .map((suggestion) => ({
            label: `#${suggestion.tag}`,
            // The menu theme draws the `#` itself, dimmed like a chip's.
            displayLabel: suggestion.tag,
            detail: String(suggestion.count),
            type: "tag",
            apply: (view: EditorView) => {
              apply_tag(view, hash, suggestion.tag);
            },
          }));
        if (!options.length) return null;
        return { from: hash, filter: false, options };
      })
      .catch(() => null);
  };
}

// Replaces from the `#` through the tag chars after the caret, so completing
// in the middle of `#pr|oj` does not leave `oj` behind. No trailing space:
// you may want `#tag.`.
function apply_tag(view: EditorView, hash: number, tag: string) {
  const { state } = view;
  if (state.readOnly) return;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const after = tag_chars_after_caret.exec(state.sliceDoc(head, line.to));
  const to = head + (after?.[0].length ?? 0);
  const insert = `#${tag}`;
  view.dispatch({
    changes: { from: hash, to, insert },
    selection: { anchor: hash + insert.length },
    userEvent: "input.complete",
  });
}

// Is the `#` at `line.text[idx]` the start of a tag? A Hashtag node says so
// with the parser's own R2, which sees through the `>` of a quote and the `|`
// of a table row (`>#ta`, `|#ta|`). A bare `#` and a numbers-only `#12` have
// no node yet, so those fall back to R2 on the line: `C#` and `a#b` are not
// tags. Same BOM rule as the parser.
function starts_a_tag(state: EditorState, line: Line, idx: number): boolean {
  const hash = line.from + idx;
  if (current_tree(state, hash).resolveInner(hash, 1).name === "Hashtag")
    return true;
  const text_start =
    line.from === 0 && line.text.charCodeAt(0) === 0xfeff ? 1 : 0;
  return starts_tag(line.text, idx, text_start);
}

// No completion in a URL, an autolink, a wiki link, or link text whose `#`
// would not make a chip anyway.
function in_link(state: EditorState, pos: number): boolean {
  const node = current_tree(state, pos).resolveInner(pos, 1);
  if (inside_link(node)) return true;
  const link_names = ["URL", "Autolink", "WikiLink"];
  return link_names.includes(node.name) || has_ancestor(node, link_names);
}

// Same key as the index: NFC, then lowercase.
function tag_key(tag: string): string {
  return tag.normalize("NFC").toLowerCase();
}

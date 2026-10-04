import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { is_literal } from "../../core/context.js";
import type { MarkdownPlugin } from "../../core/plugin.js";
import { menu_support } from "../menus/menu_support.js";

export type WikiSuggestion = {
  title: string;
  path: string;
  kind: "existing" | "planned";
  ref_count?: number | undefined;
};

export type WikiLinkOptions = {
  // The host looks up notes. The signal aborts when the query is stale.
  query_wiki_links?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly WikiSuggestion[]>;
};

// [[target]] and [[target|alias]] links. The links plugin renders them; this
// plugin adds the syntax and note completion.
export function wiki_links(options: WikiLinkOptions = {}): MarkdownPlugin {
  return {
    name: "wiki_links",
    requires: ["links"],
    syntax: wiki_syntax,
    extensions: options.query_wiki_links
      ? [
          menu_support,
          abort_on_destroy,
          markdownLanguage.data.of({
            autocomplete: wiki_source(options.query_wiki_links),
          }),
        ]
      : [],
  };
}

const wiki_syntax: MarkdownConfig = {
  defineNodes: ["WikiLink"],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(context, next, position) {
        if (next !== 91 || context.char(position + 1) !== 91) return -1;
        for (let cursor = position + 2; cursor < context.end; cursor++) {
          const char = context.char(cursor);
          if (char === 91 || char === 10 || char === 13) return -1;
          if (char === 93 && context.char(cursor + 1) === 93) {
            if (cursor === position + 2) return -1;
            return context.addElement(
              context.elt("WikiLink", position, cursor + 2),
            );
          }
        }
        return -1;
      },
    },
  ],
};

// Lookups still running when the view goes away are aborted, so the host can
// drop the work.
const pending_lookups = new WeakMap<EditorView, Set<AbortController>>();
const abort_on_destroy = ViewPlugin.define((view) => ({
  destroy() {
    for (const lookup of pending_lookups.get(view) ?? []) lookup.abort();
    pending_lookups.delete(view);
  },
}));

function wiki_source(
  query_wiki_links: NonNullable<WikiLinkOptions["query_wiki_links"]>,
) {
  return (
    context: CompletionContext,
  ): Promise<CompletionResult | null> | null => {
    const { state, pos } = context;
    if (state.readOnly || !state.selection.main.empty || is_literal(state, pos))
      return null;
    const line = state.doc.lineAt(pos);
    // Stop at an alias separator: the alias is free text, not a target.
    const wiki = /\[\[([^\][|\n]*)$/.exec(state.sliceDoc(line.from, pos));
    if (!wiki) return null;
    const from = line.from + wiki.index;
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
    return query_wiki_links(wiki[1] ?? "", abort.signal)
      .finally(() => {
        if (view) pending_lookups.get(view)?.delete(abort);
      })
      .then((items): CompletionResult | null => {
        if (context.aborted || abort.signal.aborted) return null;
        return {
          from,
          filter: false,
          options: items.map((item) => ({
            label: item.title,
            detail:
              item.kind === "planned"
                ? `${String(item.ref_count ?? 0)} refs`
                : item.path,
            type: item.kind === "planned" ? "wiki-planned" : "wiki-existing",
            apply: (
              view: EditorView,
              _completion: unknown,
              start: number,
              end: number,
            ) => {
              if (view.state.readOnly) return;
              const insert = `[[${item.path.replace(/\.md$/i, "")}]]`;
              // Existing closing brackets after the caret are reused, so the
              // link closes exactly once.
              const to =
                view.state.sliceDoc(end, end + 2) === "]]" ? end + 2 : end;
              view.dispatch({
                changes: { from: start, to, insert },
                selection: { anchor: start + insert.length },
                userEvent: "input.complete",
              });
            },
          })),
        };
      })
      .catch(() => null);
  };
}

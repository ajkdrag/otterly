import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import {
  insert_lines,
  is_literal,
  line_container,
} from "../../core/context.js";
import {
  get_registry,
  type InsertItem,
  type MarkdownPlugin,
} from "../../core/plugin.js";
import { focus_selection } from "../../core/surface.js";
import { menu_support, type IconCompletion } from "./menu_support.js";

// Type "/" at the start of a line's text to insert a block. The items come
// from every installed construct's `insert` list, so a plugin that adds a
// construct adds its slash command too.
export function slash_menu(): MarkdownPlugin {
  return {
    name: "slash_menu",
    extensions: [
      menu_support,
      markdownLanguage.data.of({ autocomplete: slash_source }),
    ],
  };
}

function slash_source(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context;
  if (state.readOnly || !state.selection.main.empty || is_literal(state, pos))
    return null;
  const line = state.doc.lineAt(pos);
  const container = line_container(state, line);
  if (pos < container.content_from) return null;
  const query = /^\/([^/\s]*)$/.exec(
    state.sliceDoc(container.content_from, pos),
  );
  if (!query) return null;
  const text = (query[1] ?? "").toLowerCase();
  const items = ordered(get_registry(state).insert_items).filter(
    (item) =>
      item.id.startsWith(text) ||
      item.label.toLowerCase().includes(text) ||
      (item.aliases ?? []).some((alias) => alias.includes(text)),
  );
  return {
    from: container.content_from,
    filter: false,
    options: items.map(
      (item): IconCompletion => ({
        label: item.label,
        ...(item.detail ? { detail: item.detail } : {}),
        icon: item.icon ?? "",
        apply: (view, _completion, from, to) => {
          apply_insert(view, item, from, to);
        },
      }),
    ),
  };
}

// Common blocks first, in the order people reach for them. Items from other
// plugins follow in the order they were installed.
const preferred_order = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code",
  "table",
  "bullet",
  "ordered",
  "todo",
  "blockquote",
  "callout",
  "divider",
];

function ordered(items: readonly InsertItem[]): InsertItem[] {
  const rank = (item: InsertItem) => {
    const index = preferred_order.indexOf(item.id);
    return index < 0 ? preferred_order.length : index;
  };
  return [...items].sort((left, right) => rank(left) - rank(right));
}

// Replace the "/query" with the item's lines. Text after the query moves to
// the caret position inside the inserted block, so nothing typed is lost.
function apply_insert(
  view: EditorView,
  item: InsertItem,
  from: number,
  to: number,
) {
  if (view.state.readOnly) return;
  const line = view.state.doc.lineAt(to);
  const rest = view.state.sliceDoc(to, line.to);
  const [caret_line, caret_column] = item.caret ?? [
    0,
    item.lines[0]?.length ?? 0,
  ];
  const lines = item.lines.map((text, index) =>
    index === caret_line
      ? text.slice(0, caret_column) + rest + text.slice(caret_column)
      : text,
  );
  view.dispatch({
    ...insert_lines(view.state, from, line.to, lines, [
      caret_line,
      caret_column,
    ]),
    userEvent: "input.complete",
  });
  // A code block or table takes focus before the next key.
  focus_selection(view);
}

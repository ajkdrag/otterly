import {
  autocompletion,
  completionKeymap,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { get_frontmatter_end } from "./frontmatter_range.js";
import { focus_table_selection } from "./table_rendering.js";
import { focus_code_selection } from "./code_block_rendering.js";

export type WikiSuggestion = {
  title: string;
  path: string;
  kind: "existing" | "planned";
  ref_count?: number | undefined;
};
export type MarkdownCompletionOptions = {
  query_wiki_links?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly WikiSuggestion[]>;
};

export function markdown_completions(options: MarkdownCompletionOptions = {}) {
  return [
    autocompletion({
      override: [markdown_completion_source(options)],
      activateOnTypingDelay: 0,
      interactionDelay: 0,
      defaultKeymap: false,
      icons: false,
      tooltipClass: (state) =>
        currentCompletions(state).some(is_slash_command)
          ? "md-slash-menu"
          : "md-wiki-menu",
      optionClass: (completion) =>
        is_slash_command(completion)
          ? "md-slash-option"
          : `md-wiki-option${completion.type === "wiki-planned" ? " md-wiki-planned" : ""}`,
      addToOptions: [
        {
          position: 20,
          render(completion) {
            if (!is_slash_command(completion)) return null;
            const icon = document.createElement("span");
            icon.className = "md-slash-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = completion.icon;
            return icon;
          },
        },
      ],
    }),
    Prec.highest(
      keymap.of(
        completionKeymap.map((binding) => {
          if (binding.key === "ArrowDown")
            return { ...binding, run: move_completion(1) };
          if (binding.key === "ArrowUp")
            return { ...binding, run: move_completion(-1) };
          return binding;
        }),
      ),
    ),
  ];
}

export function markdown_completion_source(
  options: MarkdownCompletionOptions = {},
) {
  return (
    context: CompletionContext,
  ): CompletionResult | Promise<CompletionResult | null> | null => {
    const { state, pos } = context;
    if (
      state.readOnly ||
      !state.selection.main.empty ||
      pos < get_frontmatter_end(state) ||
      inside_literal(state, pos)
    )
      return null;
    const line = state.doc.lineAt(pos);
    const before = state.sliceDoc(line.from, pos);
    const slash = /^\s*\/([^/\n]*)$/.exec(before);
    if (slash && !inside_list(state, pos)) {
      const query = (slash[1] ?? "").trim().toLowerCase();
      return {
        from: line.from,
        filter: false,
        options: slash_commands.filter(
          (command) =>
            command.id.startsWith(query) ||
            command.label.toLowerCase().includes(query) ||
            command.keywords.some((keyword) => keyword.includes(query)),
        ),
      };
    }
    const wiki = /\[\[([^\][|\n]*)$/.exec(before);
    if (!wiki || !options.query_wiki_links) return null;
    const from = line.from + (wiki.index ?? 0);
    const query = wiki[1] ?? "";
    const abort = new AbortController();
    context.addEventListener(
      "abort",
      () => {
        abort.abort();
      },
      {
        onDocChange: true,
      },
    );
    return options
      .query_wiki_links(query, abort.signal)
      .then((items) => {
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
              _completion: Completion,
              start: number,
              end: number,
            ) => {
              if (view.state.readOnly) return;
              const path = item.path.replace(/\.md$/i, "");
              const insert = `[[${path}]]`;
              const to =
                view.state.sliceDoc(end, end + 2) === "]]" ? end + 2 : end;
              view.dispatch({
                changes: { from: start, to, insert },
                selection: { anchor: start + insert.length },
                userEvent: "input.complete",
                scrollIntoView: true,
              });
            },
          })),
        };
      })
      .catch(() => null);
  };
}

type SlashCommand = Completion & {
  id: string;
  icon: string;
  keywords: readonly string[];
};
const headings = [
  { description: "Large section heading", keywords: ["title", "large"] },
  { description: "Medium section heading", keywords: ["subtitle", "medium"] },
  { description: "Small section heading", keywords: ["small"] },
  { description: "Sub-section heading", keywords: [] },
  { description: "Minor heading", keywords: [] },
  { description: "Minor heading", keywords: [] },
];
const slash_commands: SlashCommand[] = [
  ...headings.map((heading, index) => ({
    id: `h${String(index + 1)}`,
    label: `Heading ${String(index + 1)}`,
    detail: heading.description,
    icon: `H${String(index + 1)}`,
    keywords: ["heading", `h${String(index + 1)}`, ...heading.keywords],
    apply: insert_block("#".repeat(index + 1) + " "),
  })),
  {
    id: "code",
    label: "Code Block",
    detail: "Code with syntax highlighting",
    icon: "</>",
    keywords: [
      "code",
      "block",
      "pre",
      "fence",
      "snippet",
      "syntax",
      "programming",
    ],
    apply: insert_block("```\n", "\n```\n"),
  },
  {
    id: "table",
    label: "Table",
    detail: "Grid with rows and columns",
    icon: "⊞",
    keywords: ["table", "grid", "spreadsheet", "data"],
    apply: insert_block("| Col 1 | Col 2 |\n| --- | --- |\n|  |  |\n\n", "", 2),
  },
  {
    id: "bullet",
    label: "Bullet List",
    detail: "Unordered list of items",
    icon: "•",
    keywords: ["bullet", "list", "unordered", "ul", "items"],
    apply: insert_block("- "),
  },
  {
    id: "ordered",
    label: "Ordered List",
    detail: "Numbered list of items",
    icon: "#",
    keywords: ["ordered", "list", "numbered", "ol", "number"],
    apply: insert_block("1. "),
  },
  {
    id: "todo",
    label: "Task List",
    detail: "Checklist item with a checkbox",
    icon: "☐",
    keywords: ["task", "todo", "checkbox", "check", "list"],
    apply: insert_block("- [ ] "),
  },
  {
    id: "blockquote",
    label: "Blockquote",
    detail: "Indented quote or callout",
    icon: "❝",
    keywords: ["quote", "blockquote", "callout", "cite"],
    apply: insert_block("> "),
  },
  {
    id: "divider",
    label: "Divider",
    detail: "Horizontal rule to separate sections",
    icon: "—",
    keywords: ["divider", "hr", "horizontal", "rule", "separator", "line"],
    apply: insert_block("---\n\n"),
  },
];

function is_slash_command(completion: Completion): completion is SlashCommand {
  return "icon" in completion;
}

function move_completion(direction: -1 | 1) {
  return (view: EditorView) => {
    const completions = currentCompletions(view.state);
    const selected = selectedCompletionIndex(view.state);
    if (!completions.length || selected === null) return false;
    const next = Math.max(
      0,
      Math.min(completions.length - 1, selected + direction),
    );
    view.dispatch({ effects: setSelectedCompletion(next) });
    return true;
  };
}

function insert_block(
  prefix: string,
  suffix = "",
  cursor_offset = prefix.length,
) {
  return (
    view: EditorView,
    _completion: Completion,
    from: number,
    to: number,
  ) => {
    if (view.state.readOnly) return;
    const line = view.state.doc.lineAt(to);
    const remainder = view.state.sliceDoc(to, line.to);
    view.dispatch({
      changes: { from, to: line.to, insert: prefix + remainder + suffix },
      selection: { anchor: from + cursor_offset },
      userEvent: "input.complete",
      scrollIntoView: true,
    });
    if (!focus_table_selection(view)) focus_code_selection(view);
  };
}

function inside_literal(state: EditorState, pos: number) {
  let node = syntaxTree(state).resolveInner(pos, -1);
  for (;;) {
    if (
      [
        "CodeBlock",
        "FencedCode",
        "InlineCode",
        "HTMLBlock",
        "HTMLTag",
        "Link",
        "Image",
      ].includes(node.name)
    )
      return true;
    if (!node.parent) return false;
    node = node.parent;
  }
}

function inside_list(state: EditorState, pos: number) {
  let node = syntaxTree(state).resolveInner(pos, -1);
  for (;;) {
    if (node.name === "ListItem") return true;
    if (!node.parent) return false;
    node = node.parent;
  }
}

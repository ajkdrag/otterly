import {
  ChangeSet,
  EditorSelection,
  StateField,
  type ChangeSpec,
  type EditorState,
  type StateEffect as StateEffectType,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  finish_block_construction,
  get_blocks,
  is_block_rendered,
  read_block_view_states,
  refresh_blocks,
  replace_block_view_states,
} from "../../core/block_field.js";
import type { KeyContext } from "../../core/keys.js";
import type { BlockConstruct, MarkdownPlugin } from "../../core/plugin.js";
import { focus_selection } from "../../core/surface.js";
import {
  code_content,
  is_first_list_paragraph,
  selected_blocks,
  type TextBlock,
} from "../commonmark/block_commands.js";
import { read_code_block } from "./fence_source.js";
import { code_block_theme } from "./theme.js";
import {
  CodeBlockWidget,
  normalize_view_state,
  type CodeBlockOptions,
  type CodeBlockViewState,
} from "./widget.js";

export type { CodeBlockOptions, CodeBlockViewState };

const construct_name = "code_block";

// Fenced code as an editable surface: a nested CodeMirror editor for the
// body, a language picker, copy, resizing, and optional diagram previews.
export function code_blocks(options: CodeBlockOptions = {}): MarkdownPlugin {
  const fenced_code: BlockConstruct = {
    kind: "block",
    name: construct_name,
    nodes: ["FencedCode"],
    reveal: "surface",
    literal: true,
    // A fence typed on the last line has no body line yet. Keep it as source
    // until Enter adds one, so typing stays on the opening line. A node whose
    // fence cannot be read stays source too.
    complete: (block, state) => {
      const source = read_code_block(state, block.from, block.to);
      return !!source && !source.needs_opening_newline;
    },
    editable: (block, state) => {
      const source = read_code_block(state, block.from, block.to);
      return source && { from: source.content_from, to: source.content_to };
    },
    widget: (block, state) =>
      new CodeBlockWidget(
        block,
        state.readOnly,
        options,
        state.field(diagram_revision, false) ?? 0,
      ),
    keys: { Enter: start_code_body },
    insert: [
      {
        id: "code",
        label: "Code Block",
        detail: "Code with syntax highlighting",
        icon: "</>",
        aliases: [
          "code",
          "block",
          "pre",
          "fence",
          "snippet",
          "syntax",
          "programming",
        ],
        lines: ["```", "", "```"],
        caret: [1, 0],
      },
    ],
  };
  return {
    name: "code_blocks",
    requires: ["commonmark"],
    code_languages: options.languages ?? [],
    constructs: [fenced_code],
    keys: [{ key: "Mod-Alt-c", run: convert_to_code_block }],
    theme: code_block_theme,
    extensions: [
      diagram_revision,
      EditorView.updateListener.of((update) => {
        if (!options.on_view_states_change) return;
        const before = read_block_view_states(
          update.startState,
          construct_name,
        );
        const after = read_block_view_states(update.state, construct_name);
        if (
          before.length === after.length &&
          before.every((state, index) => state === after[index])
        )
          return;
        options.on_view_states_change(after.map(normalize_view_state));
      }),
    ],
  };
}

export function read_code_block_view_states(
  state: EditorState,
): CodeBlockViewState[] {
  return read_block_view_states(state, construct_name).map(
    normalize_view_state,
  );
}

export function set_code_block_view_states(
  states: readonly (CodeBlockViewState | null)[],
): StateEffectType<unknown> {
  return replace_block_view_states.of({ construct: construct_name, states });
}

// Dispatch after a theme change so diagrams render again with new colors.
export const refresh_code_diagrams = refresh_blocks;

const diagram_revision = StateField.define<number>({
  create: () => 0,
  update(revision, transaction) {
    return transaction.effects.some((effect) => effect.is(refresh_blocks))
      ? revision + 1
      : revision;
  },
});

// Enter at the end of an opening fence that is still being typed starts the
// body and moves focus into it before the next key. An unclosed fence with
// text below would swallow the rest of the note, so it gets a closing fence.
function start_code_body(context: KeyContext): boolean {
  const { state } = context;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) return false;
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;
  const block = get_blocks(state).find(
    (candidate) =>
      candidate.from === line.from &&
      candidate.construct.name === construct_name,
  );
  if (!block) return false;
  const source = read_code_block(state, block.from, block.to);
  if (
    !source ||
    (is_block_rendered(state, block) && !source.needs_opening_newline)
  )
    return false;
  const prefix = source.continuation_prefix;
  const has_text_below =
    source.closing_from === null && line.to < state.doc.length;
  const insert =
    "\n" + prefix + (has_text_below ? "\n" + prefix + source.fence : "");
  context.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + 1 + prefix.length },
    effects: finish_block_construction.of(null),
    userEvent: "input",
  });
  focus_selection(context.view);
  return true;
}

// Mod-Alt-c turns the selected paragraphs or headings into code blocks with
// their displayed text. The fence is longer than any backtick run inside.
function convert_to_code_block(view: EditorView): boolean {
  const blocks = selected_blocks(view).filter(
    (block) => !is_first_list_paragraph(block.node),
  );
  if (!blocks.length) return false;
  const changes: ChangeSpec[] = [];
  const projections: {
    block: TextBlock;
    text: string;
    content_changes: ChangeSet;
    offset: number;
  }[] = [];
  for (const block of blocks) {
    const { text, content_changes } = code_content(
      view.state,
      block,
      view.dom.ownerDocument,
    );
    let longest_run = 2;
    for (const run of text.matchAll(/`+/g))
      longest_run = Math.max(longest_run, run[0].length);
    const fence = "`".repeat(longest_run + 1);
    const content = text
      .split("\n")
      .map((line) => block.prefix + line)
      .join("\n");
    changes.push({
      from: block.from,
      to: block.to,
      insert: `${fence}\n${content}\n${block.prefix}${fence}`,
    });
    projections.push({
      block,
      text,
      content_changes,
      offset: fence.length + 1 + block.prefix.length,
    });
  }
  const change_set = view.state.changes(changes);
  const map_position = (position: number) => {
    const projection = projections.find(
      ({ block }) => position >= block.from && position <= block.to,
    );
    if (!projection) return change_set.mapPos(position);
    const { block, text, content_changes, offset } = projection;
    const content_position = content_changes.mapPos(position - block.from);
    const preceding_lines =
      text.slice(0, content_position).split("\n").length - 1;
    return (
      change_set.mapPos(block.from, -1) +
      offset +
      content_position +
      preceding_lines * block.prefix.length
    );
  };
  view.dispatch({
    changes: change_set,
    selection: EditorSelection.create(
      view.state.selection.ranges.map((range) =>
        EditorSelection.range(
          map_position(range.anchor),
          map_position(range.head),
        ),
      ),
      view.state.selection.mainIndex,
    ),
    userEvent: "input.format.block",
  });
  if (!focus_selection(view)) view.focus();
  return true;
}

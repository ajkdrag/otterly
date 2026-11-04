import {
  ChangeSet,
  EditorSelection,
  StateField,
  type ChangeSpec,
  type EditorState,
  type Line,
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
import { is_rich } from "../../core/editor_mode.js";
import type { KeyContext } from "../../core/keys.js";
import type { BlockConstruct, MarkdownPlugin } from "../../core/plugin.js";
import { focus_selection } from "../../core/surface.js";
import {
  code_content,
  is_first_list_paragraph,
  selected_blocks_by_range,
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

// Mod-Alt-c turns each selection range into one code block, from its first
// paragraph or heading to its last:
//
//   > one              > ```
//   >          ->      > one
//   > **two**          >
//                      > two
//                      > ```
//
// Paragraphs and headings with the first block's container prefix become
// their displayed text. Every other line in between (blank lines, list items,
// a nested quote) is copied as source without that prefix. A line that lacks
// the prefix ends the fence, and the next block starts another one. So does
// a block with another prefix when no block with the first prefix follows.
export function convert_to_code_block(view: EditorView): boolean {
  const { state } = view;
  const fences = fence_spans(state, selected_block_spans(view));
  if (!fences.length) return false;
  // Source mode shows the Markdown text, so that text goes into the fence.
  // Without a node code_content only strips the container prefixes.
  const rich = is_rich(state);
  const changes: ChangeSpec[] = [];
  const projections: {
    from: number;
    to: number;
    pieces: FencePiece[];
    line_starts: number[];
  }[] = [];
  for (const fence_span of fences) {
    const { prefix } = fence_span;
    const pieces: FencePiece[] = [];
    const body: string[] = [];
    for (const part of fence_span.parts) {
      const piece =
        "line" in part
          ? raw_line_piece(part.line, prefix)
          : {
              from: part.from,
              to: part.to,
              ...code_content(
                state,
                rich ? part : { ...part, node: null },
                view.dom.ownerDocument,
              ),
            };
      pieces.push({ ...piece, first_line: body.length });
      body.push(...piece.text.split("\n"));
    }
    let longest_run = 2;
    for (const run of body.join("\n").matchAll(/`+/g))
      longest_run = Math.max(longest_run, run[0].length);
    const fence = "`".repeat(longest_run + 1);
    let insert = fence;
    const line_starts: number[] = [];
    for (const line of body) {
      insert += "\n" + (line ? prefix : prefix.trimEnd());
      line_starts.push(insert.length);
      insert += line;
    }
    insert += `\n${prefix}${fence}`;
    changes.push({ from: fence_span.from, to: fence_span.to, insert });
    projections.push({
      from: fence_span.from,
      to: fence_span.to,
      pieces,
      line_starts,
    });
  }
  const change_set = state.changes(changes);
  // Positions inside converted text land on the same displayed character in
  // the code, so the selection and its direction survive (FMT-007).
  const map_position = (position: number) => {
    const projection = projections.find(
      ({ from, to }) => position >= from && position <= to,
    );
    if (!projection) return change_set.mapPos(position);
    const { pieces, line_starts } = projection;
    const piece = [...pieces]
      .reverse()
      .find((candidate) => candidate.from <= position);
    if (!piece) return change_set.mapPos(position);
    const content_position = piece.content_changes.mapPos(
      Math.min(position, piece.to) - piece.from,
    );
    const before = piece.text.slice(0, content_position);
    const line_index = piece.first_line + before.split("\n").length - 1;
    const column = before.length - (before.lastIndexOf("\n") + 1);
    return (
      change_set.mapPos(projection.from, -1) +
      (line_starts[line_index] ?? 0) +
      column
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

// One piece of fence content: a converted block or a raw source line.
// `content_changes` maps source offsets in the piece to offsets in `text`.
type FencePiece = {
  from: number;
  to: number;
  text: string;
  content_changes: ChangeSet;
  first_line: number;
};

type FenceSpan = {
  from: number;
  to: number;
  prefix: string;
  parts: (TextBlock | { line: Line })[];
};

// The eligible blocks of each selection range. Ranges whose blocks overlap,
// such as two carets in one paragraph, merge into one list so their fences
// cannot overlap.
function selected_block_spans(view: EditorView): TextBlock[][] {
  const groups = selected_blocks_by_range(view)
    .map((group) =>
      group.filter(
        (block) =>
          !is_first_list_paragraph(block.node) &&
          !is_callout_title(view.state, block),
      ),
    )
    .filter((group) => group.length)
    .sort((left, right) => (left[0]?.from ?? 0) - (right[0]?.from ?? 0));
  const merged: TextBlock[][] = [];
  for (const group of groups) {
    const previous = merged.at(-1);
    const previous_end = previous?.at(-1)?.to ?? -1;
    if (!previous || (group[0]?.from ?? 0) > previous_end) {
      merged.push(group);
      continue;
    }
    const blocks = new Map(previous.map((block) => [block.from, block]));
    for (const block of group) blocks.set(block.from, block);
    merged[merged.length - 1] = [...blocks.values()].sort(
      (left, right) => left.from - right.from,
    );
  }
  return merged;
}

// "> [!note] Title" opens a callout. Its paragraph would lose the "[!note]"
// marker in code_content and the callout would become a plain quote, so it
// stays as it is.
// @Incomplete: body lines directly under the title share its paragraph, so
// they do not convert either. Only a body after a ">" blank row converts.
function is_callout_title(state: EditorState, block: TextBlock): boolean {
  const quote = block.node?.parent;
  return (
    quote?.name === "Blockquote" &&
    state.doc.lineAt(quote.from).number ===
      state.doc.lineAt(block.from).number &&
    /^\[![A-Za-z]+\]/.test(state.sliceDoc(block.from, block.to))
  );
}

function fence_spans(
  state: EditorState,
  block_groups: TextBlock[][],
): FenceSpan[] {
  const spans: FenceSpan[] = [];
  for (const blocks of block_groups) {
    const first = blocks[0];
    const last = blocks.at(-1);
    if (!first || !last) continue;
    const by_first_line = new Map(
      blocks.map((block) => [state.doc.lineAt(block.from).number, block]),
    );
    let span: FenceSpan | null = null;
    // Raw lines after the span's last block. They join the span only when
    // another block with its prefix follows.
    let pending: { line: Line }[] = [];
    const end = state.doc.lineAt(last.to).number;
    for (let number = state.doc.lineAt(first.from).number; number <= end; ) {
      const line = state.doc.line(number);
      const block = by_first_line.get(number);
      if (block && (!span || block.prefix === span.prefix)) {
        if (!span)
          span = {
            from: block.from,
            to: block.to,
            prefix: block.prefix,
            parts: [],
          };
        span.parts.push(...pending, block);
        span.to = block.to;
        pending = [];
        number = state.doc.lineAt(block.to).number + 1;
        continue;
      }
      // A block with another prefix only rides along as raw lines when a
      // block with the span's prefix comes after it. Otherwise it would be
      // dropped, so it starts its own fence instead.
      if (
        block &&
        span &&
        !blocks.some(
          (later) => later.from > block.from && later.prefix === span?.prefix,
        )
      ) {
        spans.push(span);
        span = null;
        pending = [];
        continue;
      }
      if (span && !has_prefix(line.text, span.prefix)) {
        spans.push(span);
        span = null;
        pending = [];
        continue;
      }
      if (span) pending.push({ line });
      number++;
    }
    if (span) spans.push(span);
  }
  return spans;
}

// A blank row of a quote is often ">" without the trailing space.
function has_prefix(text: string, prefix: string) {
  return text.startsWith(prefix) || text.trimEnd() === prefix.trimEnd();
}

function raw_line_piece(line: Line, prefix: string) {
  const prefix_length = line.text.startsWith(prefix)
    ? prefix.length
    : line.text.length;
  return {
    from: line.from,
    to: line.to,
    text: line.text.slice(prefix_length),
    content_changes: ChangeSet.of({ from: 0, to: prefix_length }, line.length),
  };
}

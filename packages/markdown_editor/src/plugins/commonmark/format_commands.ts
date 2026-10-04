import {
  ChangeSet,
  EditorSelection,
  StateEffect,
  StateField,
  Transaction,
  type ChangeSpec,
  EditorState,
  type SelectionRange,
  type StateCommand,
} from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { KeyBinding } from "@codemirror/view";
import { is_literal } from "../../core/context.js";

export const toggle_bold = toggle_inline_mark("StrongEmphasis", "**");
export const toggle_italic = toggle_inline_mark("Emphasis", "*");
export const toggle_strikethrough = toggle_inline_mark("Strikethrough", "~~");
export const toggle_inline_code = toggle_inline_mark("InlineCode", "`");

export const format_keys: readonly KeyBinding[] = [
  { key: "Mod-b", run: toggle_bold },
  { key: "Mod-i", run: toggle_italic },
  { key: "Mod-e", run: toggle_inline_code },
];

export const strikethrough_keys: readonly KeyBinding[] = [
  { key: "Mod-Shift-x", run: toggle_strikethrough },
  { key: "Mod-Alt-x", run: toggle_strikethrough },
];

function toggle_inline_mark(node_name: string, marker: string): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;
    const last_range =
      state.selection.ranges[state.selection.ranges.length - 1];
    if (!last_range) return false;
    const tree = ensureSyntaxTree(state, last_range.to, 50);
    // An unfinished parse cannot establish whether the selection is literal.
    if (!tree) return false;
    for (const range of state.selection.ranges) {
      if (is_literal(state, range.from) && node_name !== "InlineCode")
        return false;
      let literal = false;
      tree.iterate({
        from: range.from,
        to: range.to,
        enter(node) {
          const overlaps = range.empty
            ? node.from <= range.from && node.to > range.from
            : node.from < range.to && node.to > range.from;
          if (!overlaps) return false;
          if (node.name === "FencedCode" || node.name === "CodeBlock")
            literal = true;
          if (
            node.name === "InlineCode" &&
            !(
              node_name === "InlineCode" &&
              ((node.from <= range.from && node.to >= range.to) ||
                (range.from <= node.from && range.to >= node.to))
            )
          )
            literal = true;
          return !literal;
        },
      });
      if (literal) return false;
    }
    if (state.selection.ranges.every((range) => range.empty)) {
      if (node_name === "InlineCode") return false;
      return toggle_typing_format(state, dispatch, node_name, marker);
    }
    const removed = new Set<string>();
    const removals = state.selection.ranges.map((range) =>
      selected_mark_changes(state, range, node_name, removed),
    );
    const remove_marks = removals.some((changes) => changes.length > 0);
    let range_index = 0;
    const change = state.changeByRange((range) => {
      const removal = removals[range_index++] ?? [];
      if (remove_marks) {
        const changes = state.changes(removal);
        return { changes, range: range.map(changes) };
      }
      const blocks = selected_text_blocks(state, range);
      const changes: ChangeSpec[] = [];
      for (const block of blocks) {
        const wrapped = wrap_selection(state, block, marker);
        if (wrapped.changes) changes.push(wrapped.changes);
      }
      if (blocks.length <= 1)
        return wrap_selection(state, blocks[0] ?? range, marker);
      const block_changes = state.changes(changes);
      return {
        changes: block_changes,
        range: EditorSelection.range(
          block_changes.mapPos(
            range.anchor,
            range.anchor <= range.head ? 1 : -1,
          ),
          block_changes.mapPos(range.head, range.anchor <= range.head ? -1 : 1),
        ),
      };
    });
    if (change.changes.empty) return false;
    dispatch(
      state.update(change, { userEvent: "input.format", scrollIntoView: true }),
    );
    return true;
  };
}

function find_enclosing_delimiters(
  state: EditorState,
  range: SelectionRange,
  node_name: string,
) {
  let node = syntaxTree(state).resolveInner(range.from, 1);
  while (node.parent) {
    if (node.name === node_name && node.to >= range.to) {
      const opening = node.firstChild;
      const closing = node.lastChild;
      if (!opening || !closing || opening === closing) return null;
      let content_from = opening.to;
      let content_to = closing.from;
      const text = state.sliceDoc(content_from, content_to);
      // CommonMark strips one padding space on each side of a code span,
      // except when its entire content consists of spaces.
      if (
        node_name === "InlineCode" &&
        /^ .* $/s.test(text) &&
        /[^ \r\n]/.test(text)
      ) {
        content_from++;
        content_to--;
      }
      return { from: opening.from, to: closing.to, content_from, content_to };
    }
    node = node.parent;
  }
  return null;
}

function wrap_selection(
  state: EditorState,
  range: SelectionRange,
  marker: string,
) {
  const selected = state.sliceDoc(range.from, range.to);
  const text = marker === "`" ? selected : selected.trim();
  if (!range.empty && !text) return { range };
  const from =
    range.from +
    (marker === "`" ? 0 : selected.length - selected.trimStart().length);
  const to = from + text.length;
  let delimiter = marker;
  let padding = "";
  if (marker === "`") {
    let longest_run = 0;
    for (const run of text.matchAll(/`+/g))
      longest_run = Math.max(longest_run, run[0].length);
    delimiter = "`".repeat(longest_run + 1);
    if (/^`|`$/.test(text) || (/^ .* $/s.test(text) && /[^ \r\n]/.test(text)))
      padding = " ";
  }
  const opening = delimiter + padding;
  const content_from = from + opening.length;
  const content_to = to + opening.length;
  return {
    changes: [
      { from, insert: opening },
      { from: to, insert: padding + delimiter },
    ],
    range:
      range.anchor <= range.head
        ? EditorSelection.range(content_from, content_to)
        : EditorSelection.range(content_to, content_from),
  };
}

function selected_mark_changes(
  state: EditorState,
  range: SelectionRange,
  node_name: string,
  removed: Set<string>,
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  function add_change(from: number, to: number, insert = "") {
    const key = `${String(from)}:${String(to)}:${insert}`;
    if (!removed.has(key)) {
      changes.push({ from, to, insert });
      removed.add(key);
    }
  }
  syntaxTree(state).iterate({
    from: range.from,
    to: range.to,
    enter(node) {
      if (
        node.name !== node_name ||
        node.from >= range.to ||
        node.to <= range.from
      )
        return;
      const marks = find_enclosing_delimiters(
        state,
        EditorSelection.range(node.from, node.to),
        node_name,
      );
      if (!marks) return false;
      const from = Math.max(range.from, marks.content_from);
      const to = Math.min(range.to, marks.content_to);
      if (from >= to) return false;
      const prefix = state.sliceDoc(marks.content_from, from);
      const suffix = state.sliceDoc(to, marks.content_to);
      if (!prefix.trim()) add_change(marks.from, marks.content_from);
      else
        add_change(
          from - (prefix.length - prefix.trimEnd().length),
          from - (prefix.length - prefix.trimEnd().length),
          state.sliceDoc(marks.content_to, marks.to),
        );
      if (!suffix.trim()) add_change(marks.content_to, marks.to);
      else
        add_change(
          to + (suffix.length - suffix.trimStart().length),
          to + (suffix.length - suffix.trimStart().length),
          state.sliceDoc(marks.from, marks.content_from),
        );
      return false;
    },
  });
  return changes;
}

function selected_text_blocks(state: EditorState, range: SelectionRange) {
  const blocks: SelectionRange[] = [];
  syntaxTree(state).iterate({
    from: range.from,
    to: range.to,
    enter(node) {
      if (!/^(Paragraph|(?:ATX|Setext)Heading[1-6]|TableCell)$/.test(node.name))
        return;
      let from = Math.max(node.from, range.from);
      let to = Math.min(node.to, range.to);
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "HeaderMark") continue;
        if (child.from === node.from) from = Math.max(from, child.to);
        else to = Math.min(to, child.from);
      }
      if (from < to)
        blocks.push(
          range.anchor <= range.head
            ? EditorSelection.range(from, to)
            : EditorSelection.range(to, from),
        );
      return false;
    },
  });
  return blocks;
}

type TypingFormat = { node_name: string; marker: string; enabled: boolean };
type TypingCursor = { at: number; formats: readonly TypingFormat[] };
const set_typing_formats = StateEffect.define<readonly TypingCursor[]>();
const typing_formats = StateField.define<readonly TypingCursor[]>({
  create: () => [],
  update(cursors, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(set_typing_formats)) return effect.value;
    }
    if (transaction.isUserEvent("input.format")) return [];
    // Typing and deleting at the pending caret keep the pending formats.
    // Backspace is a "delete" event, and deleting the last formatted
    // character must still remove the generated markers.
    if (transaction.isUserEvent("input") || transaction.isUserEvent("delete")) {
      return cursors.map((cursor, index) => ({
        ...cursor,
        at:
          transaction.newSelection.ranges[index]?.head ??
          transaction.changes.mapPos(cursor.at),
      }));
    }
    // Like ProseMirror stored marks, formatting for future input belongs to
    // the current selection. Moving the caret or undoing clears it.
    if (transaction.selection || transaction.docChanged) return [];
    return cursors;
  },
});

function toggle_typing_format(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  node_name: string,
  marker: string,
): boolean {
  const previous = state.field(typing_formats, false) ?? [];
  const cursors = state.selection.ranges.map((range) => {
    const formats =
      previous.find((cursor) => cursor.at === range.head)?.formats ?? [];
    const existing = formats.find((format) => format.node_name === node_name);
    const enabled =
      existing?.enabled ?? !!find_enclosing_delimiters(state, range, node_name);
    return {
      at: range.head,
      formats: [
        ...formats.filter((format) => format.node_name !== node_name),
        { node_name, marker, enabled: !enabled },
      ],
    };
  });
  dispatch(
    state.update({
      effects: [
        ...(state.field(typing_formats, false)
          ? []
          : [StateEffect.appendConfig.of(typing_extensions)]),
        set_typing_formats.of(cursors),
      ],
      annotations: Transaction.addToHistory.of(false),
    }),
  );
  return true;
}

const typing_filter = EditorState.transactionFilter.of((transaction) => {
  if (
    !(transaction.isUserEvent("input") || transaction.isUserEvent("delete")) ||
    transaction.isUserEvent("input.format") ||
    transaction.startState.readOnly
  )
    return transaction;
  const cursors = transaction.startState.field(typing_formats, false) ?? [];
  if (!cursors.length) return transaction;
  const changes: ChangeSpec[] = [];
  const input_ends = new Map<number, number>();
  transaction.changes.iterChanges((from, to, from_new, to_new, inserted) => {
    const cursor = cursors.find(
      (item) => item.at === (inserted.length ? from : to),
    );
    if (!cursor) return;
    const formats = cursor.formats.map((format) => ({
      ...format,
      enclosing: find_enclosing_delimiters(
        transaction.startState,
        EditorSelection.cursor(cursor.at),
        format.node_name,
      ),
    }));
    const syntax_ranges = formats
      .flatMap(({ enclosing }) =>
        enclosing
          ? [
              { from: enclosing.from, to: enclosing.content_from },
              { from: enclosing.content_to, to: enclosing.to },
            ]
          : [],
      )
      .sort((left, right) => left.from - right.from);
    if (!inserted.length && from < to) {
      for (const { enclosing } of formats) {
        if (
          enclosing &&
          from >= enclosing.content_from &&
          to <= enclosing.content_to &&
          contains_only_delimiters(
            enclosing.content_from,
            from,
            syntax_ranges,
          ) &&
          contains_only_delimiters(to, enclosing.content_to, syntax_ranges)
        ) {
          changes.push({
            from: transaction.changes.mapPos(enclosing.from),
            to: transaction.changes.mapPos(enclosing.content_from),
          });
          changes.push({
            from: transaction.changes.mapPos(enclosing.content_to),
            to: transaction.changes.mapPos(enclosing.to),
          });
        }
      }
      return;
    }
    if (from !== to || !inserted.length) return;
    const nested_exit = change_nested_typing_format(
      transaction,
      cursor,
      from_new,
      to_new,
      inserted.toString(),
    );
    if (nested_exit) {
      changes.push(...nested_exit);
      input_ends.set(from, to_new);
      return;
    }
    let before = "";
    let after = "";
    let opening_marks = "";
    let closing_marks = "";
    const text = inserted.toString();
    const moved_closings: { from: number; text: string }[] = [];
    for (const format of formats) {
      const enclosing = format.enclosing;
      const inside =
        enclosing &&
        from >= enclosing.content_from &&
        from <= enclosing.content_to;
      if (format.enabled) {
        if (!inside) {
          opening_marks += format.marker;
          closing_marks = format.marker + closing_marks;
        } else if (
          contains_only_delimiters(from, enclosing.content_to, syntax_ranges) &&
          /\s$/.test(text)
        ) {
          changes.push({
            from: transaction.changes.mapPos(enclosing.content_to, 1),
            to: transaction.changes.mapPos(enclosing.to, 1),
          });
          moved_closings.push({
            from: enclosing.content_to,
            text: transaction.startState.sliceDoc(
              enclosing.content_to,
              enclosing.to,
            ),
          });
        }
      } else if (inside) {
        const opening = transaction.startState.sliceDoc(
          enclosing.from,
          enclosing.content_from,
        );
        const closing = transaction.startState.sliceDoc(
          enclosing.content_to,
          enclosing.to,
        );
        if (from === enclosing.content_from) {
          changes.push({
            from: transaction.changes.mapPos(enclosing.from, -1),
            to: from_new,
          });
        } else before += closing;
        if (from === enclosing.content_to) {
          changes.push({
            from: to_new,
            to: transaction.changes.mapPos(enclosing.to, 1),
          });
        } else after = opening + after;
      }
    }
    if (moved_closings.length) {
      moved_closings.sort((left, right) => left.from - right.from);
      changes.push({
        from: to_new - (text.length - text.trimEnd().length),
        insert: moved_closings.map((closing) => closing.text).join(""),
      });
    }
    if (opening_marks) {
      let offset = from_new;
      for (const part of text.split(/(\n[ \t]*\n)/)) {
        const content = part.trim();
        if (content) {
          const start = offset + part.length - part.trimStart().length;
          changes.push({ from: start, insert: opening_marks });
          changes.push({ from: start + content.length, insert: closing_marks });
        }
        offset += part.length;
      }
    }
    if (before) changes.push({ from: from_new, insert: before });
    if (after) changes.push({ from: to_new, insert: after });
    input_ends.set(from, to_new);
  });
  if (!changes.length) return transaction;
  const formatting = ChangeSet.of(changes, transaction.newDoc.length);
  const selection = EditorSelection.create(
    transaction.newSelection.ranges.map((range, index) => {
      const original = transaction.startState.selection.ranges[index];
      const input_end = original ? input_ends.get(original.head) : undefined;
      if (input_end !== undefined)
        return EditorSelection.cursor(formatting.mapPos(input_end, -1));
      return range.map(formatting);
    }),
    transaction.newSelection.mainIndex,
  );
  // Keep the original input transaction and its annotations. Syntax and text
  // enter history together, so undo never exposes a half-formatted insertion.
  return [transaction, { changes: formatting, selection, sequential: true }];
});
// Pending formats for the next typed text, like ProseMirror's stored marks.
export const typing_format_extension = [typing_formats, typing_filter];
const typing_extensions = typing_format_extension;

function contains_only_delimiters(
  from: number,
  to: number,
  ranges: readonly { from: number; to: number }[],
): boolean {
  let position = from;
  for (const range of ranges) {
    if (range.to <= position) continue;
    if (range.from > position) break;
    position = range.to;
    if (position >= to) return true;
  }
  return position >= to;
}

function change_nested_typing_format(
  transaction: Transaction,
  cursor: TypingCursor,
  from_new: number,
  to_new: number,
  text: string,
): ChangeSpec[] | null {
  const state = transaction.startState;
  const active: {
    node_name: string;
    opening: string;
    closing: string;
    from: number;
    to: number;
    content_from: number;
    content_to: number;
  }[] = [];
  let node = syntaxTree(state).resolveInner(cursor.at, 1);
  while (node.parent) {
    if (["StrongEmphasis", "Emphasis", "Strikethrough"].includes(node.name)) {
      const marks = find_enclosing_delimiters(
        state,
        EditorSelection.range(node.from, node.to),
        node.name,
      );
      if (
        marks &&
        cursor.at >= marks.content_from &&
        cursor.at <= marks.content_to
      )
        active.unshift({
          ...marks,
          node_name: node.name,
          opening: state.sliceDoc(marks.from, marks.content_from),
          closing: state.sliceDoc(marks.content_to, marks.to),
        });
    }
    node = node.parent;
  }
  if (
    active.length < 2 ||
    !active.some((mark) =>
      cursor.formats.some(
        (format) => format.node_name === mark.node_name && !format.enabled,
      ),
    )
  )
    return null;
  const desired = active.filter(
    (mark) =>
      !cursor.formats.some(
        (format) => format.node_name === mark.node_name && !format.enabled,
      ),
  );
  let shared = 0;
  while (shared < active.length && active[shared] === desired[shared]) shared++;
  const previous = active.slice(shared);
  const next = desired.slice(shared);
  const syntax_ranges = active
    .flatMap((mark) => [
      { from: mark.from, to: mark.content_from },
      { from: mark.content_to, to: mark.to },
    ])
    .sort((left, right) => left.from - right.from);
  const changes: ChangeSpec[] = [];
  let before = "";
  let after = "";
  for (const mark of [...previous].reverse()) {
    if (contains_only_delimiters(mark.content_from, cursor.at, syntax_ranges))
      changes.push({
        from: transaction.changes.mapPos(mark.from, -1),
        to: transaction.changes.mapPos(mark.content_from, -1),
      });
    else before += mark.closing;
  }
  for (const mark of previous) {
    if (contains_only_delimiters(cursor.at, mark.content_to, syntax_ranges))
      changes.push({
        from: transaction.changes.mapPos(mark.content_to, 1),
        to: transaction.changes.mapPos(mark.to, 1),
      });
    else after += mark.opening;
  }
  if (before) changes.push({ from: from_new, insert: before });
  const content = text.trim();
  if (content && next.length) {
    const start = from_new + text.length - text.trimStart().length;
    changes.push({
      from: start,
      insert: next.map((mark) => mark.opening).join(""),
    });
    changes.push({
      from: start + content.length,
      insert: [...next]
        .reverse()
        .map((mark) => mark.closing)
        .join(""),
    });
  }
  if (after) changes.push({ from: to_new, insert: after });
  return changes;
}

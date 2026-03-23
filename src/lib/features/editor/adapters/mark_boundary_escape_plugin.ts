import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Mark } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const ESCAPE_MARK_NAMES = new Set([
  "link",
  "inlineCode",
  "code_inline",
  "strike_through",
]);

type MarkBoundaryEscapeMeta = { action: "arm" | "clear" | "sync" };
type MarkBoundaryEscapeState = { active: boolean };

export const mark_boundary_escape_plugin_key =
  new PluginKey<MarkBoundaryEscapeState>("mark-boundary-escape");

function get_mark_key(mark: Mark): string {
  return `${mark.type.name}:${JSON.stringify(mark.attrs)}`;
}

function same_mark(left: Mark, right: Mark): boolean {
  return get_mark_key(left) === get_mark_key(right);
}

function merge_marks(...groups: ReadonlyArray<readonly Mark[]>): Mark[] {
  const marks = new Map<string, Mark>();
  for (const group of groups) {
    for (const mark of group) {
      marks.set(get_mark_key(mark), mark);
    }
  }
  return [...marks.values()];
}

function get_adjacent_marks(state: EditorState): {
  before: readonly Mark[];
  after: readonly Mark[];
} {
  const { selection } = state;
  const { parent, parentOffset } = selection.$from;
  const before = parent.childBefore(parentOffset).node?.marks ?? [];
  const after = parent.childAfter(parentOffset).node?.marks ?? [];
  return { before, after };
}

function get_boundary_escape_marks(state: EditorState): {
  filtered: Mark[];
  removed: Mark[];
} | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { before, after } = get_adjacent_marks(state);
  const removed: Mark[] = [];

  for (const mark_name of ESCAPE_MARK_NAMES) {
    const before_mark = before.find((mark) => mark.type.name === mark_name);
    const after_mark = after.find((mark) => mark.type.name === mark_name);

    if (!before_mark && !after_mark) continue;
    if (before_mark && after_mark && same_mark(before_mark, after_mark))
      continue;

    if (before_mark) removed.push(before_mark);
    if (after_mark) removed.push(after_mark);
  }

  if (removed.length === 0) return null;

  const removed_keys = new Set(removed.map(get_mark_key));
  const filtered = merge_marks(before, after).filter(
    (mark) => !removed_keys.has(get_mark_key(mark)),
  );

  return { filtered, removed };
}

function same_mark_set(
  left: readonly Mark[] | null,
  right: readonly Mark[],
): boolean {
  if ((left?.length ?? 0) !== right.length) return false;

  const left_keys = new Set((left ?? []).map(get_mark_key));
  return right.every((mark) => left_keys.has(get_mark_key(mark)));
}

function has_external_selection_change(
  transactions: readonly {
    selectionSet: boolean;
    docChanged: boolean;
    getMeta: (key: PluginKey) => unknown;
  }[],
): boolean {
  return transactions.some(
    (transaction) =>
      transaction.getMeta(mark_boundary_escape_plugin_key) === undefined &&
      transaction.selectionSet &&
      !transaction.docChanged,
  );
}

function has_external_stored_mark_change(
  transactions: readonly {
    storedMarksSet: boolean;
    getMeta: (key: PluginKey) => unknown;
  }[],
): boolean {
  return transactions.some(
    (transaction) =>
      transaction.getMeta(mark_boundary_escape_plugin_key) === undefined &&
      transaction.storedMarksSet,
  );
}

function clear_escape_mode(state: EditorState) {
  return state.tr
    .setMeta(mark_boundary_escape_plugin_key, { action: "clear" })
    .setStoredMarks(null);
}

export function create_mark_boundary_escape_prose_plugin() {
  return new Plugin<MarkBoundaryEscapeState>({
    key: mark_boundary_escape_plugin_key,
    state: {
      init: () => ({ active: false }),
      apply: (transaction, previous) => {
        const meta = transaction.getMeta(mark_boundary_escape_plugin_key) as
          | MarkBoundaryEscapeMeta
          | undefined;

        if (meta?.action === "arm") return { active: true };
        if (meta?.action === "clear") return { active: false };
        return previous;
      },
    },
    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (event.key !== "Escape") return false;

        const escape_marks = get_boundary_escape_marks(view.state);
        if (!escape_marks) return false;

        event.preventDefault();

        const transaction = view.state.tr
          .setMeta(mark_boundary_escape_plugin_key, { action: "arm" })
          .setStoredMarks(escape_marks.filtered);

        view.dispatch(transaction);
        return true;
      },
    },
    appendTransaction(transactions, _old_state, new_state) {
      const plugin_state = mark_boundary_escape_plugin_key.getState(new_state);
      if (!plugin_state?.active) return null;

      if (!new_state.selection.empty) return clear_escape_mode(new_state);
      if (has_external_selection_change(transactions)) {
        return clear_escape_mode(new_state);
      }
      if (has_external_stored_mark_change(transactions)) {
        return clear_escape_mode(new_state);
      }

      const escape_marks = get_boundary_escape_marks(new_state);
      if (!escape_marks) return clear_escape_mode(new_state);
      if (same_mark_set(new_state.storedMarks, escape_marks.filtered)) {
        return null;
      }

      return new_state.tr
        .setMeta(mark_boundary_escape_plugin_key, { action: "sync" })
        .setStoredMarks(escape_marks.filtered);
    },
  });
}

export const mark_boundary_escape_plugin = $prose(() =>
  create_mark_boundary_escape_prose_plugin(),
);

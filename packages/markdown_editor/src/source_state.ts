import { history, redo, undo, isolateHistory } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  Facet,
  StateEffect,
  StateField,
  Text,
  Transaction,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

type PositionMap = {
  crlf_raw_starts: number[];
  crlf_visible_starts: number[];
  raw_to_visible: (position: number) => number;
  visible_to_raw: (position: number) => number;
};

type MarkdownSourceState = {
  raw_state: EditorState;
  position_map: PositionMap;
  preferred_ending: string;
};

type SourceConfig = { raw_source: string };

const source_config = Facet.define<SourceConfig, SourceConfig>({
  combine(values) {
    return values[0] ?? { raw_source: "" };
  },
});
const set_raw_history_state = StateEffect.define<EditorState>();
const raw_paste = StateEffect.define<{ raw_text: string }>();

export function create_markdown_state(
  raw_source: string,
  extensions: Extension = [],
) {
  return EditorState.create({
    doc: normalize_line_endings(raw_source),
    extensions: [
      EditorState.lineSeparator.of("\n"),
      source_config.of({ raw_source }),
      markdown_source_field,
      extensions,
    ],
  });
}

export function get_markdown_source(state: EditorState) {
  return state.field(markdown_source_field).raw_state.doc.toString();
}

export function get_markdown_source_document(state: EditorState) {
  return state.field(markdown_source_field).raw_state.doc;
}

export function insert_markdown_source(view: EditorView, raw_text: string) {
  if (view.state.readOnly) return;
  const inserted = normalize_line_endings(raw_text);
  const change = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: inserted },
    range: EditorSelection.cursor(range.from + inserted.length),
  }));
  view.dispatch({
    changes: change.changes,
    selection: change.selection,
    effects: raw_paste.of({ raw_text }),
    annotations: Transaction.userEvent.of("input.paste"),
  });
}

export const source_undo: StateCommand = create_source_history_command(undo);
export const source_redo: StateCommand = create_source_history_command(redo);

const markdown_source_field = StateField.define<MarkdownSourceState>({
  create(state) {
    const raw_source = state.facet(source_config).raw_source;
    const position_map = create_position_map(raw_source);
    return {
      raw_state: EditorState.create({
        doc: Text.of(raw_source.split("\n")),
        selection: map_selection(state.selection, position_map.visible_to_raw),
        extensions: [EditorState.lineSeparator.of("\n"), history()],
      }),
      position_map,
      preferred_ending: raw_source.match(/\r\n|\r|\n/)?.[0] ?? "\n",
    };
  },
  update(value, transaction) {
    const history_state = transaction.effects.find((effect) =>
      effect.is(set_raw_history_state),
    );
    if (history_state) {
      const previous_raw_source = history_state.value.doc.toString();
      return {
        ...value,
        raw_state: history_state.value,
        position_map: create_position_map(previous_raw_source),
      };
    }

    if (!transaction.docChanged) {
      if (!transaction.selection) return value;
      const raw_state = value.raw_state.update({
        selection: map_selection(
          transaction.newSelection,
          value.position_map.visible_to_raw,
        ),
        annotations: [Transaction.addToHistory.of(false)],
      }).state;
      return { ...value, raw_state };
    }

    const old_document = value.raw_state.doc;
    const raw_changes: { from: number; to: number; insert: string }[] = [];
    const paste = transaction.effects.find((effect) => effect.is(raw_paste));
    transaction.changes.iterChanges((from, to, _from_b, _to_b, inserted) => {
      const raw_from = value.position_map.visible_to_raw(from);
      const raw_to = value.position_map.visible_to_raw(to);
      const visible_insert = inserted.toString();
      const raw_insert =
        paste && normalize_line_endings(paste.value.raw_text) === visible_insert
          ? paste.value.raw_text
          : replace_visible_line_endings(
              visible_insert,
              value.preferred_ending,
            );
      raw_changes.push({
        from: raw_from,
        to: raw_to,
        insert: separate_line_ending_boundaries(
          raw_insert,
          old_document.sliceString(Math.max(0, raw_from - 1), raw_from),
          old_document.sliceString(
            raw_to,
            Math.min(old_document.length, raw_to + 1),
          ),
        ),
      });
    }, Boolean(paste));

    const source_changed = raw_changes.some(
      ({ from, to, insert }) => old_document.sliceString(from, to) !== insert,
    );
    const annotations = forward_history_annotations(transaction);
    const raw_state = value.raw_state.update({
      changes: source_changed ? raw_changes : [],
      annotations: source_changed
        ? annotations
        : [...annotations, Transaction.addToHistory.of(false)],
    }).state;
    const position_map =
      source_changed && !can_reuse_position_map(old_document, raw_changes)
        ? create_position_map(raw_state.doc.toString())
        : value.position_map;
    const selection = map_selection(
      transaction.newSelection,
      position_map.visible_to_raw,
    );
    const selected_raw_state = raw_state.update({
      selection,
      annotations: Transaction.addToHistory.of(false),
    }).state;
    return {
      ...value,
      raw_state: selected_raw_state,
      position_map,
    };
  },
});

function create_source_history_command(command: StateCommand): StateCommand {
  return (target) => {
    if (target.state.readOnly) return false;
    const source_state = target.state.field(markdown_source_field, false);
    if (!source_state) return false;

    let history_transaction: Transaction | undefined;
    const changed = command({
      get state() {
        return source_state.raw_state;
      },
      dispatch(transaction) {
        history_transaction = transaction;
      },
    });
    if (!changed || !history_transaction) return false;

    const old_source = source_state.raw_state.doc.toString();
    const new_source = history_transaction.state.doc.toString();
    const changes = history_projection_changes(
      old_source,
      new_source,
      history_transaction.changes,
      source_state.position_map,
    );
    const next_position_map = create_position_map(new_source);
    target.dispatch(
      target.state.update(
        {
          changes,
          selection: map_selection(
            history_transaction.state.selection,
            next_position_map.raw_to_visible,
          ),
          effects: set_raw_history_state.of(history_transaction.state),
          annotations: [
            Transaction.addToHistory.of(false),
            Transaction.userEvent.of("history"),
          ],
        },
        { filter: false },
      ),
    );
    return true;
  };
}

function create_position_map(raw_source: string): PositionMap {
  const crlf_raw_starts: number[] = [];
  const crlf_visible_starts: number[] = [];
  let raw_position = 0;
  let visible_position = 0;
  while (raw_position < raw_source.length) {
    if (
      raw_source[raw_position] === "\r" &&
      raw_source[raw_position + 1] === "\n"
    ) {
      crlf_raw_starts.push(raw_position);
      crlf_visible_starts.push(visible_position);
      raw_position += 2;
      visible_position++;
    } else {
      raw_position++;
      visible_position++;
    }
  }
  return {
    crlf_raw_starts,
    crlf_visible_starts,
    raw_to_visible(position) {
      return position - lower_bound(crlf_raw_starts, position);
    },
    visible_to_raw(position) {
      return position + lower_bound(crlf_visible_starts, position);
    },
  };
}

function lower_bound(values: readonly number[], value: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const middle_value = values[middle];
    if (middle_value !== undefined && middle_value < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function can_reuse_position_map(
  old_document: Text,
  changes: readonly { from: number; to: number; insert: string }[],
) {
  return changes.every(({ from, to, insert }) => {
    if (insert.length !== to - from || /[\r\n]/.test(insert)) return false;
    return !/[\r\n]/.test(old_document.sliceString(from, to));
  });
}

function normalize_line_endings(raw_source: string) {
  return raw_source.replace(/\r\n|\r|\n/g, "\n");
}

function replace_visible_line_endings(text: string, ending: string) {
  return text.replace(/\n/g, ending);
}

function separate_line_ending_boundaries(
  insert: string,
  before: string,
  after: string,
) {
  if (!insert && before === "\r" && after === "\n") return "\r";
  if (insert.startsWith("\n") && before === "\r") insert = `\r${insert}`;
  if (insert.endsWith("\r") && after === "\n") insert += "\n";
  return insert;
}

function forward_history_annotations(transaction: Transaction) {
  const annotations = [];
  const user_event = transaction.annotation(Transaction.userEvent);
  if (user_event !== undefined) {
    annotations.push(Transaction.userEvent.of(user_event));
  }
  const add_to_history = transaction.annotation(Transaction.addToHistory);
  if (add_to_history !== undefined) {
    annotations.push(Transaction.addToHistory.of(add_to_history));
  }
  const time = transaction.annotation(Transaction.time);
  if (time !== undefined) annotations.push(Transaction.time.of(time));
  const history_boundary = transaction.annotation(isolateHistory);
  if (history_boundary !== undefined) {
    annotations.push(isolateHistory.of(history_boundary));
  }
  return annotations;
}

function map_selection(
  selection: EditorSelection,
  map_position: (position: number) => number,
) {
  return EditorSelection.create(
    selection.ranges.map((range) =>
      EditorSelection.range(
        map_position(range.anchor),
        map_position(range.head),
        range.goalColumn,
        range.bidiLevel ?? undefined,
        range.assoc,
      ),
    ),
    selection.mainIndex,
  );
}

function history_projection_changes(
  previous_raw: string,
  next_raw: string,
  raw_changes: Transaction["changes"],
  previous_map: PositionMap,
) {
  const affected: { from: number; to: number }[] = [];
  raw_changes.iterChanges((from, to) => {
    let expanded_from = Math.max(0, from - 1);
    let expanded_to = Math.min(previous_raw.length, to + 1);
    if (
      expanded_from > 0 &&
      previous_raw[expanded_from - 1] === "\r" &&
      previous_raw[expanded_from] === "\n"
    ) {
      expanded_from--;
    }
    if (
      expanded_to < previous_raw.length &&
      previous_raw[expanded_to - 1] === "\r" &&
      previous_raw[expanded_to] === "\n"
    ) {
      expanded_to++;
    }
    const last = affected.at(-1);
    if (last && expanded_from <= last.to) {
      last.to = Math.max(last.to, expanded_to);
    } else {
      affected.push({ from: expanded_from, to: expanded_to });
    }
  });
  return affected.map(({ from, to }) => {
    const next_from = raw_changes.mapPos(from, -1);
    const next_to = raw_changes.mapPos(to, 1);
    return {
      from: previous_map.raw_to_visible(from),
      to: previous_map.raw_to_visible(to),
      insert: normalize_line_endings(next_raw.slice(next_from, next_to)),
    };
  });
}

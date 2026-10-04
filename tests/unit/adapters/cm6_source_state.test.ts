import { describe, expect, it, vi } from "vitest";
import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type StateCommand,
  Transaction,
} from "@codemirror/state";
import {
  create_markdown_state,
  get_markdown_source_document,
  get_markdown_source,
  insert_markdown_source,
  source_redo,
  source_undo,
} from "../../../packages/markdown_editor/src/source_state";
import { EditorView } from "@codemirror/view";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import {
  markdown_format_keymap,
  toggle_bold,
} from "../../../packages/markdown_editor/src/format_commands";

type CommandResult = { state: EditorState; handled: boolean };
type StressChange = { from: number; to?: number; insert?: string };

function run_command(state: EditorState, command: StateCommand): CommandResult {
  let next_state = state;
  const handled = command({
    get state() {
      return next_state;
    },
    dispatch(transaction) {
      next_state = transaction.state;
    },
  });
  return { state: next_state, handled };
}

function normalize(raw_source: string) {
  return raw_source.replace(/\r\n|\r|\n/g, "\n");
}

function raw_offset(raw_source: string, visible_position: number) {
  let raw_position = 0;
  let current_visible = 0;
  while (
    raw_position < raw_source.length &&
    current_visible < visible_position
  ) {
    if (raw_source[raw_position] === "\r") {
      raw_position += raw_source[raw_position + 1] === "\n" ? 2 : 1;
    } else {
      raw_position++;
    }
    current_visible++;
  }
  return raw_position;
}

function separate_boundary(insert: string, before: string, after: string) {
  if (!insert && before === "\r" && after === "\n") return "\r";
  if (insert.startsWith("\n") && before === "\r") insert = `\r${insert}`;
  if (insert.endsWith("\r") && after === "\n") insert += "\n";
  return insert;
}

function apply_expected_changes(
  raw_source: string,
  changes: readonly StressChange[],
  preferred_ending: string,
) {
  const visible_transaction = EditorState.create({
    doc: normalize(raw_source),
  }).update({ changes: changes as ChangeSpec[] });
  const raw_changes: { from: number; to: number; insert: string }[] = [];
  visible_transaction.changes.iterChanges(
    (from, to, _from_b, _to_b, inserted) => {
      const raw_from = raw_offset(raw_source, from);
      const raw_to = raw_offset(raw_source, to);
      raw_changes.push({
        from: raw_from,
        to: raw_to,
        insert: separate_boundary(
          inserted.toString().replace(/\n/g, preferred_ending),
          raw_source[raw_from - 1] ?? "",
          raw_source[raw_to] ?? "",
        ),
      });
    },
  );
  let result = raw_source;
  for (const change of raw_changes.reverse()) {
    result =
      result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  return result;
}

function generated_changes(document: string, next: (limit: number) => number) {
  const kind = next(6);
  const from = 3 + next(Math.max(1, document.length - 2));
  if (kind === 0 || from >= document.length) return [{ from, insert: "Q" }];
  if (kind === 1) return [{ from, insert: "\n" }];
  if (kind === 2) {
    const size = 1 + next(Math.min(5, document.length - from));
    return [{ from, to: from + size, insert: "" }];
  }
  if (kind === 3) {
    const size = 1 + next(Math.min(4, document.length - from));
    return [{ from, to: from + size, insert: "\n" }];
  }
  if (kind === 4) {
    const other = 3 + next(Math.max(1, document.length - 3));
    const positions = [Math.min(from, other), Math.max(from, other)].filter(
      (position, index, all) =>
        position < document.length &&
        (index === 0 || (all[0] !== undefined && position > all[0])),
    );
    return positions.map((position) => ({
      from: position,
      to: position + 1,
      insert: next(2) ? "" : "\n",
    }));
  }
  const size = 1 + next(Math.min(4, document.length - from));
  return [{ from, to: from + size, insert: "Z" }];
}

describe("CM6 canonical Markdown source state", () => {
  it("keeps raw mixed line endings and BOM through edits, undo, and redo", () => {
    const raw = "\uFEFF---\r\ntitle: x\r---\r\n\r\nalpha\nbeta\r\n";
    const initial = create_markdown_state(raw);
    const initial_raw_document = get_markdown_source_document(initial);
    expect(get_markdown_source(initial)).toBe(raw);
    expect(initial_raw_document.toString()).toBe(raw);
    expect(initial.doc.toString()).toBe(
      "\uFEFF---\ntitle: x\n---\n\nalpha\nbeta\n",
    );

    const position = initial.doc.toString().indexOf("alpha");
    const changed = initial.update({
      changes: { from: position, to: position + 5, insert: "omega" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(get_markdown_source(changed)).toBe(raw.replace("alpha", "omega"));
    expect(get_markdown_source(initial)).toBe(raw);
    expect(get_markdown_source_document(initial)).toBe(initial_raw_document);
    expect(get_markdown_source_document(changed)).not.toBe(
      initial_raw_document,
    );

    const undone = run_command(changed, source_undo);
    expect(undone.handled).toBe(true);
    expect(get_markdown_source(undone.state)).toBe(raw);
    const redone = run_command(undone.state, source_redo);
    expect(redone.handled).toBe(true);
    expect(get_markdown_source(redone.state)).toBe(
      raw.replace("alpha", "omega"),
    );
  });

  it("keeps independent buffers and updates source before any debounce", () => {
    const first_source = "first\r\nline";
    const second_source = "second\rline";
    const first = create_markdown_state(first_source);
    const second = create_markdown_state(second_source);
    const next_first = first.update({
      changes: { from: 0, insert: "X" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(get_markdown_source(next_first)).toBe("Xfirst\r\nline");
    expect(get_markdown_source(first)).toBe(first_source);
    expect(get_markdown_source(second)).toBe(second_source);
  });

  it("does not stringify canonical source for selection-only updates", () => {
    const initial = create_markdown_state("a\r\nb");
    const raw_document = get_markdown_source_document(initial);
    const stringify = vi.spyOn(raw_document, "toString");
    const selected = initial.update({
      selection: EditorSelection.cursor(2),
    }).state;
    expect(stringify).not.toHaveBeenCalled();
    expect(get_markdown_source_document(selected)).toBe(raw_document);
    expect(selected.selection.main.head).toBe(2);
    stringify.mockRestore();
  });

  it("reuses the line-ending map for equal-length text replacements", () => {
    const initial = create_markdown_state("abc\r\ndef");
    const raw_document = get_markdown_source_document(initial);
    const stringify = vi.spyOn(raw_document, "toString");
    const changed = initial.update({
      changes: { from: 1, to: 2, insert: "X" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(stringify).not.toHaveBeenCalled();
    expect(get_markdown_source(changed)).toBe("aXc\r\ndef");
    expect(get_markdown_source(initial)).toBe("abc\r\ndef");
    stringify.mockRestore();
  });

  it("tracks the final document produced by transaction filters", () => {
    const initial = create_markdown_state(
      "ab\r\ncd",
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged) return transaction;
        const suffix = transaction.state.changes({
          from: transaction.newDoc.length,
          insert: "!",
        });
        return { changes: transaction.changes.compose(suffix) };
      }),
    );
    const changed = initial.update({
      changes: { from: 1, insert: "X" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(changed.doc.toString()).toBe("aXb\ncd!");
    expect(get_markdown_source(changed)).toBe("aXb\r\ncd!");
    const undone = run_command(changed, source_undo).state;
    expect(undone.doc.toString()).toBe("ab\ncd");
    expect(get_markdown_source(undone)).toBe("ab\r\ncd");
  });

  it("keeps formatting filters and Markdown list continuation in canonical source", () => {
    let heading = create_markdown_state("# Heading\r\n", [
      markdown_language(),
      markdown_format_keymap,
    ]).update({
      selection: EditorSelection.range(2, 9),
    }).state;
    const formatted = run_command(heading, toggle_bold);
    expect(formatted.handled).toBe(true);
    heading = formatted.state;
    expect(get_markdown_source(heading)).toBe("# **Heading**\r\n");
    expect(get_markdown_source(run_command(heading, source_undo).state)).toBe(
      "# Heading\r\n",
    );

    let list = create_markdown_state(
      "- item\r\nnext",
      markdown_language(),
    ).update({
      selection: EditorSelection.cursor(6),
    }).state;
    const continued = run_command(list, insertNewlineContinueMarkup);
    expect(continued.handled).toBe(true);
    list = continued.state;
    expect(list.doc.toString()).toBe("- item\n- \nnext");
    expect(get_markdown_source(list)).toBe("- item\r\n- \r\nnext");
    expect(get_markdown_source(run_command(list, source_undo).state)).toBe(
      "- item\r\nnext",
    );
  });

  it("preserves explicit pasted line ending kinds at every selection", () => {
    const initial = create_markdown_state(
      "a\r\nb\rc",
      EditorState.allowMultipleSelections.of(true),
    );
    const selected = initial.update({
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(3),
      ]),
    }).state;
    let result = selected;
    const view = {
      state: selected,
      dispatch: (transaction: Parameters<EditorView["dispatch"]>[0]) => {
        result = result.update(transaction).state;
      },
    } as unknown as EditorView;
    insert_markdown_source(view, "X\rY\r\nZ\n");
    expect(result.doc.toString()).toBe("aX\nY\nZ\n\nbX\nY\nZ\n\nc");
    expect(get_markdown_source(result)).toBe("aX\rY\r\nZ\n\r\nbX\rY\r\nZ\n\rc");
    expect(result.selection.ranges.map((range) => range.head)).toEqual([7, 15]);
    expect(get_markdown_source(selected)).toBe("a\r\nb\rc");
    expect(get_markdown_source(run_command(result, source_undo).state)).toBe(
      "a\r\nb\rc",
    );

    const reversed = create_markdown_state("abcdef").update({
      selection: EditorSelection.create([EditorSelection.range(5, 2)]),
    }).state;
    let replacement_result = reversed;
    const replacement_view = {
      state: reversed,
      dispatch: (transaction: Parameters<EditorView["dispatch"]>[0]) => {
        replacement_result = replacement_result.update(transaction).state;
      },
    } as unknown as EditorView;
    insert_markdown_source(replacement_view, "XY");
    expect(replacement_result.doc.toString()).toBe("abXYf");
    expect(replacement_result.selection.main.anchor).toBe(4);
    expect(replacement_result.selection.main.head).toBe(4);
  });

  it("maps merged disjoint edits and restores exact line endings on undo/redo", () => {
    const source = "abc\r\ndef\rghi";
    const initial = create_markdown_state(source);
    const changed = initial.update({
      changes: [
        { from: 0, to: 1, insert: "A" },
        { from: 5, to: 6, insert: "D" },
      ],
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(get_markdown_source(changed)).toBe("Abc\r\ndDf\rghi");
    const undone = run_command(changed, source_undo);
    expect(get_markdown_source(undone.state)).toBe(source);
    expect(
      get_markdown_source(run_command(undone.state, source_redo).state),
    ).toBe("Abc\r\ndDf\rghi");
  });

  it("keeps a non-history insertion at a deleted CRLF boundary through undo and redo", () => {
    let state = create_markdown_state("ab\r\ncd");
    state = state.update({
      changes: { from: 2, to: 3, insert: "" },
      annotations: [
        Transaction.userEvent.of("delete.line"),
        Transaction.time.of(1000),
      ],
    }).state;
    state = state.update({
      changes: { from: 2, insert: "X" },
      annotations: [
        Transaction.addToHistory.of(false),
        Transaction.userEvent.of("external.insert"),
      ],
    }).state;
    expect(get_markdown_source(state)).toBe("abXcd");
    const undone = run_command(state, source_undo);
    expect(get_markdown_source(undone.state)).toBe("abX\r\ncd");
    expect(
      get_markdown_source(run_command(undone.state, source_redo).state),
    ).toBe("abXcd");
  });

  it("groups typing, mixed-ending newline deletion, and full history cycles", () => {
    const original = "a\r\nb\rc\nd";
    let state = create_markdown_state(original);
    state = state.update({
      changes: [
        { from: 1, to: 2, insert: "" },
        { from: 3, to: 4, insert: "" },
      ],
      annotations: Transaction.userEvent.of("delete.grouped"),
    }).state;
    expect(get_markdown_source(state)).toBe("abc\nd");
    const undone = run_command(state, source_undo);
    expect(get_markdown_source(undone.state)).toBe(original);
    const redone = run_command(undone.state, source_redo);
    expect(get_markdown_source(redone.state)).toBe("abc\nd");

    state = create_markdown_state("a\r\nb");
    state = state.update({
      changes: { from: 1, insert: "x" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    state = state.update({
      changes: { from: 2, insert: "y" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(get_markdown_source(state)).toBe("axy\r\nb");
    expect(get_markdown_source(run_command(state, source_undo).state)).toBe(
      "a\r\nb",
    );
  });

  it("preserves cursor affinity and vertical goal through source undo and redo", () => {
    const source = "first\r\nsecond";
    const initial = create_markdown_state(source).update({
      selection: EditorSelection.create([
        EditorSelection.cursor(8, 1, undefined, 72),
      ]),
    }).state;
    const changed = initial.update({
      changes: { from: 8, insert: "X" },
      selection: EditorSelection.create([
        EditorSelection.cursor(9, 1, undefined, 72),
      ]),
      annotations: Transaction.userEvent.of("input.type"),
    }).state;

    const undone = run_command(changed, source_undo);
    expect(undone.handled).toBe(true);
    expect(get_markdown_source(undone.state)).toBe(source);
    expect(undone.state.selection.main.head).toBe(8);
    expect(undone.state.selection.main.assoc).toBe(1);
    expect(undone.state.selection.main.goalColumn).toBe(72);

    const redone = run_command(undone.state, source_redo);
    expect(redone.handled).toBe(true);
    expect(get_markdown_source(redone.state)).toBe("first\r\nseXcond");
    expect(redone.state.selection.main.head).toBe(9);
    expect(redone.state.selection.main.assoc).toBe(1);
    expect(redone.state.selection.main.goalColumn).toBe(72);
  });

  it("groups a burst of real input.type transactions into one source undo", () => {
    let state = create_markdown_state("base").update({
      selection: EditorSelection.cursor(4),
    }).state;
    for (const character of " // edit") {
      const position = state.selection.main.head;
      state = state.update({
        changes: { from: position, insert: character },
        selection: EditorSelection.cursor(position + character.length),
        annotations: Transaction.userEvent.of("input.type"),
      }).state;
    }
    expect(get_markdown_source(state)).toBe("base // edit");
    const undone = run_command(state, source_undo);
    expect(undone.handled).toBe(true);
    expect(get_markdown_source(undone.state)).toBe("base");
    expect(
      get_markdown_source(run_command(undone.state, source_redo).state),
    ).toBe("base // edit");
  });

  it("does not allow source paste or history commands in read-only state", () => {
    const initial = create_markdown_state(
      "a\r\nb",
      EditorState.readOnly.of(true),
    );
    let dispatched = false;
    const view = {
      state: initial,
      dispatch: () => {
        dispatched = true;
      },
    } as unknown as EditorView;
    insert_markdown_source(view, "X");
    expect(dispatched).toBe(false);
    expect(run_command(initial, source_undo).handled).toBe(false);
    expect(run_command(initial, source_redo).handled).toBe(false);
    expect(get_markdown_source(initial)).toBe("a\r\nb");
  });

  it("keeps exact source through 200 deterministic edit and history runs", () => {
    const fixtures = [
      "a\r\nb\rc\nd\r\ne",
      "\uFEFF---\r\nx\n# y\rz",
      "one\rtwo\r\nthree\n",
    ];
    for (let initial_seed = 1; initial_seed <= 200; initial_seed++) {
      const fixture = fixtures[(initial_seed - 1) % fixtures.length];
      if (fixture === undefined) throw new Error("Missing stress fixture");
      const preferred_ending = fixture.match(/\r\n|\r|\n/)?.[0] ?? "\n";
      let state = create_markdown_state(fixture);
      state = state.update({
        changes: { from: 0, insert: "EXT" },
        annotations: [
          Transaction.addToHistory.of(false),
          Transaction.userEvent.of("external.prefix"),
        ],
      }).state;
      let expected = `EXT${fixture}`;
      let seed = initial_seed;
      const previous_sources: string[] = [];
      const next_sources: string[] = [];
      const next = (limit: number) => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed % limit;
      };
      const operation_count = 40 + (initial_seed % 21);

      for (let step = 0; step < operation_count; step++) {
        const changes = generated_changes(state.doc.toString(), next);
        const next_expected = apply_expected_changes(
          expected,
          changes,
          preferred_ending,
        );
        const source_changed = next_expected !== expected;
        const previous_expected = expected;
        if (source_changed) previous_sources.push(previous_expected);
        expected = next_expected;
        state = state.update({
          changes: changes as ChangeSpec[],
          annotations: [
            Transaction.userEvent.of("input.type"),
            Transaction.time.of(1000 + step * 1000),
          ],
        }).state;
        expect(
          get_markdown_source(state),
          `seed ${String(initial_seed)}, edit ${String(step)}`,
        ).toBe(expected);
        expect(state.doc.toString()).toBe(normalize(expected));
        if (source_changed) next_sources.push(expected);
      }

      for (let index = previous_sources.length - 1; index >= 0; index--) {
        const result = run_command(state, source_undo);
        expect(
          result.handled,
          `seed ${String(initial_seed)}, undo ${String(index)}`,
        ).toBe(true);
        state = result.state;
        expect(
          get_markdown_source(state),
          `seed ${String(initial_seed)}, undo ${String(index)}`,
        ).toBe(previous_sources[index]);
      }
      for (let index = 0; index < next_sources.length; index++) {
        const result = run_command(state, source_redo);
        expect(
          result.handled,
          `seed ${String(initial_seed)}, redo ${String(index)}`,
        ).toBe(true);
        state = result.state;
        expect(
          get_markdown_source(state),
          `seed ${String(initial_seed)}, redo ${String(index)}`,
        ).toBe(next_sources[index]);
      }
    }
  });
});

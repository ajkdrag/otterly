import { describe, expect, it } from "vitest";
import { history, undo, redo } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type StateCommand,
} from "@codemirror/state";
import {
  markdown_language,
  toggle_bold,
  toggle_italic,
  toggle_strikethrough,
  toggle_inline_code,
} from "../../../packages/markdown_editor/src/index";

function run_command(
  source: string,
  anchor: number,
  head: number,
  command: StateCommand,
  read_only = false,
) {
  let state = EditorState.create({
    doc: source,
    selection: { anchor, head },
    extensions: [markdown_language(), EditorState.readOnly.of(read_only)],
  });
  const handled = command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return { state, handled };
}

describe("Markdown formatting commands", () => {
  it("changes only the selected word and retains a backwards selection", () => {
    const source = "-   hello world  \n";
    const { state, handled } = run_command(source, 9, 4, toggle_bold);
    expect(handled).toBe(true);
    expect(state.doc.toString()).toBe("-   **hello** world  \n");
    expect(state.selection.main.anchor).toBe(11);
    expect(state.selection.main.head).toBe(6);
  });

  it("removes surrounding bold markers without changing the text", () => {
    const { state } = run_command("**hello**", 2, 7, toggle_bold);
    expect(state.doc.toString()).toBe("hello");
    expect(state.selection.main.from).toBe(0);
    expect(state.selection.main.to).toBe(5);
  });

  it("uses a longer delimiter when selected code contains a backtick", () => {
    const { state } = run_command("a ` b", 0, 5, toggle_inline_code);
    expect(state.doc.toString()).toBe("``a ` b``");
  });

  it.each(["~~~js\nhello\n~~~", "---\ntitle: hello\n---"])(
    "leaves literal block text alone: %s",
    (source) => {
      const from = source.indexOf("hello");
      const { state, handled } = run_command(
        source,
        from,
        from + 5,
        toggle_bold,
      );
      expect(handled).toBe(false);
      expect(state.doc.toString()).toBe(source);
    },
  );
});

describe("Formatting existing Markdown syntax", () => {
  it.each([
    ["__hello__", 2, 7, toggle_bold, "hello"],
    ["_hello_", 1, 6, toggle_italic, "hello"],
    ["~~hello~~", 2, 7, toggle_strikethrough, "hello"],
    ["``a ` b``", 2, 7, toggle_inline_code, "a ` b"],
    ["`` `hello` ``", 3, 10, toggle_inline_code, "`hello`"],
    ["`   `", 1, 4, toggle_inline_code, "   "],
  ] as const)(
    "removes the full surrounding syntax in %s",
    (source, from, to, command, expected) => {
      const { state, handled } = run_command(source, from, to, command);
      expect(handled).toBe(true);
      expect(state.doc.toString()).toBe(expected);
    },
  );

  it("adds italic inside bold without stripping the bold markers", () => {
    const { state } = run_command("**hello**", 2, 7, toggle_italic);
    expect(state.doc.toString()).toBe("***hello***");
  });

  it("leaves selected whitespace outside emphasis and retains selection direction", () => {
    const { state } = run_command(" hello ", 7, 0, toggle_bold);
    expect(state.doc.toString()).toBe(" **hello** ");
    expect(state.selection.main.anchor).toBe(8);
    expect(state.selection.main.head).toBe(3);
  });

  it("does not insert ineffective markers around whitespace alone", () => {
    const { state, handled } = run_command("   ", 0, 3, toggle_bold);
    expect(handled).toBe(false);
    expect(state.doc.toString()).toBe("   ");
  });

  it("leaves existing text unchanged when toggling future typing at a cursor", () => {
    const { state } = run_command("**hello**", 4, 4, toggle_bold);
    expect(state.doc.toString()).toBe("**hello**");
    expect(state.selection.main.head).toBe(4);
  });

  it("stores formatting independently at multiple cursors without changing text", () => {
    let state = EditorState.create({
      doc: "**hello**",
      extensions: [
        markdown_language(),
        EditorState.allowMultipleSelections.of(true),
      ],
      selection: EditorSelection.create([
        EditorSelection.cursor(3),
        EditorSelection.cursor(6),
      ]),
    });
    expect(
      toggle_bold({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      }),
    ).toBe(true);
    expect(state.doc.toString()).toBe("**hello**");
    expect(state.selection.ranges.map((range) => range.head)).toEqual([3, 6]);
  });

  it.each([
    toggle_bold,
    toggle_italic,
    toggle_strikethrough,
    toggle_inline_code,
  ])("honors read-only state", (command) => {
    const { state, handled } = run_command("hello", 0, 5, command, true);
    expect(handled).toBe(false);
    expect(state.doc.toString()).toBe("hello");
  });

  it.each([
    ["prose\n\n~~~js\nhello\n~~~", 0, 18, toggle_bold],
    ["prose\n\n    hello", 0, 16, toggle_italic],
    ["`hello`", 1, 6, toggle_bold],
    ["a `hello` word", 0, 6, toggle_inline_code],
    ["---\ntitle: hello\n---\nbody", 7, 24, toggle_bold],
  ] as const)(
    "does not format selections that intersect literal syntax: %s",
    (source, from, to, command) => {
      const { state, handled } = run_command(source, from, to, command);
      expect(handled).toBe(false);
      expect(state.doc.toString()).toBe(source);
    },
  );
});

function type_text(state: EditorState, text: string) {
  return state.update(state.replaceSelection(text), { userEvent: "input.type" })
    .state;
}
function apply_command(state: EditorState, command: StateCommand) {
  command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return state;
}

describe("Formatting across text blocks", () => {
  it.each([
    ["one\n\ntwo", "**one**\n\n**two**"],
    [
      "# Heading\n\n- first\n- second",
      "# **Heading**\n\n- **first**\n- **second**",
    ],
    ["Title\n=====\n\nbody", "**Title**\n=====\n\n**body**"],
    ["> first\n>\n> second", "> **first**\n>\n> **second**"],
  ])("formats text without changing block markers: %s", (source, expected) => {
    let { state } = run_command(source, 0, source.length, toggle_bold);
    expect(state.doc.toString()).toBe(expected);
    state = apply_command(state, toggle_bold);
    expect(state.doc.toString()).toBe(source);
  });
  it("retains a backwards cross-paragraph selection", () => {
    const source = "one\n\ntwo";
    const { state } = run_command(source, source.length, 0, toggle_italic);
    expect(state.doc.toString()).toBe("*one*\n\n*two*");
    expect(state.selection.main.anchor).toBeGreaterThan(
      state.selection.main.head,
    );
  });
  it("removes existing formatting from a mixed selection, like PM toggleMark", () => {
    const source = "**one**\n\ntwo";
    const { state } = run_command(source, 0, source.length, toggle_bold);
    expect(state.doc.toString()).toBe("one\n\ntwo");
  });
  it("preserves formatting outside a partial selection", () => {
    const { state } = run_command("**hello world**", 2, 7, toggle_bold);
    expect(state.doc.toString()).toBe("hello **world**");
  });
  it("can remove formatting from the middle of an existing mark", () => {
    const { state } = run_command("**one two three**", 6, 9, toggle_bold);
    expect(state.doc.toString()).toBe("**one** two **three**");
  });
});

describe("Formatting future typing", () => {
  it("stores an empty-selection toggle and extends consecutive typed characters", () => {
    let { state } = run_command("", 0, 0, toggle_bold);
    expect(state.doc.toString()).toBe("");
    state = type_text(state, "h");
    state = type_text(state, "i");
    expect(state.doc.toString()).toBe("**hi**");
    expect(state.selection.main.head).toBe(4);
    state = apply_command(state, toggle_bold);
    expect(state.doc.toString()).toBe("**hi**");
    state = type_text(state, "!");
    expect(state.doc.toString()).toBe("**hi**!");
  });
  it("toggles a pending format off before typing without inserting empty syntax", () => {
    let { state } = run_command("", 0, 0, toggle_italic);
    state = apply_command(state, toggle_italic);
    state = type_text(state, "plain");
    expect(state.doc.toString()).toBe("plain");
  });
  it("preserves existing formatting when typing plain text inside a mark", () => {
    let { state } = run_command("**hello**", 4, 4, toggle_bold);
    state = type_text(state, "X");
    state = type_text(state, "Y");
    expect(state.doc.toString()).toBe("**he**XY**llo**");
  });
  it("inserts plain text before a mark when toggled off at its start", () => {
    let { state } = run_command("**hello**", 2, 2, toggle_bold);
    state = type_text(state, "X");
    expect(state.doc.toString()).toBe("X**hello**");
  });
  it("allows multiple future formats without changing source before typing", () => {
    let { state } = run_command("", 0, 0, toggle_bold);
    state = apply_command(state, toggle_italic);
    expect(state.doc.toString()).toBe("");
    state = type_text(state, "both");
    expect(state.doc.toString()).toBe("***both***");
  });
  it("clears pending formatting when the selection moves", () => {
    let { state } = run_command("text", 0, 0, toggle_bold);
    state = state.update({ selection: { anchor: 4 } }).state;
    state = type_text(state, "plain");
    expect(state.doc.toString()).toBe("textplain");
  });
  it("keeps empty inline-code commands unchanged, matching Milkdown", () => {
    const { state, handled } = run_command("text", 2, 2, toggle_inline_code);
    expect(handled).toBe(false);
    expect(state.doc.toString()).toBe("text");
  });
  it("types at multiple cursors using the same formatting toggle", () => {
    let state = EditorState.create({
      doc: "a\nb",
      extensions: [
        markdown_language(),
        EditorState.allowMultipleSelections.of(true),
      ],
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(3),
      ]),
    });
    state = apply_command(state, toggle_bold);
    state = type_text(state, "X");
    expect(state.doc.toString()).toBe("a**X**\nb**X**");
    state = type_text(state, "Y");
    expect(state.doc.toString()).toBe("a**XY**\nb**XY**");
  });
  it("undoes and redoes typed content and its syntax together", () => {
    let state = EditorState.create({
      doc: "",
      extensions: [markdown_language(), history()],
    });
    state = apply_command(state, toggle_bold);
    state = type_text(state, "hello");
    expect(state.doc.toString()).toBe("**hello**");
    state = apply_command(state, undo);
    expect(state.doc.toString()).toBe("");
    state = apply_command(state, redo);
    expect(state.doc.toString()).toBe("**hello**");
  });
});

describe("Typing whitespace with active formatting", () => {
  it.each([" ", "\n", "\n\n"])(
    "keeps whitespace outside newly typed emphasis: %j",
    (space) => {
      let { state } = run_command("", 0, 0, toggle_bold);
      state = type_text(state, "hello");
      state = type_text(state, space);
      expect(state.doc.toString()).toBe("**hello**" + space);
      state = type_text(state, "world");
      expect(state.doc.toString()).toBe("**hello**" + space + "**world**");
    },
  );
  it("formats inserted paragraphs independently", () => {
    let { state } = run_command("", 0, 0, toggle_bold);
    state = type_text(state, " one\n\ntwo ");
    expect(state.doc.toString()).toBe(" **one**\n\n**two** ");
  });
  it("preserves trailing spaces in a whole typed word", () => {
    let { state } = run_command("", 0, 0, toggle_italic);
    state = type_text(state, "hello ");
    expect(state.doc.toString()).toBe("*hello* ");
  });
  it("does not generate syntax for whitespace-only input", () => {
    let { state } = run_command("", 0, 0, toggle_bold);
    state = type_text(state, "  ");
    expect(state.doc.toString()).toBe("  ");
    state = type_text(state, "word");
    expect(state.doc.toString()).toBe("  **word**");
  });
  it("cleans up generated empty syntax when its last character is deleted", () => {
    let { state } = run_command("", 0, 0, toggle_bold);
    state = type_text(state, "x");
    state = state.update({
      changes: { from: 2, to: 3 },
      selection: { anchor: 2 },
      userEvent: "input.delete.backward",
    }).state;
    expect(state.doc.toString()).toBe("");
    expect(state.selection.main.head).toBe(0);
    state = type_text(state, "y");
    expect(state.doc.toString()).toBe("**y**");
  });
});

it("keeps combined styles valid across spaces and last-character deletion", () => {
  let { state } = run_command("", 0, 0, toggle_bold);
  state = apply_command(state, toggle_strikethrough);
  state = type_text(state, "x");
  state = type_text(state, " ");
  expect(state.doc.toString()).toBe("**~~x~~** ");
  state = type_text(state, "y");
  expect(state.doc.toString()).toBe("**~~x~~** **~~y~~**");
  const head = state.selection.main.head;
  state = state.update({
    changes: { from: head - 1, to: head },
    selection: { anchor: head - 1 },
    userEvent: "input.delete.backward",
  }).state;
  expect(state.doc.toString()).toBe("**~~x~~** ");
});

it("keeps composed replacement text inside the generated formatting", () => {
  let { state } = run_command("", 0, 0, toggle_bold);
  state = state.update(state.replaceSelection("k"), {
    userEvent: "input.type.compose",
  }).state;
  state = state.update({
    changes: { from: 2, to: 3, insert: "漢" },
    selection: { anchor: 3 },
    userEvent: "input.type.compose",
  }).state;
  expect(state.doc.toString()).toBe("**漢**");
  expect(state.selection.main.head).toBe(3);
});

it("turns off outer bold while retaining inner strikethrough for future typing", () => {
  let { state } = run_command("", 0, 0, toggle_bold);
  state = apply_command(state, toggle_strikethrough);
  state = type_text(state, "x");
  state = apply_command(state, toggle_bold);
  state = type_text(state, "y");
  expect(state.doc.toString()).toBe("**~~x~~**~~y~~");
  state = type_text(state, "z");
  expect(state.doc.toString()).toBe("**~~x~~**~~yz~~");
});

it.each([
  ["**~~xy~~**", 4, toggle_bold, "~~z~~**~~xy~~**"],
  ["**~~xy~~**", 5, toggle_bold, "**~~x~~**~~z~~**~~y~~**"],
  ["**~~xy~~**", 6, toggle_strikethrough, "**~~xy~~z**"],
] as const)(
  "keeps nested marks properly ordered when exiting at %s:%i",
  (source, at, command, expected) => {
    let { state } = run_command(source, at, at, command);
    state = type_text(state, "z");
    expect(state.doc.toString()).toBe(expected);
  },
);

/** @vitest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Vim, getCM } from "@replit/codemirror-vim";
import { block_field } from "../src/core/block_field";
import { create_markdown_state } from "../src/core/editor";
import { commonmark } from "../src/plugins/commonmark/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { gfm } from "../src/plugins/gfm/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import { vim_mode, type VimMode } from "../src/plugins/vim/index";
import {
  apply_vimrc,
  built_in_one_key_commands,
  parse_vimrc,
} from "../src/plugins/vim/vimrc";

// jsdom has no layout, and the block cursor measures text. j and k also
// measure the screen to step over hidden text, and with no layout they run to
// the end of the document. The tests below move with counts and G instead.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});
afterAll(() => {
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

const open_views = new Set<EditorView>();

afterEach(() => {
  for (const view of open_views) view.destroy();
  open_views.clear();
  document.body.replaceChildren();
  apply_vimrc("");
});

const table = "| a | b |\n| - | - |\n| 1 | 2 |";

function vim_editor(
  source: string,
  options: { modes?: VimMode[]; vim?: Compartment } = {},
) {
  const extension = vim_mode({
    on_mode_change: (mode) => options.modes?.push(mode),
  });
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: create_markdown_state(source, {
      plugins: [commonmark(), gfm(), code_blocks(), slash_menu()],
      extensions: options.vim ? options.vim.of(extension) : extension,
    }),
  });
  view.dispatch({ selection: EditorSelection.cursor(0) });
  open_views.add(view);
  return view;
}

// Keys go straight to the engine, the way its keydown handler sends them.
function press(view: EditorView, ...keys: string[]) {
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  for (const key of keys) Vim.handleKey(cm, key, "user");
}

function ex_command(view: EditorView, command: string) {
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  Vim.handleEx(cm, command);
}

// Insert mode keys Vim does not take fall through to the editor, which
// inserts them.
function type(view: EditorView, text: string) {
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  for (const character of text) {
    if (!Vim.handleKey(cm, character, "user"))
      view.dispatch(
        view.state.update(view.state.replaceSelection(character), {
          userEvent: "input.type",
        }),
      );
  }
}

// A real keydown, so the DOM handlers run in their real order.
function keydown(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

function menu_is_open(view: EditorView) {
  return view.dom.querySelector(".cm-tooltip-autocomplete") !== null;
}

function table_widget(view: EditorView) {
  return view.dom.querySelector("[data-md-block]");
}

describe("vim mode", () => {
  test("VIM-001 u undoes dd through the source history and <C-r> redoes it", () => {
    const view = vim_editor("one\ntwo\nthree");
    press(view, "2", "G", "d", "d");
    expect(view.state.doc.toString()).toBe("one\nthree");

    press(view, "u");
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");

    press(view, "<C-r>");
    expect(view.state.doc.toString()).toBe("one\nthree");

    ex_command(view, "undo");
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");

    ex_command(view, "redo");
    expect(view.state.doc.toString()).toBe("one\nthree");
  });

  test("VIM-002 moving onto a table shows its source, and turning Vim off renders it again", () => {
    const vim = new Compartment();
    const view = vim_editor(`before\n\n${table}\n\nafter`, { vim });
    expect(table_widget(view)).not.toBeNull();

    press(view, "3", "G");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
    expect(table_widget(view)).toBeNull();

    view.dispatch({ effects: vim.reconfigure([]) });
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
    expect(table_widget(view)).not.toBeNull();
  });

  // jsdom's findPosV overshoots to the end of the note. The browser's lands
  // past the block when it steps over a widget. Either way the caret must land
  // on the nearest line of the block.
  test.each([
    {
      name: "code block",
      source: "before\n\n```ts\nconst a = 1;\n```\n\nafter",
      blank_above: 2,
      first_line: 3,
      last_line: 5,
      blank_below: 6,
    },
    {
      name: "table",
      source: `before\n\n${table}\n\nafter`,
      blank_above: 2,
      first_line: 3,
      last_line: 5,
      blank_below: 6,
    },
  ])(
    "VIM-017 j and k step into a rendered $name on its nearest line",
    ({ source, blank_above, first_line, last_line, blank_below }) => {
      const view = vim_editor(source);
      const line_start = (number: number) => view.state.doc.line(number).from;
      expect(table_widget(view)).not.toBeNull();

      press(view, String(blank_above), "G", "j");
      expect(view.state.selection.main.head).toBe(line_start(first_line));
      expect(table_widget(view)).toBeNull();

      press(view, "G", String(blank_below), "G", "k");
      expect(view.state.selection.main.head).toBe(line_start(last_line));
      expect(table_widget(view)).toBeNull();
    },
  );

  test("VIM-018 an insert mode arrow key steps into a rendered table on its nearest line", () => {
    const view = vim_editor(`before\n\n${table}\n\nafter`);
    press(view, "2", "G", "i");
    keydown(view, "ArrowDown");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
    expect(table_widget(view)).toBeNull();

    press(view, "<Esc>", "6", "G", "i");
    keydown(view, "ArrowUp");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(5).from);
  });

  test("VIM-003 reports each mode change, starting in normal", () => {
    const modes: VimMode[] = [];
    const view = vim_editor("text", { modes });
    press(view, "i", "<Esc>", "V");
    expect(modes).toEqual(["normal", "insert", "normal", "visual_line"]);
  });

  test("VIM-006 Esc closes an open slash menu before it leaves insert mode", async () => {
    const modes: VimMode[] = [];
    const view = vim_editor("", { modes });
    press(view, "i");
    type(view, "/");
    await vi.waitFor(() => {
      expect(menu_is_open(view)).toBe(true);
    });

    keydown(view, "Escape");
    expect(menu_is_open(view)).toBe(false);
    expect(modes.at(-1)).toBe("insert");

    keydown(view, "Escape");
    expect(modes.at(-1)).toBe("normal");
  });

  test("VIM-007 a caret move that reveals no other block keeps the block decorations", () => {
    const view = vim_editor(`one\ntwo\n\n${table}\n\nafter`);
    const decorations = () => view.state.field(block_field).decorations;
    const move_to_line = (line: number) => {
      view.dispatch({
        selection: EditorSelection.cursor(view.state.doc.line(line).from),
      });
    };
    const widgets_at_start = decorations();

    move_to_line(2);
    expect(decorations()).toBe(widgets_at_start);

    move_to_line(5);
    expect(table_widget(view)).toBeNull();
    const widgets_in_table = decorations();
    move_to_line(6);
    expect(decorations()).toBe(widgets_in_table);

    move_to_line(8);
    expect(table_widget(view)).not.toBeNull();
  });

  test("VIM-008 a note that starts inside a table shows its source until the caret leaves", () => {
    const view = vim_editor(`${table}\n\nafter`);
    expect(table_widget(view)).toBeNull();

    press(view, "G");
    expect(table_widget(view)).not.toBeNull();
  });

  test("VIM-009 a visual selection over a table keeps the widget, and d deletes the whole table", () => {
    const view = vim_editor(`before\n\n${table}\n\nafter`);
    press(view, "3", "G");
    expect(table_widget(view)).toBeNull();

    press(view, "V", "5", "G");
    expect(table_widget(view)).not.toBeNull();

    press(view, "d");
    expect(view.state.doc.toString()).toBe("before\n\n\nafter");
  });

  test("VIM-010 undo inside a revealed code block restores the source, and the block renders once the caret leaves", () => {
    const source = "before\n\n```ts\nconst a = 1;\n```\n\nafter";
    const view = vim_editor(source);
    press(view, "4", "G", "A");
    type(view, " // note");
    press(view, "<Esc>");
    expect(view.state.doc.line(4).text).toBe("const a = 1; // note");
    expect(table_widget(view)).toBeNull();

    press(view, "u");
    expect(view.state.doc.toString()).toBe(source);

    press(view, "G");
    expect(table_widget(view)).not.toBeNull();
  });

  test("VIM-013 a click into a rendered table gives focus back to the editor when it turns into source", async () => {
    const view = vim_editor(`before\n\n${table}\n\nafter`);
    view.focus();
    const cell = view.dom.querySelector<HTMLElement>("[data-row][data-col]");
    cell?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    expect(view.hasFocus).toBe(false);
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 }),
    );

    // The reveal freeze ends about 100 ms after the button comes up. jsdom
    // can be slow to build the table, so the wait is generous.
    await vi.waitFor(
      () => {
        expect(table_widget(view)).toBeNull();
      },
      { timeout: 3000 },
    );
    await vi.waitFor(
      () => {
        expect(view.hasFocus).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  test.each([
    {
      name: "code block",
      source: "before\n\n```ts\nconst a = 1;\n```\n\nafter",
      editor_selector: ".md-code-source .cm-editor",
      mouse_target: ".md-code-source .cm-content",
    },
    {
      name: "table cell",
      source: `before\n\n${table.replace("| 1 |", "| alpha |")}\n\nafter`,
      editor_selector: ".md-table-cell-active .cm-editor",
      mouse_target: "[data-row='1'][data-col='0']",
    },
  ])(
    "VIM-015 a mouse range selection in a $name gives focus back to the editor and keeps the block",
    async ({ source, editor_selector, mouse_target }) => {
      const view = vim_editor(source);
      view.focus();
      view.dom.querySelector<HTMLElement>(mouse_target)?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      const element = view.dom.querySelector<HTMLElement>(editor_selector);
      const nested = element ? EditorView.findFromDOM(element) : null;
      if (!nested) throw new Error("no nested editor to select in");
      nested.focus();
      nested.dispatch({ selection: { anchor: 0, head: 3 } });
      window.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 }),
      );

      await vi.waitFor(
        () => {
          expect(view.hasFocus).toBe(true);
        },
        { timeout: 3000 },
      );
      expect(table_widget(view)).not.toBeNull();
      expect(view.state.selection.main.empty).toBe(false);

      press(view, "y");
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  // Insert mode uses the native caret, so the block cursor class is only on
  // in the other two.
  test.each([
    ["visual mode", ["v", "l"], true, "Xe two"],
    ["insert mode", ["i"], false, "Xone two"],
    ["a pending operator", ["d"], true, "Xone two"],
  ])(
    "VIM-011 turning Vim off in %s gives plain editing back",
    (_state, keys, has_block_cursor, expected_doc) => {
      const vim = new Compartment();
      const view = vim_editor("one two", { vim });
      press(view, ...keys);
      expect(getCM(view)).toBeTruthy();
      expect(view.scrollDOM.classList.contains("cm-vimMode")).toBe(
        has_block_cursor,
      );
      view.dispatch({ effects: vim.reconfigure([]) });
      expect(view.scrollDOM.classList.contains("cm-vimMode")).toBe(false);
      expect(view.dom.querySelector(".cm-fat-cursor")).toBeNull();
      expect(getCM(view)).toBeFalsy();

      view.dispatch(view.state.replaceSelection("X"));
      expect(view.state.doc.toString()).toBe(expected_doc);
    },
  );
});

describe("vimrc", () => {
  test("VIM-004 parses the supported lines and reports the rest by line", () => {
    const { commands, problems } = parse_vimrc(
      [
        '" leave insert mode',
        "",
        "imap jk <Esc>",
        "nnoremap <silent> Y   y$  ",
        "let mapleader = ' '",
        "nmap j",
        "vmap <buffer> x y",
        "map <C-s> :s/a  b/<CR>",
        "nunmap Y",
        "set nopcre insertModeEscKeysTimeout=300",
        "nmap <leader>w :w<CR>",
        "nnoremap <Space>x dd",
        "vmap ,y y",
        "map <CR>x dd",
        "imap <Space>x y",
        "nmap <Space> x",
        'set nopcre " use JS regex',
      ].join("\r\n"),
    );

    expect(commands).toMatchObject([
      { kind: "map", line: 3, context: "insert", recursive: true },
      { kind: "map", line: 4, context: "normal", recursive: false },
      { kind: "map", line: 8, context: null, lhs: "<C-s>" },
      { kind: "unmap", line: 9, context: "normal", lhs: "Y" },
      {
        kind: "set",
        line: 10,
        items: ["nopcre", "insertModeEscKeysTimeout=300"],
      },
      { kind: "map", line: 14, context: null, lhs: "<CR>x" },
      { kind: "map", line: 15, context: "insert", lhs: "<Space>x" },
      { kind: "map", line: 16, context: "normal", lhs: "<Space>" },
      { kind: "set", line: 17, items: ["nopcre"] },
    ]);
    expect(commands.slice(0, 3)).toMatchObject([
      { lhs: "jk", rhs: "<Esc>" },
      { lhs: "Y", rhs: "y$" },
      { rhs: ":s/a  b/<CR>" },
    ]);
    expect(problems.map((problem) => [problem.line, problem.text])).toEqual([
      [5, "let mapleader = ' '"],
      [6, "nmap j"],
      [7, "vmap <buffer> x y"],
      [11, "nmap <leader>w :w<CR>"],
      [12, "nnoremap <Space>x dd"],
      [13, "vmap ,y y"],
    ]);
  });

  test("VIM-004 key names are rewritten to the engine's spelling, and unknown ones are problems", () => {
    const { commands, problems } = parse_vimrc(
      [
        "inoremap jk <esc>",
        "nnoremap <C-J> 3l",
        "nnoremap Q <cr>",
        "nmap <m-x> <C-S-J>",
        "nnoremap <space>x dd",
        "nnoremap <foo>x dd",
        "nnoremap X :s/<b>/c/<cr>",
        "nnoremap Z <Nop>",
        "nnoremap D x<bogus>",
        ":nmap gx dd",
        ":set nopcre",
        "unmap <c-j>",
      ].join("\n"),
    );

    expect(commands).toMatchObject([
      { line: 1, lhs: "jk", rhs: "<Esc>" },
      { line: 2, lhs: "<C-j>", rhs: "3l" },
      { line: 3, lhs: "Q", rhs: "<CR>" },
      { line: 4, lhs: "<A-x>", rhs: "<C-S-J>" },
      { line: 7, lhs: "X", rhs: ":s/<b>/c/<CR>" },
      { line: 8, lhs: "Z", rhs: "" },
      { line: 10, kind: "map", context: "normal", lhs: "gx" },
      { line: 11, kind: "set", items: ["nopcre"] },
      { line: 12, kind: "unmap", lhs: "<C-j>" },
    ]);
    expect(problems.map((problem) => [problem.line, problem.message])).toEqual([
      [5, "Never fires: <Space> is already a Vim command"],
      [6, "Unknown key <foo>"],
      [9, "Unknown key <bogus>"],
    ]);
  });

  test("VIM-012 a UTF-8 byte order mark before the first line is ignored", () => {
    const { commands, problems } = parse_vimrc(
      '\ufeff" comment\nimap jk <Esc>',
    );
    expect(problems).toEqual([]);
    expect(commands).toHaveLength(1);

    expect(parse_vimrc("\ufeffimap jk <Esc>").problems).toEqual([]);
  });

  test("VIM-005 applies maps and options, and a reload drops what left the file", () => {
    const modes: VimMode[] = [];
    const view = vim_editor("text", { modes });

    expect(
      apply_vimrc("imap jk <Esc>\nset insertModeEscKeysTimeout=300"),
    ).toEqual([]);
    expect(Vim.getOption("insertModeEscKeysTimeout")).toBe(300);
    press(view, "i");
    type(view, "jk");
    expect(modes.at(-1)).toBe("normal");
    expect(view.state.doc.toString()).toBe("text");

    expect(apply_vimrc("")).toEqual([]);
    expect(Vim.getOption("insertModeEscKeysTimeout")).toBe(200);
    press(view, "i");
    type(view, "jk");
    expect(modes.at(-1)).toBe("insert");
    expect(view.state.doc.toString()).toBe("jktext");
  });

  test("VIM-005 maps written as <esc> and <C-J> still fire", () => {
    const modes: VimMode[] = [];
    const view = vim_editor("text here", { modes });

    expect(apply_vimrc("inoremap jk <esc>\nnnoremap <C-J> 3l")).toEqual([]);
    press(view, "<C-j>");
    expect(view.state.selection.main.head).toBe(3);

    press(view, "i");
    type(view, "jk");
    expect(modes.at(-1)).toBe("normal");
    expect(view.state.doc.toString()).toBe("text here");
  });

  test("VIM-005 a plain unmap removes the normal map, and a key that was never mapped is a problem", () => {
    const view = vim_editor("text");

    expect(apply_vimrc("nnoremap Y x\nunmap Y")).toEqual([]);
    press(view, "Y");
    expect(view.state.doc.toString()).toBe("text");

    expect(apply_vimrc("unmap Y").map((problem) => problem.line)).toEqual([1]);
  });

  test("VIM-005 a reload restores an option that was set under both of its names", () => {
    const original: unknown = Vim.getOption("langmap");

    expect(apply_vimrc("set langmap=ab\nset lmap=cd")).toEqual([]);
    expect(Vim.getOption("langmap")).toBe("cd");

    apply_vimrc("");
    expect(Vim.getOption("langmap")).toBe(original);
  });

  test("VIM-005 options it cannot set and unmaps of built-in keys are problems", () => {
    const problems = apply_vimrc(
      ["set nosuchoption", "set textwidth=72", "set pcre=1", "unmap l"].join(
        "\n",
      ),
    );
    expect(problems.map((problem) => problem.line)).toEqual([1, 2, 3, 4]);

    // The built-in l still moves after another reload.
    apply_vimrc("");
    const view = vim_editor("text");
    press(view, "l");
    expect(view.state.selection.main.head).toBe(1);
  });

  test("VIM-014 the :unmap prompt leaves built-in keys alone, so a reload still works", () => {
    const view = vim_editor("text");
    ex_command(view, "unmap l");
    apply_vimrc("imap jk <Esc>");
    press(view, "l");
    expect(view.state.selection.main.head).toBe(1);
  });
});

describe("vimrc shadowing", () => {
  // Keys that put a fresh editor in each mode before the probe key.
  const first_keys = {
    normal: [],
    visual: ["v"],
    operatorPending: ["d"],
  } as const;
  const printable = Array.from({ length: 94 }, (_, index) =>
    String.fromCharCode(33 + index),
  );
  const named =
    "Space BS CR Del Tab Esc Left Right Up Down Home End PageUp PageDown Ins"
      .split(" ")
      .map((name) => `<${name}>`);
  const control = Array.from(
    "abcdefghijklmnopqrstuvwxyz",
    (letter) => `<C-${letter}>`,
  );
  const candidates = [
    ...new Set([
      ...printable,
      ...named,
      ...control,
      ...built_in_one_key_commands.keys(),
    ]),
  ];

  // The engine runs a one-key command the moment the key is typed. A key
  // that only starts a longer map waits in the key buffer instead.
  function runs_at_once(context: keyof typeof first_keys, key: string) {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "one two", extensions: vim_mode() }),
    });
    try {
      const cm = getCM(view);
      if (!cm) throw new Error("Vim is not running in this view");
      for (const first_key of first_keys[context])
        Vim.handleKey(cm, first_key, "user");
      Vim.handleKey(cm, key, "user");
      return (cm.state.vim?.inputState.keyBuffer.length ?? 0) === 0;
    } finally {
      view.destroy();
    }
  }

  test.each(["normal", "visual", "operatorPending"] as const)(
    "VIM-016 the engine runs exactly the listed one-key commands in %s mode",
    (context) => {
      for (const key of candidates) Vim.noremap(key + key, "x", "");

      const actual = candidates.filter((key) => runs_at_once(context, key));
      const listed = candidates.filter((key) =>
        built_in_one_key_commands.get(key)?.includes(context),
      );
      expect(actual).toEqual(listed);
    },
    60_000,
  );
});

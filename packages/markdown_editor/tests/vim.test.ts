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
import { Compartment, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Vim, getCM } from "@replit/codemirror-vim";
import { block_field } from "../src/core/block_field";
import { create_markdown_state } from "../src/core/editor";
import { commonmark } from "../src/plugins/commonmark/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { gfm } from "../src/plugins/gfm/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import { vim_mode, type VimMode } from "../src/plugins/vim/index";
import { apply_vimrc, parse_vimrc } from "../src/plugins/vim/vimrc";

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

function exCommand(view: EditorView, command: string) {
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

    exCommand(view, "undo");
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");

    exCommand(view, "redo");
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
    exCommand(view, "unmap l");
    apply_vimrc("imap jk <Esc>");
    press(view, "l");
    expect(view.state.selection.main.head).toBe(1);
  });
});

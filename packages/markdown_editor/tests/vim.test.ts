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
import { create_markdown_state } from "../src/core/editor";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import { vim_mode, type VimMode } from "../src/plugins/vim/index";
import { apply_vimrc, parse_vimrc } from "../src/plugins/vim/vimrc";

// jsdom has no layout, and the block cursor measures text. j and k move by
// screen lines, so with no layout they run to the end of the document. The
// tests below move with counts and G instead.
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
  for (const view of open_views) {
    view.destroy();
    view.dom.remove();
  }
  open_views.clear();
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
      plugins: [commonmark(), gfm(), slash_menu()],
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
    ]);
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
});

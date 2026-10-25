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
import { completionStatus } from "@codemirror/autocomplete";
import { Compartment, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CodeMirror, Vim, getCM } from "@replit/codemirror-vim";
import { block_field } from "../src/core/block_field";
import { create_markdown_state } from "../src/core/editor";
import { set_editor_mode } from "../src/core/editor_mode";
import { commonmark } from "../src/plugins/commonmark/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { gfm } from "../src/plugins/gfm/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import {
  close_vim_prompt,
  sync_clipboard_from_host,
  vim_keybindings,
  type VimKeybindingsOptions,
  type VimStatus,
} from "../src/plugins/vim/index";
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
  vi.useRealTimers();
  for (const view of open_views) view.destroy();
  open_views.clear();
  document.body.replaceChildren();
  apply_vimrc("");
  Vim.resetVimGlobalState_();
});

const table = "| a | b |\n| - | - |\n| 1 | 2 |";

function vim_editor(
  source: string,
  options: {
    statuses?: VimStatus[];
    vim?: Compartment;
    keybindings?: VimKeybindingsOptions;
  } = {},
) {
  const extension = vim_keybindings({
    on_status_change: (status) => options.statuses?.push(status),
    ...options.keybindings,
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

// Real keydowns, so Vim, the guards and the keymaps run in their real order.
// Keys are written the way Vim writes them: "x", "<Esc>", "<C-v>".
function press(view: EditorView, ...keys: string[]) {
  for (const key of keys) keydown(view, key);
}

const key_names: Record<string, string> = {
  Esc: "Escape",
  CR: "Enter",
  Space: " ",
  BS: "Backspace",
  Del: "Delete",
  Tab: "Tab",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
};

function keydown(view: EditorView, vim_key: string): KeyboardEvent {
  const [, modifiers = "", name = vim_key] =
    /^<((?:[CSAM]-)*)(.+)>$/.exec(vim_key) ?? [];
  const event = new KeyboardEvent("keydown", {
    key: key_names[name] ?? name,
    ctrlKey: modifiers.includes("C-"),
    shiftKey: modifiers.includes("S-"),
    altKey: modifiers.includes("A-"),
    metaKey: modifiers.includes("M-"),
    bubbles: true,
    cancelable: true,
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

// Text typed in insert mode: the keydown goes to Vim first, and what it does
// not take is inserted, like the browser would.
function type(view: EditorView, text: string) {
  for (const character of text) {
    if (keydown(view, character).defaultPrevented) continue;
    view.dispatch(
      view.state.update(view.state.replaceSelection(character), {
        userEvent: "input.type",
      }),
    );
  }
}

// Text that arrives without a key: the accent menu, the emoji picker, an IME
// commit. CodeMirror asks its input handlers first, like this.
function text_input(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  const insert = () => view.state.update(view.state.replaceSelection(text));
  const handled = view.state
    .facet(EditorView.inputHandler)
    .some((handler) => handler(view, from, to, text, insert));
  if (!handled) view.dispatch(insert());
}

function ex_command(view: EditorView, command: string) {
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  Vim.handleEx(cm, command);
}

function menu_is_open(view: EditorView) {
  return view.dom.querySelector(".cm-tooltip-autocomplete") !== null;
}

function table_widget(view: EditorView) {
  return view.dom.querySelector("[data-md-block]");
}

function panel_text(view: EditorView) {
  return view.dom.querySelector(".cm-vim-panel")?.textContent ?? "";
}

function doc(view: EditorView) {
  return view.state.doc.toString();
}

describe("vim mode", () => {
  test("VIM-001 u undoes dd through the source history and <C-r> redoes it", () => {
    const view = vim_editor("one\ntwo\nthree");
    press(view, "2", "G", "d", "d");
    expect(doc(view)).toBe("one\nthree");

    press(view, "u");
    expect(doc(view)).toBe("one\ntwo\nthree");

    press(view, "<C-r>");
    expect(doc(view)).toBe("one\nthree");

    ex_command(view, "undo");
    expect(doc(view)).toBe("one\ntwo\nthree");

    ex_command(view, "redo");
    expect(doc(view)).toBe("one\nthree");
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
    press(view, "2", "G", "i", "<Down>");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
    expect(table_widget(view)).toBeNull();

    press(view, "<Esc>", "6", "G", "i", "<Up>");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(5).from);
  });

  test("VIM-003 reports each mode change, starting in normal", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("text", { statuses });
    press(view, "i", "<Esc>", "V", "<Esc>", "R");
    const modes = statuses.map((status) => status.mode);
    expect(modes.filter((mode, index) => mode !== modes[index - 1])).toEqual([
      "normal",
      "insert",
      "normal",
      "visual_line",
      "normal",
      "replace",
    ]);
  });

  test("VIM-006 Esc closes an open slash menu before it leaves insert mode", async () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("", { statuses });
    press(view, "i");
    type(view, "/");
    await vi.waitFor(() => {
      expect(menu_is_open(view)).toBe(true);
    });

    press(view, "<Esc>");
    expect(menu_is_open(view)).toBe(false);
    expect(statuses.at(-1)?.mode).toBe("insert");

    press(view, "<Esc>");
    expect(statuses.at(-1)?.mode).toBe("normal");
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

  test("VIM-009 a visual selection from above a table keeps the widget, and d deletes the whole table", () => {
    const view = vim_editor(`before\n\n${table}\n\nafter`);
    press(view, "2", "G", "V", "5", "G");
    expect(table_widget(view)).not.toBeNull();
    expect(table_widget(view)?.classList.contains("md-block-selected")).toBe(
      true,
    );

    press(view, "d");
    expect(doc(view)).toBe("before\n\nafter");
  });

  test.each([
    {
      name: "code block",
      source: "before\n\n```ts\nconst a = 1;\n```\n\nafter",
      keys: ["4", "G", "v", "l"],
    },
    {
      name: "table",
      source: `before\n\n${table}\n\nafter`,
      keys: ["5", "G", "V"],
    },
  ])(
    "VIM-019 a visual selection inside a $name keeps its source, until it grows past the block",
    ({ source, keys }) => {
      const view = vim_editor(source);
      press(view, ...keys);
      expect(view.state.selection.main.empty).toBe(false);
      expect(table_widget(view)).toBeNull();

      press(view, "<Esc>");
      expect(table_widget(view)).toBeNull();

      press(view, "v", "G");
      expect(table_widget(view)).not.toBeNull();
    },
  );

  test("VIM-010 undo inside a revealed code block restores the source, and the block renders once the caret leaves", () => {
    const source = "before\n\n```ts\nconst a = 1;\n```\n\nafter";
    const view = vim_editor(source);
    press(view, "4", "G", "A");
    type(view, " // note");
    press(view, "<Esc>");
    expect(view.state.doc.line(4).text).toBe("const a = 1; // note");
    expect(table_widget(view)).toBeNull();

    press(view, "u");
    expect(doc(view)).toBe(source);

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
    "VIM-015 a mouse range selection in a $name gives focus back to the editor and shows the block as source",
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
      expect(table_widget(view)).toBeNull();
      expect(view.state.selection.main.empty).toBe(false);

      press(view, "y");
      expect(doc(view)).toBe(source);
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
      expect(doc(view)).toBe(expected_doc);
    },
  );
});

describe("keys around Vim", () => {
  test("VIM-021 Esc right after typing leaves insert mode while completion is still pending", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("", { statuses });
    press(view, "i");
    type(view, "hello");
    expect(completionStatus(view.state)).toBe("pending");

    press(view, "<Esc>");
    expect(statuses.at(-1)?.mode).toBe("normal");
    expect(completionStatus(view.state)).toBeNull();
  });

  test.each(["<C-[>", "<C-c>"])(
    "VIM-022 %s closes an open slash menu before it leaves insert mode",
    async (key) => {
      const statuses: VimStatus[] = [];
      const view = vim_editor("", { statuses });
      press(view, "i");
      type(view, "/");
      await vi.waitFor(() => {
        expect(menu_is_open(view)).toBe(true);
      });

      press(view, key);
      expect(menu_is_open(view)).toBe(false);
      expect(statuses.at(-1)?.mode).toBe("insert");

      press(view, key);
      expect(statuses.at(-1)?.mode).toBe("normal");
    },
  );

  test("VIM-023 keys Vim does not bind never edit the note in normal mode", () => {
    const was_mac = CodeMirror.isMac;
    const source = "- a\n  - b c d";
    function expect_keys_leave_note_alone(keys: string[]) {
      const view = vim_editor(source);
      press(view, "2", "G", "w");
      for (const key of keys) {
        expect(keydown(view, key).defaultPrevented, key).toBe(true);
        expect(doc(view), key).toBe(source);
      }
    }
    try {
      // Ctrl keys are Vim's on macOS, which has Cmd for the app.
      CodeMirror.isMac = true;
      expect_keys_leave_note_alone([
        "<C-k>",
        "<C-h>",
        "<C-t>",
        "<S-Tab>",
        "<A-BS>",
        "<M-BS>",
        "<M-Del>",
        "<A-Del>",
        "<S-CR>",
        "<M-CR>",
        "<A-Up>",
        "<A-Down>",
        "<S-A-Up>",
        "<S-A-Down>",
        "<S-A-A>",
      ]);
      // CodeMirror's Mod is Ctrl in jsdom. These stand for Cmd on a Mac.
      CodeMirror.isMac = false;
      expect_keys_leave_note_alone(["<C-]>", "<C-A-\\>", "<C-S-k>", "<C-/>"]);
    } finally {
      CodeMirror.isMac = was_mac;
    }
  });

  test("VIM-024 text that arrives without a key is dropped in normal mode, but f still takes a dead key", () => {
    const view = vim_editor("ab é");
    text_input(view, "😀");
    text_input(view, "にほん");
    expect(doc(view)).toBe("ab é");

    // A dead key comes as keydown "Dead", then the composed text.
    press(view, "f");
    keydown(view, "Dead");
    text_input(view, "é");
    expect(doc(view)).toBe("ab é");
    expect(view.state.selection.main.head).toBe(3);
  });
});

describe("undo steps", () => {
  test("VIM-025 one insert session is one step, however long the pauses", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const view = vim_editor("abc");
    press(view, "A");
    type(view, " one");
    vi.advanceTimersByTime(2000);
    type(view, " two");
    press(view, "<CR>");
    type(view, "three");
    press(view, "<Esc>", "u");
    expect(doc(view)).toBe("abc");
  });

  test.each([
    { keys: ["c", "w"], typed: "X", source: "word rest" },
    { keys: ["o"], typed: "foo", source: "abc" },
    { keys: ["3", "i"], typed: "ab", source: "x" },
  ])(
    "VIM-025 the change that opens insert mode joins the session: $keys",
    ({ keys, typed, source }) => {
      const view = vim_editor(source);
      press(view, ...keys);
      type(view, typed);
      press(view, "<Esc>", "u");
      expect(doc(view)).toBe(source);
    },
  );

  test("VIM-025 every typed normal mode key is its own step, a macro and a map are one", () => {
    const view = vim_editor("abcd\nefgh\n1\n2\n3");
    press(view, "x", "x", "u");
    expect(doc(view)).toBe("bcd\nefgh\n1\n2\n3");

    press(view, "u", "q", "a", "x", "x", "q", "2", "G", "@", "a");
    expect(doc(view)).toBe("cd\ngh\n1\n2\n3");
    press(view, "u");
    expect(doc(view)).toBe("cd\nefgh\n1\n2\n3");

    expect(apply_vimrc("nnoremap Q ddp")).toEqual([]);
    press(view, "3", "G", "Q");
    expect(doc(view)).toBe("cd\nefgh\n2\n1\n3");
    press(view, "u");
    expect(doc(view)).toBe("cd\nefgh\n1\n2\n3");
  });

  test("VIM-025 a map with o on a list item is one step, though o continues the list another way", () => {
    const view = vim_editor("- a\n- b\n- c");
    expect(apply_vimrc("nnoremap Q ddox<Esc>")).toEqual([]);
    press(view, "Q");
    expect(doc(view)).toBe("- b\n- x\n- c");
    press(view, "u");
    expect(doc(view)).toBe("- a\n- b\n- c");
  });
});

describe("status", () => {
  test("VIM-027 showcmd shows pending keys and the visual selection size", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("one two three\nfour five six", { statuses });
    const showcmd = () => statuses.at(-1)?.showcmd;

    press(view, "2", "d");
    expect(showcmd()).toBe("2d");
    press(view, "w");
    expect(showcmd()).toBe("");

    press(view, "v", "l", "l");
    expect(showcmd()).toBe("3");
    press(view, "<Esc>", "V", "j");
    expect(showcmd()).toBe("2");
    press(view, "<Esc>", "g", "g", "<C-v>", "j", "l");
    expect(showcmd()).toBe("2x2");
    press(view, "<Esc>", "/");
    expect(showcmd()).toBe("");
  });

  test("VIM-027 showcmd keeps the pending keys after a waiting map key resolves", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const statuses: VimStatus[] = [];
    const view = vim_editor("one two three", { statuses });
    expect(apply_vimrc("nnoremap <Space>w x\nnnoremap <Space>ab x")).toEqual(
      [],
    );
    const showcmd = () => statuses.at(-1)?.showcmd;

    press(view, "<Space>", "d");
    expect(showcmd()).toBe("d");
    press(view, "<Esc>");

    press(view, "<Space>", "a");
    expect(showcmd()).toBe("␣a");
    press(view, "b");
    expect(showcmd()).toBe("");
  });

  test("VIM-027 status says when a macro records, and the one command after <C-o>", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("text", { statuses });
    press(view, "q", "q");
    expect(statuses.at(-1)?.recording).toBe("q");
    press(view, "q");
    expect(statuses.at(-1)?.recording).toBeNull();

    press(view, "i", "<C-o>");
    expect(statuses.at(-1)?.mode).toBe("insert_normal");
    press(view, "l");
    expect(statuses.at(-1)?.mode).toBe("insert");
  });
});

describe("map waits", () => {
  const vimrc = [
    'let mapleader = " "',
    "nnoremap <leader>d dd",
    "nnoremap ,x x",
    "nmap Q <leader>d",
  ].join("\n");

  test("VIM-028 a map that starts with a Vim key waits for the next key", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const statuses: VimStatus[] = [];
    const view = vim_editor("1\n2\n3\n4\n5\n6\n7", { statuses });
    expect(apply_vimrc(vimrc)).toEqual([]);

    press(view, "<Space>");
    expect(statuses.at(-1)?.showcmd).toBe("␣");
    press(view, "d");
    expect(doc(view)).toBe("2\n3\n4\n5\n6\n7");

    press(view, ",", "x");
    expect(doc(view)).toBe("\n3\n4\n5\n6\n7");

    press(view, "3", "<Space>", "d");
    expect(doc(view)).toBe("5\n6\n7");

    press(view, "Q");
    expect(doc(view)).toBe("6\n7");
  });

  test("VIM-028 the key alone runs after timeoutlen, and Esc or a reload drop it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const view = vim_editor("abcdef");
    expect(apply_vimrc(`${vimrc}\nset timeoutlen=300`)).toEqual([]);
    const head = () => view.state.selection.main.head;

    press(view, "<Space>");
    vi.advanceTimersByTime(299);
    expect(head()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(head()).toBe(1);

    for (const cancel of ["<Esc>", "<C-[>", "<C-c>"]) {
      press(view, "<Space>", cancel);
      vi.advanceTimersByTime(1000);
      expect(head(), cancel).toBe(1);
    }

    press(view, "<Space>");
    apply_vimrc(vimrc);
    vi.advanceTimersByTime(1000);
    expect(head()).toBe(1);
  });
});

describe("clipboard", () => {
  // The engine's clipboard hook is global to the page.
  const original_clipboard = Vim.clipboard;
  afterEach(() => {
    Vim.clipboard = original_clipboard;
  });

  function host_clipboard(initial = "") {
    const host = {
      text: initial,
      write_text: vi.fn((text: string) => {
        host.text = text;
        return Promise.resolve();
      }),
      read_text: vi.fn(() => Promise.resolve(host.text)),
    };
    return host;
  }

  function unnamed_register() {
    return Vim.getRegisterController().unnamedRegister;
  }

  test('VIM-029 "+ and "* use the host clipboard, set clipboard=unnamed writes it for every yank', async () => {
    const host = host_clipboard();
    const view = vim_editor("one\ntwo", { keybindings: { clipboard: host } });
    press(view, '"', "*", "y", "y");
    expect(host.write_text).toHaveBeenLastCalledWith("one\n");

    host.text = "from\nelsewhere\n";
    press(view, '"', "+", "p");
    await vi.waitFor(() => {
      expect(doc(view)).toBe("one\nfrom\nelsewhere\ntwo");
    });

    expect(apply_vimrc("set clipboard=unnamed")).toEqual([]);
    press(view, "G", "y", "y");
    expect(host.write_text).toHaveBeenLastCalledWith("two\n");

    host.write_text.mockClear();
    press(view, '"', "_", "d", "d");
    expect(host.write_text).not.toHaveBeenCalled();

    host.read_text.mockReturnValueOnce(Promise.reject(new Error("denied")));
    press(view, '"', "+", "p");
    await vi.waitFor(() => {
      expect(panel_text(view)).toContain("Could not read the clipboard");
    });
  });

  test('VIM-029 "+p waits for the write before it', async () => {
    let finish_write = () => {};
    const host = host_clipboard();
    host.write_text.mockImplementation((text: string) => {
      host.text = text;
      return new Promise<void>((resolve) => {
        finish_write = resolve;
      });
    });
    const view = vim_editor("abc", { keybindings: { clipboard: host } });
    press(view, '"', "+", "y", "y", '"', "+", "p");
    await Promise.resolve();
    expect(host.read_text).not.toHaveBeenCalled();
    finish_write();
    await vi.waitFor(() => {
      expect(doc(view)).toBe("abc\nabc");
    });
  });

  test("VIM-029 under clipboard=unnamed a put right after a yank or delete never reads the clipboard", () => {
    const host = host_clipboard("stale");
    const view = vim_editor("abc\ndef", { keybindings: { clipboard: host } });
    expect(
      apply_vimrc("set clipboard=unnamed\nnnoremap Q yypx\nnnoremap W xp"),
    ).toEqual([]);

    press(view, "Q");
    expect(doc(view)).toBe("abc\nbc\ndef");
    press(view, "g", "g", "W");
    expect(doc(view)).toBe("bac\nbc\ndef");
    expect(host.read_text).not.toHaveBeenCalled();
  });

  test("VIM-029 sync_clipboard_from_host takes text from other apps and keeps our own writes", async () => {
    const host = host_clipboard();
    const view = vim_editor("one\ntwo", { keybindings: { clipboard: host } });

    host.text = "ignored";
    await sync_clipboard_from_host();
    expect(unnamed_register().toString()).toBe("");

    apply_vimrc("set clipboard=unnamed");
    press(view, "y", "y");
    await sync_clipboard_from_host();
    press(view, "p");
    expect(doc(view)).toBe("one\none\ntwo");

    host.text = "other\n";
    await sync_clipboard_from_host();
    press(view, "p");
    expect(doc(view)).toBe("one\none\nother\ntwo");

    host.text = "copied";
    view.contentDOM.dispatchEvent(new Event("copy", { bubbles: true }));
    await vi.waitFor(() => {
      expect(unnamed_register().toString()).toBe("copied");
    });
  });
});

describe("ex commands", () => {
  test("VIM-030 :w saves, :q closes, :wq saves and then closes", async () => {
    const calls: string[] = [];
    const view = vim_editor("text", {
      keybindings: {
        on_write: () => {
          calls.push("write");
          return Promise.resolve();
        },
        on_quit: () => calls.push("quit"),
      },
    });
    ex_command(view, "w");
    ex_command(view, "q");
    ex_command(view, "q!");
    expect(calls).toEqual(["write", "quit", "quit"]);

    calls.length = 0;
    ex_command(view, "wq");
    ex_command(view, "x");
    await vi.waitFor(() => {
      expect(calls).toEqual(["write", "write", "quit", "quit"]);
    });
    expect(doc(view)).toBe("text");
  });

  test("VIM-030 without a host, :w says it does not save, without naming a shortcut", () => {
    const view = vim_editor("text");
    ex_command(view, "w");
    expect(panel_text(view)).toBe(":w does not save here");
    expect(doc(view)).toBe("text");
  });
});

describe("buffer switches", () => {
  test("VIM-031 close_vim_prompt closes an open / prompt", () => {
    const view = vim_editor("text");
    press(view, "/");
    expect(view.dom.querySelector(".cm-vim-panel input")).not.toBeNull();

    close_vim_prompt(view);
    expect(view.dom.querySelector(".cm-vim-panel")).toBeNull();
  });

  test("VIM-031 a buffer left in insert mode comes back with its insert session closed", () => {
    const view = vim_editor("abc");
    press(view, "A");
    type(view, "X");
    const left_in_insert = view.state;
    view.setState(
      create_markdown_state("other", { plugins: [], extensions: [] }),
    );
    view.setState(left_in_insert);

    press(view, "0", "x", "u");
    expect(doc(view)).toBe("abcX");
  });

  test("VIM-031 a buffer left in visual mode comes back with its selection collapsed", async () => {
    const view = vim_editor("abc def");
    press(view, "v", "l", "l");
    const left_in_visual = view.state;
    view.setState(
      create_markdown_state("other", { plugins: [], extensions: [] }),
    );
    view.setState(left_in_visual);

    await Promise.resolve();
    expect(view.state.selection.main.empty).toBe(true);
  });
});

describe("o and O", () => {
  test.each([
    ["- a", "- a\n- "],
    ["- [ ] a", "- [ ] a\n- [ ] "],
    ["> a", "> a\n> "],
    ["- ", "- \n"],
    ["plain", "plain\n"],
  ])("VIM-032 o on %j continues the construct", (source, expected) => {
    const view = vim_editor(source);
    press(view, "o");
    expect(doc(view)).toBe(expected);
    expect(view.state.selection.main.head).toBe(expected.length);
  });

  test("VIM-032 o in source mode gives a plain line", () => {
    const view = vim_editor("- a");
    set_editor_mode(view, "source");
    press(view, "o");
    expect(doc(view)).toBe("- a\n");
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
        "nmap <leader>w :w<CR>",
        "xnoremap ,y y",
        "nn <Space>x dd",
        'set nopcre " use JS regex',
      ].join("\r\n"),
    );

    expect(commands).toMatchObject([
      { kind: "map", line: 3, context: "insert", lhs: "jk", rhs: "<Esc>" },
      { kind: "map", line: 4, context: "normal", recursive: false, rhs: "y$" },
      { kind: "map", line: 8, context: null, rhs: ":s/a  b/<CR>" },
      { kind: "unmap", line: 9, context: "normal", lhs: "Y" },
      {
        kind: "set",
        line: 10,
        items: ["nopcre", "insertModeEscKeysTimeout=300"],
      },
      { kind: "map", line: 11, lhs: "<Space>w" },
      { kind: "map", line: 12, context: "visual", lhs: ",y" },
      { kind: "map", line: 13, context: "normal", lhs: "<Space>x" },
      { kind: "set", line: 14, items: ["nopcre"] },
    ]);
    expect(problems.map((problem) => [problem.line, problem.severity])).toEqual(
      [
        [6, "error"],
        [7, "error"],
      ],
    );
  });

  test("VIM-004 key names are rewritten to the engine's spelling, and unknown ones are problems", () => {
    const { commands, problems } = parse_vimrc(
      [
        "inoremap jk <esc>",
        "nnoremap <C-J> 3l",
        "nnoremap Q <cr>",
        "nmap <m-x> <C-S-J>",
        "nnoremap X :s/<b>/c/<cr>",
        "nnoremap Z <Nop>",
        ":nmap gx dd",
        "unmap <c-j>",
        "inoremap <C-b> <b></b>",
        "nnoremap <foo>x dd",
        "nnoremap D x<bogus>",
      ].join("\n"),
    );

    expect(commands).toMatchObject([
      { line: 1, lhs: "jk", rhs: "<Esc>" },
      { line: 2, lhs: "<C-j>", rhs: "3l" },
      { line: 3, lhs: "Q", rhs: "<CR>" },
      { line: 4, lhs: "<A-x>", rhs: "<C-S-J>" },
      { line: 5, lhs: "X", rhs: ":s/<b>/c/<CR>" },
      { line: 6, lhs: "Z", rhs: "" },
      { line: 7, kind: "map", context: "normal", lhs: "gx" },
      { line: 8, kind: "unmap", lhs: "<C-j>" },
      { line: 9, lhs: "<C-b>", rhs: "<b></b>" },
    ]);
    expect(problems.map((problem) => problem.line)).toEqual([10, 11]);
    expect(problems[0]?.message).toContain("<lt>");
  });

  test("VIM-004 command abbreviations follow Vim's table", () => {
    const { commands, problems } = parse_vimrc(
      [
        "nn a b",
        "nno a b",
        "ino a b",
        "xn a b",
        "vn a b",
        "no a b",
        "se nopcre",
        "n a b",
        "nnoremapx a b",
      ].join("\n"),
    );
    expect(commands.map((command) => command.line)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(problems.map((problem) => problem.line)).toEqual([8, 9]);
  });

  test("VIM-004 a pasted terminal vimrc reports only real errors, and skips the rest", () => {
    const real_lines = [
      "set nocompatible",
      "syntax on",
      "filetype plugin indent on",
      "set number relativenumber",
      "set tabstop=4 shiftwidth=4 expandtab",
      "set ignorecase smartcase",
      "set nosmartcase",
      "set clipboard=unnamed",
      'let mapleader = ","',
      "nnoremap <leader>w :w<CR>",
      "nnormap Q gq",
      "xnoremap < <gv",
      "inoremap jk <Esc>",
      'if has("gui_running")',
      "  set guifont=Menlo:h14",
      "  nnoremap <C-s> :w<CR>",
      "endif",
      "call plug#begin()",
      "Plug 'tpope/vim-surround'",
      "call plug#end()",
      "autocmd BufWritePre * %s/\\s\\+$//e",
      "let g:netrw_banner = 0",
    ];
    // More of what terminal Vim and Neovim users have. None of it applies
    // here, and none of it is an error.
    const terminal_lines = [
      "set t_Co=256",
      "set showmatch matchtime=2",
      "set ttimeout ttimeoutlen=50",
      "set statusline=%f\\ %m",
      "set showtabline=2 completeopt=menu,preview",
      "set nojoinspaces display=lastline autochdir virtualedit=onemore confirm",
      "set nostartofline modelines=0 guicursor= inccommand=split",
      "set path+=** wildignore+=*.pyc whichwrap+=<,>",
      "try",
      "  colorscheme gruvbox",
      "catch",
      "  colorscheme default",
      "endtry",
      "lua << EOF",
      "require('plugin').setup {}",
      "nnoremap Z zz",
      "EOF",
      "execute 'set background=' . g:mode",
      "silent! source ~/.vimrc.local",
      "setlocal spell",
      "unlet g:loaded_netrw",
      "echo 'loaded'",
      "iabbrev teh the",
      "nohlsearch",
      "vim9script",
      "nnoremap <expr> j v:count ? 'j' : 'gj'",
    ];
    const problems = apply_vimrc(
      [...real_lines, ...terminal_lines, "nnoremap Y y$"].join("\n"),
    );
    const lines = (severity: string) =>
      problems
        .filter((problem) => problem.severity === severity)
        .map((problem) => problem.line);
    const after = (count: number, length: number) =>
      Array.from({ length }, (_, offset) => count + 1 + offset);
    expect(lines("error")).toEqual([7, 11]);
    expect(lines("skipped")).toEqual([
      1,
      2,
      3,
      4,
      5,
      ...after(13, 9),
      ...after(real_lines.length, terminal_lines.length),
    ]);
    expect(Vim.getOption("clipboard")).toBe("unnamed");
  });

  test.each([
    ['let mapleader = " "', "<Space>w"],
    ["let mapleader = ','", ",w"],
    ['let g:mapleader = "\\<Space>"', "<Space>w"],
    ['let mapleader = "\\\\"', "\\w"],
  ])("VIM-004 %s sets the leader of later maps", (let_line, lhs) => {
    const { commands, problems } = parse_vimrc(
      `nnoremap <leader>a b\n${let_line}\nnnoremap <leader>w b`,
    );
    expect(problems).toEqual([]);
    expect(commands.map((command) => "lhs" in command && command.lhs)).toEqual([
      "\\a",
      lhs,
    ]);
  });

  test("VIM-004 a leader of more than one key is a problem", () => {
    expect(parse_vimrc('let mapleader = "ab"').problems).toMatchObject([
      { line: 1, severity: "error" },
    ]);
  });

  test("VIM-012 a UTF-8 byte order mark before the first line is ignored", () => {
    const { commands, problems } = parse_vimrc('﻿" comment\nimap jk <Esc>');
    expect(problems).toEqual([]);
    expect(commands).toHaveLength(1);

    expect(parse_vimrc("﻿imap jk <Esc>").problems).toEqual([]);
  });

  test("VIM-005 applies maps and options, and a reload drops what left the file", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("text", { statuses });

    expect(
      apply_vimrc("imap jk <Esc>\nset insertModeEscKeysTimeout=300"),
    ).toEqual([]);
    expect(Vim.getOption("insertModeEscKeysTimeout")).toBe(300);
    press(view, "i");
    type(view, "jk");
    expect(statuses.at(-1)?.mode).toBe("normal");
    expect(doc(view)).toBe("text");

    expect(apply_vimrc("")).toEqual([]);
    expect(Vim.getOption("insertModeEscKeysTimeout")).toBe(200);
    press(view, "i");
    type(view, "jk");
    expect(statuses.at(-1)?.mode).toBe("insert");
    expect(doc(view)).toBe("jktext");
  });

  test("VIM-005 maps written as <esc> and <C-J> still fire", () => {
    const statuses: VimStatus[] = [];
    const view = vim_editor("text here", { statuses });

    expect(apply_vimrc("inoremap jk <esc>\nnnoremap <C-J> 3l")).toEqual([]);
    press(view, "<C-j>");
    expect(view.state.selection.main.head).toBe(3);

    press(view, "i");
    type(view, "jk");
    expect(statuses.at(-1)?.mode).toBe("normal");
    expect(doc(view)).toBe("text here");
  });

  test("VIM-005 a plain unmap removes the normal map, and a key that was never mapped is a problem", () => {
    const view = vim_editor("text");

    expect(apply_vimrc("nnoremap Y x\nunmap Y")).toEqual([]);
    press(view, "Y");
    expect(doc(view)).toBe("text");

    expect(apply_vimrc("unmap Y").map((problem) => problem.line)).toEqual([1]);
  });

  test("VIM-005 xnoremap maps visual mode, and nmap x xp runs the built-in x first", () => {
    const view = vim_editor("abcd");
    expect(apply_vimrc("nmap x xp\nxnoremap > <Esc>0")).toEqual([]);

    press(view, "x");
    expect(doc(view)).toBe("bacd");

    press(view, "v", "l", ">");
    expect(doc(view)).toBe("bacd");
    expect(view.state.selection.main.head).toBe(0);
  });

  test("VIM-005 recursive maps that loop are problems and are not applied", () => {
    const problems = apply_vimrc(
      [
        "nmap a b",
        "nmap b a",
        "nmap Q xQ",
        "nmap j gj",
        "nmap Z dZ",
        "nmap S :s/S/x/<CR>",
      ].join("\n"),
    );
    expect(problems.map((problem) => problem.line)).toEqual([1, 2, 3]);
    expect(problems[0]?.message).toContain("nnoremap");

    const view = vim_editor("abc");
    press(view, "Q");
    expect(doc(view)).toBe("abc");
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
      [
        "set nosuchoption",
        "set textwidth=72",
        "set pcre=1",
        "unmap l",
        "set __proto__=oops",
        "set constructor=oops",
        "set clipboard=bogus",
        "set clipboard+=unnamed",
        "set timeoutlen=abc",
      ].join("\n"),
    );
    expect(problems.map((problem) => problem.line)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(({} as { value?: unknown }).value).toBeUndefined();

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

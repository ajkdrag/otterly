/** @vitest-environment jsdom */
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  cursorCharRight,
  deleteCharBackward,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CodeMirror, Vim, getCM } from "@replit/codemirror-vim";
import { create_text_state } from "../src/core/editor";
import { vim_keybindings } from "../src/plugins/vim/index";
import table from "./vim_conformance_cases.json";

// Each case is a text, a cursor, keys, and what real Vim 9.1 did with them
// (vim -Nu NONE, with autoindent expandtab shiftwidth=2). Cursors are
// [line, column], both from 1, the column in characters. A case we accept to
// differ has a `deviation` with the engine's answer and the reason we give
// users. An engine upgrade that drops one of our patches fails here.
type Expected = {
  lines: string[];
  cursor: [number, number];
  register?: string | null;
  register_type?: "char" | "line" | "block" | null;
};
type ConformanceCase = {
  id: string;
  text: string;
  at: [number, number];
  keys: string;
  vim: Expected;
  deviation?: Expected & { reason: string };
};

const cases = table as ConformanceCase[];

// jsdom has no layout. The block cursor measures text, and CodeMirror's
// vertical motion runs to the end of the document. Lines here are short and
// unwrapped, so a screen line is a logical line.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
// eslint-disable-next-line @typescript-eslint/unbound-method
const original_move_vertically = EditorView.prototype.moveVertically;
let view: EditorView;

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  EditorView.prototype.moveVertically = function (start, forward) {
    const { doc } = this.state;
    const line = doc.lineAt(start.head);
    const target = line.number + (forward ? 1 : -1);
    if (target < 1) return EditorSelection.cursor(0);
    if (target > doc.lines) return EditorSelection.cursor(doc.length);
    const next = doc.line(target);
    return EditorSelection.cursor(
      next.from + Math.min(start.head - line.from, next.length),
    );
  };
  const parent = document.createElement("div");
  document.body.append(parent);
  view = new EditorView({ parent });
});

afterAll(() => {
  view.destroy();
  document.body.replaceChildren();
  EditorView.prototype.moveVertically = original_move_vertically;
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

test.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
  Vim.resetVimGlobalState_();
  // A text state per case. Markdown states add theme rules to jsdom's one
  // stylesheet, and 350 of them make setState crawl.
  view.setState(create_text_state(c.text, vim_keybindings()));
  view.dispatch({ selection: EditorSelection.cursor(offset_at(c.text, c.at)) });
  for (const [token] of c.keys.matchAll(/<[^<>]+>|./gsu)) send_key(token);

  const expected = c.deviation ?? c.vim;
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  const cursor = cm.getCursor();
  const line_text = cm.getLine(cursor.line);
  expect({
    lines: view.state.doc.toString().split("\n"),
    cursor: [
      cursor.line + 1,
      Array.from(line_text.slice(0, cursor.ch)).length + 1,
    ],
  }).toEqual({ lines: expected.lines, cursor: expected.cursor });

  if (expected.register === undefined) return;
  const register = Vim.getRegisterController().unnamedRegister;
  expect(register.toString()).toBe(expected.register ?? "");
  if (expected.register_type)
    expect(
      register.blockwise ? "block" : register.linewise ? "line" : "char",
    ).toBe(expected.register_type);
});

function offset_at(text: string, [line, column]: [number, number]) {
  const lines = text.split("\n");
  const before = lines.slice(0, line - 1).join("\n");
  const in_line = Array.from(lines[line - 1] ?? "")
    .slice(0, column - 1)
    .join("");
  return (line > 1 ? before.length + 1 : 0) + in_line.length;
}

// Keys go to the engine the way its keydown handler sends them. What Vim does
// not take falls through to the editor, like a real keydown would: text and
// Enter in insert mode, and every key in the / and : prompt.
function send_key(token: string) {
  const cm = getCM(view);
  if (!cm) throw new Error("Vim is not running in this view");
  const key = token === " " ? "<Space>" : token;
  const prompt_input = cm.state.dialog?.querySelector("input");
  if (prompt_input) {
    send_key_to_prompt(prompt_input, key, token);
    return;
  }
  CodeMirror.signal(cm, "inputEvent", { type: "handleKey", key });
  if (Vim.handleKey(cm, key, "user")) return;
  const vim = cm.state.vim;
  if (!vim?.insertMode) return;
  if (cm.state.overwrite) {
    if (token.length === 1) cm.overWriteSelection(token);
    else if (key === "<BS>") CodeMirror.commands.cursorCharLeft(cm);
    return;
  }
  if (key === "<CR>") insertNewlineAndIndent(view);
  else if (key === "<BS>") deleteCharBackward(view);
  else if (key === "<Right>") cursorCharRight(view);
  else if (key === "<Space>" || token.length === 1)
    view.dispatch(
      view.state.update(view.state.replaceSelection(token), {
        userEvent: "input.type",
      }),
    );
}

function send_key_to_prompt(
  input: HTMLInputElement,
  key: string,
  token: string,
) {
  if (key === "<CR>" || key === "<Esc>") {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: key === "<CR>" ? "Enter" : "Escape",
        keyCode: key === "<CR>" ? 13 : 27,
        bubbles: true,
      }),
    );
    return;
  }
  input.value += token;
  input.dispatchEvent(
    new KeyboardEvent("keyup", { key: token, bubbles: true }),
  );
}

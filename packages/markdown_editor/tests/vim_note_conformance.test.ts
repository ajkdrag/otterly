/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CodeMirror, Vim, getCM } from "@replit/codemirror-vim";
import { create_markdown_state } from "../src/core/editor";
import { get_markdown_source } from "../src/core/source_state";
import { callouts } from "../src/plugins/callouts/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { commonmark } from "../src/plugins/commonmark/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import { links } from "../src/plugins/links/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import { vim_keybindings } from "../src/plugins/vim/index";
import { wiki_links } from "../src/plugins/wiki_links/index";

// Key sequences on a whole note in rich mode, the way the app runs them, and
// the file real Vim 9.1 wrote for each. Vim ran with -u NONE -N, each
// sequence from gg on a fresh copy of the note, through feedkeys(keys, "xt")
// so the keys run like typed ones: after a failed motion the rest still runs.
// The note ends with a line break, like a saved file, so these also check
// that Vim mode never treats the empty line after it as a line.
//
// Each case says how Vim changed the lines: from line `line` (from 1) it
// removed `remove` lines and put `add` in their place. Sequences that change
// nothing on this note are left out (xp, gUiw and dt: on "---", ~ on an
// empty line).
const note_lines = [
  "---",
  "title: Vim basics",
  "tags: [vim]",
  "---",
  "# Vim basics",
  "",
  'The quick brown fox jumps over the lazy dog. Second sentence here, with punctuation; and (parens) and "quotes".',
  "",
  "one two three four five",
  "  indented line with two leading spaces",
  "\ttab indented line",
  "",
  "- list item one",
  "- list item two",
  "  - nested item",
  "- [ ] task item",
  "",
  "> blockquote line one",
  "> blockquote line two",
  "",
  "Empty lines follow.",
  "",
  "",
  "End of the paragraph with a [[wiki link]] and a [normal link](https://example.com) and `inline code`.",
  "",
  "| col a | col b |",
  "| ----- | ----- |",
  "| one   | two   |",
  "| three | four  |",
  "",
  "```python",
  "def hello(name):",
  '    return f"hi {name}"',
  "```",
  "",
  "## Second heading",
  "",
  "café résumé naïve 日本語のテキスト and emoji 🔥 done.",
];
const note = note_lines.join("\n") + "\n";

type NoteCase = { keys: string; line: number; remove: number; add: string[] };

const cases: NoteCase[] = [
  { keys: "3wdw", line: 2, remove: 1, add: ["title: basics"] },
  { keys: "jD", line: 2, remove: 1, add: [""] },
  { keys: "jjcwTITLE<Esc>", line: 3, remove: 1, add: ["TITLE: [vim]"] },
  { keys: "}yyp", line: 7, remove: 0, add: [""] },
  { keys: "Gdd", line: 38, remove: 1, add: [] },
  {
    keys: "/fox<CR>x",
    line: 7,
    remove: 1,
    add: [
      'The quick brown ox jumps over the lazy dog. Second sentence here, with punctuation; and (parens) and "quotes".',
    ],
  },
  {
    keys: "5jddp",
    line: 6,
    remove: 2,
    add: [
      'The quick brown fox jumps over the lazy dog. Second sentence here, with punctuation; and (parens) and "quotes".',
      "",
    ],
  },
  { keys: "jjjciwX<Esc>", line: 4, remove: 1, add: ["X"] },
  { keys: "A end<Esc>", line: 1, remove: 1, add: ["--- end"] },
  { keys: "Oabove<Esc>", line: 1, remove: 0, add: ["above"] },
  { keys: "dw..", line: 1, remove: 2, add: [": Vim basics"] },
  {
    keys: "/quick<CR>ct,Q<Esc>",
    line: 7,
    remove: 1,
    add: ['The Q, with punctuation; and (parens) and "quotes".'],
  },
  { keys: "fqr_", line: 1, remove: 1, add: ["_--"] },
  {
    keys: "12jJ",
    line: 13,
    remove: 2,
    add: ["- list item one - list item two"],
  },
  { keys: "12jV2jd", line: 13, remove: 3, add: [] },
  { keys: "12jvey$p", line: 13, remove: 1, add: ["- list item one- list"] },
  { keys: "jjyiwP", line: 3, remove: 1, add: ["tagstags: [vim]"] },
  { keys: "d}", line: 1, remove: 5, add: [] },
  {
    keys: '/quotes<CR>ci"Z<Esc>',
    line: 7,
    remove: 1,
    add: [
      'The quick brown fox jumps over the lazy dog. Second sentence here, with punctuation; and (parens) and "Z".',
    ],
  },
  { keys: "10jdG", line: 11, remove: 28, add: [] },
  {
    keys: "3Jx",
    line: 1,
    remove: 3,
    add: ["--- title: Vim basicstags: [vim]"],
  },
  { keys: "yyjpkdd", line: 2, remove: 1, add: ["---"] },
  { keys: "3iab<Esc>", line: 1, remove: 1, add: ["ababab---"] },
  { keys: "ea!<Esc>", line: 1, remove: 1, add: ["---!"] },
  { keys: "Wd2w", line: 2, remove: 1, add: ["Vim basics"] },
  { keys: "c3wQ<Esc>", line: 1, remove: 2, add: ["Q Vim basics"] },
  { keys: "12jg~~", line: 13, remove: 1, add: ["- LIST ITEM ONE"] },
  { keys: "*dw", line: 4, remove: 1, add: [""] },
  {
    keys: "qaA!<Esc>jq3@a",
    line: 1,
    remove: 4,
    add: ["---!", "title: Vim basics!", "tags: [vim]!", "---!"],
  },
  { keys: '"ayyj"ap', line: 3, remove: 0, add: ["---"] },
  { keys: "majjd'a", line: 2, remove: 3, add: [] },
  {
    keys: "/parens<CR>d%",
    line: 7,
    remove: 1,
    add: [
      'The quick brown fox jumps over the lazy dog. Second sentence here, with punctuation; and arens) and "quotes".',
    ],
  },
  // The end of the note. Every motion stops on the last line with text, and
  // every edit keeps the final line break.
  {
    keys: "Gx",
    line: 38,
    remove: 1,
    add: ["afé résumé naïve 日本語のテキスト and emoji 🔥 done."],
  },
  {
    keys: "99Gx",
    line: 38,
    remove: 1,
    add: ["afé résumé naïve 日本語のテキスト and emoji 🔥 done."],
  },
  {
    keys: "Gjx",
    line: 38,
    remove: 1,
    add: ["afé résumé naïve 日本語のテキスト and emoji 🔥 done."],
  },
  {
    keys: "GJx",
    line: 38,
    remove: 1,
    add: ["afé résumé naïve 日本語のテキスト and emoji 🔥 done."],
  },
  {
    keys: "G$x",
    line: 38,
    remove: 1,
    add: ["café résumé naïve 日本語のテキスト and emoji 🔥 done"],
  },
  {
    keys: "G}x",
    line: 38,
    remove: 1,
    add: ["café résumé naïve 日本語のテキスト and emoji 🔥 done"],
  },
  { keys: "Gd}", line: 38, remove: 1, add: [""] },
  { keys: "GoNEW<Esc>", line: 39, remove: 0, add: ["NEW"] },
  { keys: "yyGp", line: 39, remove: 0, add: ["---"] },
  {
    keys: "GddP",
    line: 37,
    remove: 2,
    add: ["café résumé naïve 日本語のテキスト and emoji 🔥 done.", ""],
  },
  { keys: "Gkdj", line: 37, remove: 2, add: [] },
  { keys: "Gk5dd", line: 37, remove: 2, add: [] },
  { keys: ":$d<CR>", line: 38, remove: 1, add: [] },
  { keys: "dG", line: 1, remove: 38, add: [] },
  { keys: "VGd", line: 1, remove: 38, add: [] },
  { keys: "vG$d", line: 1, remove: 38, add: [""] },
];

// jsdom has no layout. The block cursor measures text, and CodeMirror's
// vertical motion runs to the end of the document. A screen line is a logical
// line here.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
// eslint-disable-next-line @typescript-eslint/unbound-method
const original_move_vertically = EditorView.prototype.moveVertically;
// One state for every case. Each Markdown state adds its theme rules to
// jsdom's one stylesheet, which makes later views slower.
let note_state: EditorState;
let view: EditorView | null = null;

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
  note_state = create_markdown_state(note, {
    plugins: [
      commonmark(),
      gfm(),
      frontmatter(),
      callouts(),
      code_blocks(),
      links({ open_link: () => {} }),
      wiki_links(),
      slash_menu(),
    ],
    extensions: vim_keybindings(),
  });
});

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
  Vim.resetVimGlobalState_();
});

afterAll(() => {
  EditorView.prototype.moveVertically = original_move_vertically;
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

test.each(cases.map((c) => [c.keys, c] as const))("%s", (_keys, c) => {
  const parent = document.createElement("div");
  document.body.append(parent);
  view = new EditorView({ parent, state: note_state });
  view.focus();
  for (const [token] of `gg${c.keys}`.matchAll(/<[^<>]+>|./gsu))
    send_key(view, token);

  const expected = [...note_lines];
  expected.splice(c.line - 1, c.remove, ...c.add);
  // Vim writes a buffer with no lines left as an empty file.
  const file = expected.length > 0 ? expected.join("\n") + "\n" : "";
  expect(get_markdown_source(view.state)).toBe(file);
});

// Keys go to the engine the way its keydown handler sends them, as in
// vim_conformance.test.ts. Real keydowns would let CodeMirror read jsdom's
// stale DOM selection back after the / prompt closes. A character Vim does
// not take in insert mode is typed, like the browser would. No case here
// needs a named key there, so one fails loudly instead of doing nothing.
// Keys in the / prompt go to its input.
function send_key(editor: EditorView, token: string) {
  const cm = getCM(editor);
  if (!cm) throw new Error("Vim is not running in this view");
  const prompt_input = cm.state.dialog?.querySelector("input");
  if (prompt_input) {
    send_key_to_prompt(prompt_input, token);
    return;
  }
  const key = token === " " ? "<Space>" : token;
  CodeMirror.signal(cm, "inputEvent", { type: "handleKey", key });
  if (Vim.handleKey(cm, key, "user") || !cm.state.vim?.insertMode) return;
  if (token.length !== 1) throw new Error(`send_key cannot type ${token}`);
  editor.dispatch(
    editor.state.update(editor.state.replaceSelection(token), {
      userEvent: "input.type",
    }),
  );
}

function send_key_to_prompt(input: HTMLInputElement, token: string) {
  if (token === "<CR>" || token === "<Esc>") {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: token === "<CR>" ? "Enter" : "Escape",
        keyCode: token === "<CR>" ? 13 : 27,
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

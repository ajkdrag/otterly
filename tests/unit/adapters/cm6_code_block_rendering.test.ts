/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown_editor_extensions } from "../../../packages/markdown_editor/src/editor_extensions";
import {
  create_markdown_state,
  source_undo,
} from "../../../packages/markdown_editor/src/source_state";
import {
  history,
  defaultKeymap,
  undo,
  redo,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  forceParsing,
  language,
  syntaxTree,
} from "@codemirror/language";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { languages } from "@codemirror/language-data";
import {
  code_block_rendering,
  read_code_block_view_states,
  replace_code_block_view_states,
  refresh_code_diagrams,
  focus_code_selection,
  type CodeBlockOptions,
} from "../../../packages/markdown_editor/src/code_block_rendering";
import {
  get_find_matches,
  get_find_query,
  markdown_find_highlights,
  update_find_query,
} from "../../../packages/markdown_editor/src/find_highlights";
const views: EditorView[] = [];
beforeEach(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    }),
  });
});
afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function open_code(source: string, options: CodeBlockOptions = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const view = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: source,
      extensions: [
        markdown_language(),
        code_block_rendering(options),
        history(),
        markdown_find_highlights(),
      ],
    }),
  });
  views.push(view);
  // These tests exercise mounted code widgets, not the idle parser's timing.
  forceParsing(view, view.state.doc.length, 1000);
  const content = root.querySelector<HTMLElement>(
    ".md-code-source .cm-content",
  );
  if (!content) throw new Error("Code editor did not mount");
  const inner = EditorView.findFromDOM(content);
  if (!inner) throw new Error("Code editor not found");
  return { view, inner, root };
}
function press(view: EditorView, key: string, extra: KeyboardEventInit = {}) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
}

function code_widget_heights(view: EditorView): number[] {
  const heights: number[] = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    const decorations = typeof source === "function" ? source(view) : source;
    decorations.between(0, view.state.doc.length, (_from, _to, decoration) => {
      const spec: unknown = decoration.spec;
      if (!spec || typeof spec !== "object" || !("widget" in spec)) return;
      const widget = spec.widget;
      if (
        widget &&
        typeof widget === "object" &&
        "estimatedHeight" in widget &&
        typeof widget.estimatedHeight === "number"
      )
        heights.push(widget.estimatedHeight);
    });
  }
  return heights;
}

describe("Rich source-preserving code blocks", () => {
  it("estimates offscreen code height from its body length", () => {
    const { view } = open_code("```\none\ntwo\nthree\n```");

    const [height] = code_widget_heights(view);
    expect(height).toBeGreaterThan(22 * 3 + 16);
    expect(height).toBeLessThan(192);
  });

  it("uses saved source height and omits a hidden diagram source", () => {
    const source = "```mermaid\ngraph TD\nA-->B\n```";
    const open_diagram = (source_hidden: boolean) => {
      const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc: source,
          extensions: [
            markdown_language(),
            code_block_rendering({
              diagram_languages: ["mermaid"],
              render_diagram: () =>
                Promise.resolve(document.createElement("div")),
              initial_view_states: [
                {
                  source_height: 180,
                  diagram_height: 240,
                  source_hidden,
                  diagram_zoom: 1,
                },
              ],
            }),
          ],
        }),
      });
      views.push(view);
      return view;
    };
    const hidden = code_widget_heights(open_diagram(true))[0] ?? 0;
    const visible = code_widget_heights(open_diagram(false))[0] ?? 0;

    expect(hidden).toBeGreaterThan(240);
    expect(visible - hidden).toBeGreaterThanOrEqual(180);
  });

  it.each(["```bash", "~~~typescript", "```bash\ntext\n```\n```bash"])(
    "keeps a restored unfinished opening fence editable: %s",
    async (source) => {
      const root = document.createElement("div");
      document.body.append(root);
      const view = new EditorView({
        parent: root,
        state: create_markdown_state(source, markdown_editor_extensions()),
      });
      views.push(view);
      view.dispatch({ selection: { anchor: source.length } });
      view.focus();
      await Promise.resolve();
      const complete_blocks = source.includes("text") ? 1 : 0;
      expect(root.querySelectorAll(".md-code-block")).toHaveLength(
        complete_blocks,
      );
      expect(view.contentDOM.textContent).toContain(source.split("\n").at(-1));
      press(view, "Enter");
      await Promise.resolve();
      expect(root.querySelectorAll(".md-code-block")).toHaveLength(
        complete_blocks + 1,
      );
      expect(document.activeElement?.closest(".md-code-source")).not.toBeNull();
    },
  );
  it("keeps a pasted opening fence editable through its language token", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const view = new EditorView({
      parent: root,
      state: create_markdown_state("", markdown_editor_extensions()),
    });
    views.push(view);
    view.focus();
    view.dispatch({
      changes: { from: 0, insert: "```bash" },
      selection: { anchor: 7 },
      userEvent: "input.paste",
    });
    await Promise.resolve();
    expect(root.querySelector(".md-code-block")).toBeNull();
    press(view, "Enter");
    await Promise.resolve();
    expect(root.querySelector(".md-code-block")).not.toBeNull();
    expect(document.activeElement?.closest(".md-code-source")).not.toBeNull();
  });
  it.each([
    ["", ""],
    ["> ", "> "],
    ["- ", "  "],
    ["> - ", ">   "],
    ["> > ", "> > "],
    ["1. ", "   "],
    ["> ", "> ", "```"],
  ])(
    "keeps rapid typing inside a newly entered container fence: %s",
    (prefix, continuation, fence = "```js") => {
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state("", markdown_editor_extensions()),
      });
      views.push(view);
      view.focus();
      for (const character of prefix + fence) {
        const position = view.state.selection.main.head;
        view.dispatch({
          changes: { from: position, insert: character },
          selection: { anchor: position + 1 },
          userEvent: "input.type",
        });
        expect(view.dom.querySelector(".md-code-block")).toBeNull();
      }
      press(view, "Enter");
      // Do not yield to a timer or microtask: the next native input targets the
      // focused editor immediately after the Enter key handler returns.
      const target = document.activeElement;
      const active =
        target instanceof HTMLElement ? EditorView.findFromDOM(target) : null;
      if (!active) throw new Error("Enter did not leave an active editor");
      const position = active.state.selection.main.head;
      active.dispatch({
        changes: { from: position, insert: "nested first" },
        selection: { anchor: position + 12 },
        userEvent: "input.type",
      });
      expect(view.state.doc.toString()).toBe(
        prefix + fence + "\n" + continuation + "nested first",
      );
      expect(document.activeElement?.closest(".md-code-source")).not.toBeNull();
      expect(view.dom.querySelectorAll(".md-code-block")).toHaveLength(1);
      expect(source_undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(prefix + fence);
    },
  );

  it("draws an independent caret in the embedded code editor", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const view = new EditorView({
      parent: root,
      state: create_markdown_state(
        "```js\nconst x = 1;\n```",
        markdown_editor_extensions(),
      ),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: 10 } });
    expect(focus_code_selection(view)).toBe(true);
    const inner_content = require_element<HTMLElement>(
      root,
      ".md-code-source .cm-content",
    );
    const inner = EditorView.findFromDOM(inner_content);
    if (!inner) throw new Error("Missing inner editor");
    expect(inner.dom.querySelector(".cm-cursorLayer")).not.toBeNull();
    expect(document.activeElement).toBe(inner.contentDOM);
  });
  it.each(["```\nbody\n```", "> ```\n> body\n> ```", "- ```\n  body\n  ```"])(
    "keeps an existing fence rendered when a leading blank is inserted and removed: %s",
    (source) => {
      const { view, root } = open_code(source);
      view.dispatch({
        changes: { from: 0, insert: "\n" },
        selection: { anchor: 1 },
        userEvent: "input.type",
      });
      forceParsing(view, view.state.doc.length, 100);
      expect(view.state.doc.toString()).toBe("\n" + source);
      expect(root.querySelector(".md-code-block")).not.toBeNull();
      view.dispatch({
        changes: { from: 0, to: 1 },
        selection: { anchor: 0 },
        userEvent: "delete.backward",
      });
      forceParsing(view, view.state.doc.length, 100);
      expect(view.state.doc.toString()).toBe(source);
      expect(root.querySelector(".md-code-block")).not.toBeNull();
    },
  );

  it("keeps a newly typed fence editable until Return moves into its code source", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const view = new EditorView({
      parent: root,
      state: EditorState.create({
        doc: "Before code.\n\n",
        selection: { anchor: 14 },
        extensions: [markdown_language(), code_block_rendering(), history()],
      }),
    });
    views.push(view);
    view.focus();
    for (const character of "```js") {
      view.dispatch({
        changes: { from: view.state.selection.main.head, insert: character },
        selection: { anchor: view.state.selection.main.head + 1 },
        userEvent: "input.type",
      });
      expect(root.querySelector(".md-code-block")).toBeNull();
      expect(view.hasFocus).toBe(true);
    }
    expect(view.state.doc.toString()).toBe("Before code.\n\n```js");
    insertNewlineAndIndent(view);
    const content = require_element<HTMLElement>(
      root,
      ".md-code-source .cm-content",
    );
    const inner = EditorView.findFromDOM(content);
    if (!inner) throw new Error("New code editor did not mount");
    expect(document.activeElement).toBe(content);
    inner.dispatch({
      changes: { from: 0, insert: "const typed = 1;" },
      selection: { anchor: 16 },
      userEvent: "input.type",
    });
    expect(view.state.doc.toString()).toBe(
      "Before code.\n\n```js\nconst typed = 1;",
    );
  });
  it.each(["", "> ", ">   "])(
    "indents and unindents selected code lines without changing container spacing: %s",
    (prefix) => {
      const opening = prefix === ">   " ? "> - " : prefix;
      const source = `${opening}\`\`\`js\n${prefix}first\n${prefix}second\n${prefix}\`\`\``;
      const { view, inner, root } = open_code(source);
      inner.focus();
      inner.dispatch({
        selection: { anchor: inner.state.doc.length, head: 0 },
      });
      press(inner, "Tab");
      expect(inner.state.doc.toString()).toBe("  first\n  second");
      expect(view.state.doc.toString()).toBe(
        source
          .replace(`${prefix}first`, `${prefix}  first`)
          .replace(`${prefix}second`, `${prefix}  second`),
      );
      expect(inner.state.selection.main.anchor).toBeGreaterThan(
        inner.state.selection.main.head,
      );
      press(inner, "Tab", { shiftKey: true });
      expect(view.state.doc.toString()).toBe(source);
      const block = require_element<HTMLElement>(root, ".md-code-block");
      expect(block.style.marginLeft).toBe(`${String(prefix.length * 0.5)}em`);
      inner.dispatch({
        changes: { from: 0, to: inner.state.doc.length, insert: "replacement" },
        selection: { anchor: 11 },
        userEvent: "input.paste",
      });
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
      expect(inner.state.selection.main.anchor).toBeGreaterThan(
        inner.state.selection.main.head,
      );
    },
  );
  it("returns focus to code when undo restores a converted block", () => {
    const { view, inner, root } = open_code("```\nhello\n```");
    inner.dispatch({ selection: { anchor: 0 } });
    inner.focus();
    press(inner, "Backspace");
    expect(view.hasFocus).toBe(true);
    expect(undo(view)).toBe(true);
    expect(document.activeElement).toBe(
      root.querySelector(".md-code-source .cm-content"),
    );
  });
  it.each(["", "plain text", "# heading [link](url)", "    indented"])(
    "converts single-line code to literal paragraph on Backspace at its start: %s",
    (content) => {
      const source = `before\n\`\`\`\n${content}\n\`\`\`\nafter`;
      const { view, inner, root } = open_code(source);
      inner.dispatch({ selection: { anchor: 0 } });
      press(inner, "Backspace");
      expect(root.querySelector(".md-code-block")).toBeNull();
      expect(view.state.doc.toString()).toMatch(/^before\n\n/);
      expect(view.state.doc.toString()).toMatch(/\n\nafter$/);
      const interpreted: string[] = [];
      syntaxTree(view.state).iterate({
        enter: (node) => {
          if (/Heading|Link|FencedCode|CodeBlock/.test(node.name))
            interpreted.push(node.name);
        },
      });
      expect(interpreted).toEqual([]);
      expect(view.hasFocus).toBe(true);
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it("does not unwrap multiline code on Backspace", () => {
    const source = "```\nfirst\nsecond\n```";
    const { view, inner } = open_code(source);
    inner.dispatch({ selection: { anchor: 0 } });
    press(inner, "Backspace");
    expect(view.state.doc.toString()).toBe(source);
  });

  it.each([0, 3, 13, 20])(
    "round-trips Enter and Backspace at quoted code position %s",
    (position) => {
      const source = "> ```Python\n> nested first\n> nested \n> ```";
      const root = document.createElement("div");
      document.body.append(root);
      const view = new EditorView({
        parent: root,
        state: create_markdown_state(source, markdown_editor_extensions()),
      });
      views.push(view);
      forceParsing(view, view.state.doc.length, 1000);
      const inner = EditorView.findFromDOM(
        require_element<HTMLElement>(root, ".md-code-source .cm-content"),
      );
      if (!inner) throw new Error("Missing quoted code editor");
      inner.dispatch({ selection: { anchor: position } });
      inner.focus();
      const content = inner.state.doc.toString();

      press(inner, "Enter");
      expect(inner.state.doc.toString()).toBe(
        content.slice(0, position) + "\n" + content.slice(position),
      );
      expect(view.state.doc.toString()).toBe(
        "> ```Python\n> " +
          inner.state.doc.toString().replace(/\n/g, "\n> ") +
          "\n> ```",
      );
      expect(document.activeElement).toBe(inner.contentDOM);

      press(inner, "Backspace");
      expect(view.state.doc.toString()).toBe(source);
      expect(inner.state.selection.main.head).toBe(position);
      expect(root.querySelectorAll(".md-code-block")).toHaveLength(1);
    },
  );

  it("deletes a selected code fragment without unwrapping the block", () => {
    const { view, inner, root } = open_code("```\nhello\n```");
    inner.dispatch({ selection: { anchor: 0, head: 2 } });
    press(inner, "Backspace");
    expect(view.state.doc.toString()).toBe("```\nllo\n```");
    expect(root.querySelector(".md-code-block")).not.toBeNull();
  });

  it.each([
    ["> ```\n> hello\n> ```", "> hello"],
    ["- ```\n  hello\n  ```", "- hello"],
  ])(
    "preserves the containing quote or list when unwrapping single-line code",
    (source, expected) => {
      const { view, inner } = open_code(source);
      inner.dispatch({ selection: { anchor: 0 } });
      press(inner, "Backspace");
      expect(view.state.doc.toString()).toBe(expected);
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
    },
  );
  it.each(["```\nhello\n```", "```\nhello"])(
    "creates a paragraph after code with Mod-Enter, preserving content and closing an unfinished fence",
    (source) => {
      const { view, inner } = open_code(source);
      inner.dispatch({ selection: { anchor: 2 } });
      press(inner, "Enter", { ctrlKey: true });
      expect(view.state.doc.toString()).toBe("```\nhello\n```\n\n");
      expect(view.hasFocus).toBe(true);
      expect(view.state.selection.main.head).toBe(view.state.doc.length);
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it.each(["ArrowUp", "ArrowDown"])(
    "enters the immediately adjacent code line with %s",
    (key) => {
      const source =
        "before text\n```\nfirst code line\nlast code line\n```\nafter text";
      const { view, inner } = open_code(source);
      const from = key === "ArrowUp" ? source.indexOf("after") + 3 : 3;
      view.dispatch({ selection: { anchor: from } });
      view.focus();
      press(view, key);
      expect(inner.hasFocus).toBe(true);
      expect(inner.state.selection.main.head).toBe(
        key === "ArrowUp" ? inner.state.doc.line(2).from + 3 : 3,
      );
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.main.head).toBe(
        source.indexOf(key === "ArrowUp" ? "last code" : "first code") + 3,
      );
    },
  );
  it.each([
    ["", "", 1],
    ["", "", 2],
    ["> ", "> ", 1],
    ["> ", ">", 2],
    ["  ", "  ", 1],
    ["  ", "  ", 2],
  ] as const)(
    "visits adjacent blank rows around code (prefix %s, blank %s, count %s)",
    (prefix, blank, count) => {
      const before = prefix === "  " ? "- before" : prefix + "before";
      const source = [
        before,
        ...Array<string>(count).fill(blank),
        prefix + "```",
        prefix + "first",
        prefix + "last",
        prefix + "```",
        ...Array<string>(count).fill(blank),
        prefix + "after",
      ].join("\n");
      const { view, inner } = open_code(source);
      const opening = view.state.doc.lineAt(source.indexOf("```"));
      const closing = view.state.doc.lineAt(source.lastIndexOf("```"));
      for (const [key, return_key, backwards] of [
        ["ArrowLeft", "ArrowRight", true],
        ["ArrowUp", "ArrowDown", true],
        ["ArrowRight", "ArrowLeft", false],
        ["ArrowDown", "ArrowUp", false],
      ] as const) {
        inner.dispatch({
          selection: { anchor: backwards ? 0 : inner.state.doc.length },
        });
        inner.focus();
        press(inner, key);
        const expected = view.state.doc.line(
          backwards ? opening.number - 1 : closing.number + 1,
        );
        expect(view.hasFocus).toBe(true);
        expect(view.state.selection.main.head).toBe(expected.to);
        expect(view.state.doc.toString()).toBe(source);
        press(view, return_key);
        expect(inner.hasFocus).toBe(true);
        expect(view.state.doc.toString()).toBe(source);
      }
      for (const [line, key] of [
        [1, "ArrowDown"],
        [view.state.doc.lines, "ArrowUp"],
      ] as const) {
        const position = view.state.doc.line(line).to;
        view.dispatch({ selection: { anchor: position } });
        view.focus();
        press(view, key);
        expect(inner.hasFocus).toBe(false);
        expect(view.state.selection.main.head).toBe(position);
      }
    },
  );

  it("visits every plain blank row with repeated horizontal keys around the widget", () => {
    const source = "before\n\n\n```\ncode\n```\n\n\nafter";
    const { view, inner } = open_code(source);
    view.dispatch({
      effects: StateEffect.appendConfig.of(keymap.of(defaultKeymap)),
    });
    inner.dispatch({ selection: { anchor: 0 } });
    inner.focus();
    press(inner, "ArrowLeft");
    for (const number of [3, 2, 1]) {
      expect(view.state.selection.main.head).toBe(
        view.state.doc.line(number).to,
      );
      if (number > 1) press(view, "ArrowLeft");
    }
    for (const number of [2, 3]) {
      press(view, "ArrowRight");
      expect(view.state.selection.main.head).toBe(
        view.state.doc.line(number).to,
      );
    }
    press(view, "ArrowRight");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(0);
    inner.dispatch({ selection: { anchor: inner.state.doc.length } });
    press(inner, "ArrowRight");
    for (const number of [7, 8, 9]) {
      expect(view.state.selection.main.head).toBe(
        view.state.doc.line(number).from,
      );
      if (number < 9) press(view, "ArrowRight");
    }
    for (const number of [8, 7]) {
      press(view, "ArrowLeft");
      expect(view.state.selection.main.head).toBe(
        view.state.doc.line(number).to,
      );
    }
    press(view, "ArrowLeft");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(inner.state.doc.length);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("leaves an unfinished fence at its preceding blank row without changing source", () => {
    const source = "Paragraph\n\n```js\nconst x + 1\nsecond";
    const { view, inner } = open_code(source);
    inner.dispatch({ selection: { anchor: 0 } });
    inner.focus();
    press(inner, "ArrowLeft");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
    expect(view.hasFocus).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("leaves normal vertical movement within a wrapped prose line to CodeMirror", () => {
    const source = "before\n```\ncode\n```\na long wrapped paragraph";
    const { view, inner } = open_code(source);
    const from = source.indexOf("wrapped");
    view.dispatch({ selection: { anchor: from } });
    view.focus();
    vi.spyOn(view, "lineWrapping", "get").mockReturnValue(true);
    vi.spyOn(view, "moveVertically").mockReturnValue(
      EditorSelection.cursor(from - 3),
    );
    press(view, "ArrowUp");
    expect(inner.hasFocus).toBe(false);
    expect(view.state.selection.main.head).toBe(from);
    expect(view.state.doc.toString()).toBe(source);
  });
  it.each(["ArrowUp", "ArrowDown"])(
    "preserves the code column when leaving with %s",
    (key) => {
      const source =
        "before text\n```\nfirst code line\nlast code line\n```\nafter text";
      const { view, inner } = open_code(source);
      const from = key === "ArrowUp" ? 3 : inner.state.doc.line(2).from + 3;
      inner.dispatch({ selection: { anchor: from } });
      inner.focus();
      press(inner, key);
      expect(view.hasFocus).toBe(true);
      expect(view.state.selection.main.head).toBe(
        key === "ArrowUp" ? 3 : source.indexOf("after") + 3,
      );
      expect(view.state.doc.toString()).toBe(source);
    },
  );
  it("transfers the intended visual x into code and keeps it as the arrow goal", () => {
    const source = "```\nfirst line\nlast line\n```\nafter text";
    const { view, inner } = open_code(source);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(source.indexOf("after") + 2, 0, undefined, 72),
      ]),
    });
    view.focus();
    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      left: 30,
      right: 30,
      top: 80,
      bottom: 96,
    });
    vi.spyOn(inner, "coordsAtPos").mockReturnValue({
      left: 12,
      right: 12,
      top: 40,
      bottom: 56,
    });
    const target = inner.state.doc.line(2).from + 5;
    const hit = vi
      .spyOn(inner, "posAndSideAtCoords")
      .mockReturnValue({ pos: target, assoc: 1 });
    press(view, "ArrowUp");
    expect(hit).toHaveBeenCalledWith({ x: 72, y: 48 });
    expect(inner.state.selection.main.head).toBe(target);
    expect(inner.state.selection.main.goalColumn).toBe(72);
    expect(inner.state.selection.main.assoc).toBe(1);
    expect(view.state.doc.toString()).toBe(source);
  });
  it("does not jump over intervening prose or replace a text selection", () => {
    const source = "```\ncode\n```\nnearby paragraph\nfarther paragraph";
    const { view, inner } = open_code(source);
    view.dispatch({ selection: { anchor: source.indexOf("farther") } });
    view.focus();
    press(view, "ArrowUp");
    expect(inner.hasFocus).toBe(false);
    view.dispatch({
      selection: {
        anchor: source.indexOf("nearby"),
        head: source.indexOf("paragraph"),
      },
    });
    const selection = view.state.selection;
    press(view, "ArrowUp");
    expect(inner.hasFocus).toBe(false);
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });
  it("routes composed editor arrows through prose before entering the code widget", () => {
    const source =
      "Before code\n\n```text\nfirst code line\nsecond code line\nlast code line\n```\nAfter code\n\n";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, markdown_editor_extensions()),
    });
    views.push(view);
    const content = require_element<HTMLElement>(
      view.dom,
      ".md-code-source .cm-content",
    );
    const inner = EditorView.findFromDOM(content);
    if (!inner) throw new Error("Missing code editor");
    view.dispatch({ selection: { anchor: source.length } });
    view.focus();
    // jsdom cannot measure visual lines. The first movement lands in intervening
    // prose; the second would skip the atomic code widget without our keymap.
    vi.spyOn(view, "lineWrapping", "get").mockReturnValue(true);
    const move = vi.spyOn(view, "moveVertically");
    move.mockReturnValueOnce(
      EditorSelection.cursor(source.indexOf("After") + 3),
    );
    press(view, "ArrowUp");
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(source.indexOf("After") + 3);
    move.mockReturnValueOnce(EditorSelection.cursor(3));
    press(view, "ArrowUp");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(
      inner.state.doc.line(3).from + 3,
    );
    expect(view.state.selection.main.head).toBe(
      source.indexOf("last code") + 3,
    );
    expect(view.state.doc.toString()).toBe(source);
  });
  it("enters code from adjacent prose with horizontal arrows only at the line boundary", () => {
    const { view, inner } = open_code("before\n```\nhello\n```\nafter");
    view.dispatch({ selection: { anchor: 6 } });
    press(view, "ArrowRight");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(0);
    const last = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ selection: { anchor: last.from } });
    view.focus();
    press(view, "ArrowLeft");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(5);
  });
  it("moves directly between consecutive code editors without landing on a hidden fence", () => {
    const source = "```\nfirst\n```\n```\nsecond\n```";
    const { view, inner, root } = open_code(source);
    const nodes = root.querySelectorAll<HTMLElement>(
      ".md-code-source .cm-content",
    );
    const second_node = nodes[1];
    if (!second_node) throw new Error("Missing second code");
    const second = EditorView.findFromDOM(second_node);
    if (!second) throw new Error("Missing second code view");
    inner.dispatch({ selection: { anchor: inner.state.doc.length } });
    press(inner, "ArrowRight");
    expect(second.hasFocus).toBe(true);
    expect(second.state.selection.main.head).toBe(0);
    press(second, "ArrowLeft");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.head).toBe(5);
    expect(view.state.doc.toString()).toBe(source);
  });
  it("finds TypeScript and TSX by the ts alias in the supplied language catalog", () => {
    const { root } = open_code("```js\nhello\n```", { languages });
    require_element<HTMLButtonElement>(
      root,
      ".md-code-language-button",
    ).click();
    const input = require_element<HTMLInputElement>(
      root,
      ".md-code-language-popup input",
    );
    input.value = "ts";
    input.dispatchEvent(new Event("input"));
    const labels = [...root.querySelectorAll('[role="option"]')].map(
      (option) => option.firstChild?.textContent,
    );
    expect(labels).toContain("TypeScript");
    expect(labels).toContain("TSX");
  });

  it("reveals a selected find match in hidden diagram source without moving focus or editing source", async () => {
    const source = "```mermaid\ngraph TD; A-->B\n```";
    const { view, inner, root } = open_code(source, {
      initial_view_states: [
        {
          source_height: null,
          diagram_height: null,
          source_hidden: true,
          diagram_zoom: 1,
        },
      ],
      render_diagram: () => Promise.resolve(document.createElement("div")),
    });
    expect(require_element<HTMLElement>(root, ".md-code-source").hidden).toBe(
      true,
    );
    update_find_query(view, "graph", 0);
    await Promise.resolve();
    expect(require_element<HTMLElement>(root, ".md-code-source").hidden).toBe(
      false,
    );
    expect(inner.hasFocus).toBe(false);
    expect(view.state.doc.toString()).toBe(source);
    expect(get_find_query(inner.state).selected_index).toBe(0);
  });

  it("uses an SVG's natural width at 100 percent and explicit zoom thereafter", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 180 120");
    svg.setAttribute("width", "100%");
    svg.style.maxWidth = "180px";
    const { root } = open_code("```mermaid\ngraph TD; A-->B\n```", {
      render_diagram: () => Promise.resolve(svg),
    });
    await Promise.resolve();
    expect(svg.style.width).toBe(
      "calc(min(100%, 180px) * var(--md-code-diagram-zoom, 1))",
    );
    expect(svg.style.maxWidth).toBe("none");
    const content = require_element<HTMLElement>(
      root,
      ".md-code-diagram-content",
    );
    expect(content.style.zoom).toBe("");
    require_element<HTMLButtonElement>(
      root,
      '[aria-label="Zoom diagram in"]',
    ).click();
    expect(content.style.getPropertyValue("--md-code-diagram-zoom")).toBe(
      "1.25",
    );
  });
  it("searches language aliases and supports keyboard selection, escape and outside close", () => {
    const source = "```js extra=keep\nhello\n```";
    const { view, root } = open_code(source, {
      languages: [
        LanguageDescription.of({
          name: "JavaScript",
          alias: ["js", "node"],
          support: code_language("javascript"),
        }),
        LanguageDescription.of({
          name: "JSON",
          alias: ["json"],
          support: code_language("json"),
        }),
      ],
    });
    choose_language(root, "node");
    expect(view.state.doc.toString()).toBe(source);
    const button = require_element<HTMLButtonElement>(
      root,
      ".md-code-language-button",
    );
    button.click();
    const input = require_element<HTMLInputElement>(
      root,
      ".md-code-language-popup input",
    );
    input.value = "j";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(view.state.doc.toString()).toBe(
      source.replace("js extra", "JSON extra"),
    );
    expect(document.activeElement).toBe(button);
    button.click();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(root.querySelector(".md-code-language-popup")).toBeNull();
    expect(document.activeElement).toBe(button);
    button.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.querySelector(".md-code-language-popup")).toBeNull();
  });
  it("groups native typing as one undo while keeping paste separate", () => {
    const { view, inner } = open_code("```\nhello\n```");
    for (const char of " world") {
      const end = inner.state.doc.length;
      inner.dispatch({
        changes: { from: end, insert: char },
        selection: { anchor: end + 1 },
        userEvent: "input.type",
      });
    }
    const end = inner.state.doc.length;
    inner.dispatch({
      changes: { from: end, insert: " paste" },
      selection: { anchor: end + 6 },
      userEvent: "input.paste",
    });
    expect(undo(view)).toBe(true);
    expect(inner.state.doc.toString()).toBe("hello world");
    expect(undo(view)).toBe(true);
    expect(inner.state.doc.toString()).toBe("hello");
    expect(redo(view)).toBe(true);
    expect(inner.state.doc.toString()).toBe("hello world");
  });
  it("projects find matches into code without moving its selection or focus", () => {
    const source = "word\n\n```\nword word\n```";
    const { view, inner, root } = open_code(source);
    const selection = inner.state.selection;
    update_find_query(view, "word", 2);
    expect(get_find_matches(inner.state)).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 },
    ]);
    expect(get_find_query(inner.state).selected_index).toBe(1);
    expect(root.querySelectorAll(".md-code-source .find-match")).toHaveLength(
      2,
    );
    expect(
      root.querySelector(".md-code-source .find-match--selected")?.textContent,
    ).toBe("word");
    expect(inner.state.selection.eq(selection)).toBe(true);
    expect(inner.hasFocus).toBe(false);
    update_find_query(view, "word", 0);
    expect(get_find_query(inner.state).selected_index).toBe(-1);
    update_find_query(view, "", 0);
    expect(root.querySelectorAll(".md-code-source .find-match")).toHaveLength(
      0,
    );
  });

  it("focuses the visible editor for an outer code selection and reveals hidden source", () => {
    const { view, inner } = open_code("```mermaid\nhello\n```", {
      diagram_languages: ["mermaid"],
      render_diagram: () => Promise.resolve(document.createElement("div")),
    });
    view.dispatch({
      effects: replace_code_block_view_states.of([
        {
          source_height: null,
          diagram_height: null,
          source_hidden: true,
          diagram_zoom: 1,
        },
      ]),
      selection: { anchor: 12, head: 15 },
    });
    expect(focus_code_selection(view)).toBe(true);
    expect(read_code_block_view_states(view.state)[0]?.source_hidden).toBe(
      false,
    );
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.anchor).toBe(1);
    expect(inner.state.selection.main.head).toBe(4);
  });
  it("mounts an immediately editable embedded editor and saves each edit to the outer source", () => {
    const original =
      "Before\n\n~~~~custom extra=value  \nconst x = 1\n~~~~\n\nAfter";
    const { view, inner } = open_code(original);
    inner.focus();
    inner.dispatch({
      changes: { from: inner.state.doc.length, insert: ";" },
      selection: { anchor: inner.state.doc.length + 1 },
    });
    expect(view.state.doc.toString()).toBe(
      original.replace("const x = 1", "const x = 1;"),
    );
    expect(inner.state.doc.toString()).toBe("const x = 1;");
  });
  it("uses outer history for embedded undo/redo without echoing external changes", () => {
    const original = "```js\nhello\n```";
    const { view, inner } = open_code(original);
    inner.dispatch({
      changes: { from: 5, insert: "!" },
      selection: { anchor: 6 },
    });
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(original);
    expect(inner.state.doc.toString()).toBe("hello");
    expect(redo(view)).toBe(true);
    expect(inner.state.doc.toString()).toBe("hello!");
  });
  it("changes only the language token and preserves extra info and fence spelling", () => {
    const original = "~~~~custom  title=test\nhello\n~~~~  ";
    const { view, root } = open_code(original);
    expect(
      require_element<HTMLButtonElement>(root, ".md-code-language-button")
        .textContent,
    ).toContain("custom");
    choose_language(root, "Plain text");
    expect(view.state.doc.toString()).toBe(original.replace("custom", "text"));
  });
  it("expands fences only when edited content would close them", () => {
    const { view, inner } = open_code("~~~js extra\nhello\n~~~");
    inner.dispatch({ changes: { from: 0, to: 5, insert: "~~~" } });
    expect(view.state.doc.toString()).toBe("~~~~js extra\n~~~\n~~~~");
    expect(inner.state.doc.toString()).toBe("~~~");
  });
  it.each(["```\n```", "```\n"])(
    "adds the required separator when typing into %j",
    (source) => {
      const { view, inner } = open_code(source);
      inner.dispatch({ changes: { from: 0, insert: "hello" } });
      expect(view.state.doc.toString()).toBe(
        source === "```\n" ? "```\nhello" : "```\nhello\n```",
      );
    },
  );
  it("indents with Tab and copies live content through the host callback", async () => {
    const copy_code = vi.fn();
    const { view, inner, root } = open_code("```js\nhello\n```", { copy_code });
    inner.focus();
    press(inner, "Tab");
    expect(inner.state.doc.toString()).toBe("  hello");
    expect(view.state.doc.toString()).toContain("\n  hello\n");
    require_element<HTMLButtonElement>(
      root,
      'button[aria-label="Copy code"]',
    ).click();
    await Promise.resolve();
    expect(copy_code).toHaveBeenCalledWith("  hello");
  });
  it.each([
    ["```js\nhello\n```", "ArrowLeft", 0],
    ["```js\nhello\n```", "ArrowRight", 5],
    ["> ```Python\n> nested first\n> nested \n> ```", "ArrowLeft", 0],
    ["> ```Python\n> nested first\n> nested \n> ```", "ArrowUp", 0],
    ["> ```Python\n> nested first\n> nested \n> ```", "ArrowRight", 20],
    ["> ```Python\n> nested first\n> nested \n> ```", "ArrowDown", 20],
  ])(
    "keeps %s unchanged at its %s document boundary",
    (source, key, position) => {
      const { view, inner, root } = open_code(source);
      inner.focus();
      inner.dispatch({ selection: { anchor: position } });
      press(inner, key);
      expect(view.state.doc.toString()).toBe(source);
      expect(inner.state.selection.main.head).toBe(position);
      expect(root.querySelectorAll(".md-code-block")).toHaveLength(1);
      expect(document.activeElement).toBe(inner.contentDOM);
      expect(undo(view)).toBe(false);
    },
  );
  it("restores UI state independently from document text and maps it when text is inserted before the block", () => {
    const source = "Before\n\n```mermaid\ngraph TD; A-->B\n```";
    const ui = {
      source_height: 180,
      diagram_height: 220,
      source_hidden: true,
      diagram_zoom: 2,
    };
    const { view, root } = open_code(source, {
      initial_view_states: [ui],
      render_diagram: () => Promise.resolve(document.createElement("div")),
    });
    expect(read_code_block_view_states(view.state)).toEqual([ui]);
    expect(require_element<HTMLElement>(root, ".md-code-source").hidden).toBe(
      true,
    );
    view.dispatch({ changes: { from: 0, insert: "prefix " } });
    expect(read_code_block_view_states(view.state)).toEqual([ui]);
    expect(view.state.doc.toString()).toBe("prefix " + source);
  });
  it("keeps cached EditorStates free of shared DOM controllers", () => {
    const { view, inner } = open_code("```js\nhello\n```");
    const clone = new EditorView({ state: view.state, parent: document.body });
    views.push(clone);
    const clone_inner = EditorView.findFromDOM(
      require_element<HTMLElement>(clone.dom, ".md-code-source .cm-content"),
    );
    if (!clone_inner) throw new Error("Cloned code editor not found");
    expect(clone_inner).not.toBe(inner);
    clone_inner.dispatch({ changes: { from: 5, insert: "!" } });
    expect(clone.state.doc.toString()).toContain("hello!");
    expect(view.state.doc.toString()).toContain("hello\n");
  });
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function code_language(name: string) {
  return new LanguageSupport(
    StreamLanguage.define({
      name,
      token(stream) {
        stream.skipToEnd();
        return "keyword";
      },
    }),
  );
}

describe("Code-block controls and asynchronous work", () => {
  it("clears a failed grammar warning when choosing a working language", async () => {
    const { inner, root } = open_code("```broken\nhello\n```", {
      languages: [
        LanguageDescription.of({
          name: "broken",
          load: () => Promise.reject(new Error("Grammar unavailable")),
        }),
        LanguageDescription.of({
          name: "working",
          support: code_language("working"),
        }),
      ],
    });
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Language highlighting unavailable");
    });
    choose_language(root, "working");
    await vi.waitFor(() => {
      expect(inner.state.facet(language)?.name).toBe("working");
    });
    expect(root.textContent).not.toContain("Language highlighting unavailable");
  });

  it("ignores a late grammar and clears highlighting for an unsupported language", async () => {
    const js = deferred<LanguageSupport>();
    const python = deferred<LanguageSupport>();
    const { view, inner, root } = open_code("```js\nhello\n```", {
      languages: [
        LanguageDescription.of({ name: "js", load: () => js.promise }),
        LanguageDescription.of({ name: "python", load: () => python.promise }),
      ],
    });
    choose_language(root, "python");
    python.resolve(code_language("python"));
    await Promise.resolve();
    await Promise.resolve();
    expect(inner.state.facet(language)?.name).toBe("python");
    js.resolve(code_language("js"));
    await Promise.resolve();
    await Promise.resolve();
    expect(inner.state.facet(language)?.name).toBe("python");
    view.dispatch({ changes: { from: 3, to: 9, insert: "unsupported" } });
    expect(inner.state.facet(language)).toBeNull();
  });
  it("aborts obsolete diagrams and refreshes them explicitly without source edits", async () => {
    const first = deferred<HTMLElement | null>();
    const second = deferred<HTMLElement | null>();
    const third = deferred<HTMLElement | null>();
    const render_diagram = vi
      .fn<NonNullable<CodeBlockOptions["render_diagram"]>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const { view, inner, root } = open_code("```mermaid\nfirst\n```", {
      render_diagram,
    });
    inner.dispatch({ changes: { from: 0, to: 5, insert: "second" } });
    expect(render_diagram.mock.calls[0]?.[0].signal.aborted).toBe(true);
    const current = document.createElement("div");
    current.textContent = "current";
    second.resolve(current);
    await Promise.resolve();
    const stale = document.createElement("div");
    stale.textContent = "stale";
    first.resolve(stale);
    await Promise.resolve();
    expect(root.querySelector(".md-code-diagram-content")?.textContent).toBe(
      "current",
    );
    const source = view.state.doc.toString();
    view.dispatch({ effects: refresh_code_diagrams.of(null) });
    expect(render_diagram).toHaveBeenCalledTimes(3);
    expect(view.state.doc.toString()).toBe(source);
    third.resolve(null);
    await Promise.resolve();
  });
  it("renders diagram errors as text", async () => {
    const { root } = open_code("```mermaid\nbad\n```", {
      render_diagram: () => Promise.reject(new Error("<script>bad</script>")),
    });
    await Promise.resolve();
    expect(root.querySelector(".md-code-error")?.textContent).toBe(
      "<script>bad</script>",
    );
    expect(root.querySelector("script")).toBeNull();
  });
  it("persists source hide, zoom, and independent keyboard resize without document changes", async () => {
    const source = "```mermaid\ngraph TD; A-->B\n```";
    const on_view_states_change = vi.fn();
    const { view, root } = open_code(source, {
      render_diagram: () => Promise.resolve(document.createElement("div")),
      initial_view_states: [
        {
          source_height: 100,
          diagram_height: 150,
          source_hidden: false,
          diagram_zoom: 1,
        },
      ],
      on_view_states_change,
    });
    require_element<HTMLButtonElement>(
      root,
      'button[aria-label="Hide source"]',
    ).click();
    require_element<HTMLButtonElement>(
      root,
      'button[aria-label="Zoom diagram in"]',
    ).click();
    require_element<HTMLElement>(
      root,
      '[aria-label="Resize diagram"]',
    ).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(read_code_block_view_states(view.state)).toEqual([
      {
        source_height: 100,
        diagram_height: 166,
        source_hidden: true,
        diagram_zoom: 1.25,
      },
    ]);
    expect(view.state.doc.toString()).toBe(source);
    expect(on_view_states_change).toHaveBeenCalled();
    view.dispatch({
      effects: replace_code_block_view_states.of([
        {
          source_height: 240,
          diagram_height: null,
          source_hidden: false,
          diagram_zoom: 1,
        },
      ]),
    });
    expect(
      require_element<HTMLElement>(root, ".md-code-source").style.height,
    ).toBe("240px");
    expect(require_element<HTMLElement>(root, ".md-code-source").hidden).toBe(
      false,
    );
    await Promise.resolve();
  });
  it("honors readonly changes in the embedded editor and language control", () => {
    const source = "```js\nhello\n```";
    const { view, inner, root } = open_code(source);
    const readonly = new Compartment();
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        readonly.of(EditorState.readOnly.of(true)),
      ),
    });
    expect(inner.state.readOnly).toBe(true);
    expect(
      require_element<HTMLButtonElement>(root, ".md-code-language-button")
        .disabled,
    ).toBe(true);
    inner.dispatch({ changes: { from: 0, insert: "bad" } });
    expect(inner.state.doc.toString()).toBe("hello");
    expect(view.state.doc.toString()).toBe(source);
    view.dispatch({
      effects: readonly.reconfigure(EditorState.readOnly.of(false)),
    });
    expect(inner.state.readOnly).toBe(false);
    inner.dispatch({ changes: { from: 5, insert: "!" } });
    expect(view.state.doc.toString()).toContain("hello!");
  });
  it("bounds a large source viewport and keeps the same editor through an edit", () => {
    const content = "const x = 1;\n".repeat(1000).trimEnd();
    const { view, inner, root } = open_code("```js\n" + content + "\n```");
    expect(
      require_element<HTMLElement>(root, ".md-code-source").style.height,
    ).toBe("320px");
    inner.dispatch({ changes: { from: 0, insert: "// comment\n" } });
    expect(
      EditorView.findFromDOM(
        require_element<HTMLElement>(root, ".md-code-source .cm-content"),
      ),
    ).toBe(inner);
    expect(view.state.doc.toString()).toContain("// comment\nconst x = 1;");
    expect(inner.dom.querySelectorAll(".cm-line").length).toBeLessThan(1000);
  });
});

function require_element<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

it("does not publish unchanged view settings on a content edit", () => {
  const on_view_states_change = vi.fn();
  const { inner } = open_code("```js\nhello\n```", { on_view_states_change });
  inner.dispatch({ changes: { from: 5, insert: "!" } });
  expect(on_view_states_change).not.toHaveBeenCalled();
});

describe("Code nested in Markdown containers", () => {
  it.each([
    ["> ```js\n> first\n> second\n> ```", "> "],
    ["- ```js\n  first\n  second\n  ```", "  "],
    ["> - ```js\n>   first\n>   second\n>   ```", ">   "],
  ])(
    "edits projected content while preserving container prefixes: %s",
    (source, prefix) => {
      const { view, inner } = open_code(source);
      expect(inner.state.doc.toString()).toBe("first\nsecond");
      inner.dispatch({
        changes: { from: 6, insert: "new\n" },
        selection: { anchor: 10 },
      });
      expect(view.state.doc.toString()).toBe(
        source.replace(prefix + "second", prefix + "new\n" + prefix + "second"),
      );
      expect(inner.state.doc.toString()).toBe("first\nnew\nsecond");
      expect(view.state.selection.main.head).toBe(
        view.state.doc.toString().indexOf("second"),
      );
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
    },
  );
  it("preserves a compact blank quote line when another line is edited", () => {
    const source = "> ```js\n> first\n>\n> second\n> ```";
    const { view, inner } = open_code(source);
    expect(inner.state.doc.toString()).toBe("first\n\nsecond");
    inner.dispatch({ changes: { from: 0, insert: "!" } });
    expect(view.state.doc.toString()).toBe(source.replace("first", "!first"));
  });
  it("removes a line and its container prefix when code lines are joined", () => {
    const { view, inner } = open_code("> ```\n> first\n> second\n> ```");
    inner.dispatch({ changes: { from: 5, to: 6 } });
    expect(view.state.doc.toString()).toBe("> ```\n> firstsecond\n> ```");
  });
  it("inserts a complete content line into an empty quoted fence", () => {
    const { view, inner } = open_code("> ```\n> ```");
    inner.dispatch({ changes: { from: 0, insert: "hello" } });
    expect(view.state.doc.toString()).toBe("> ```\n> hello\n> ```");
  });
  it("synchronizes code selections with the outer editor in both directions", () => {
    const source = "> ```\n> first\n> second\n> ```";
    const { view, inner } = open_code(source);
    inner.dispatch({ selection: { anchor: 7, head: 10 } });
    expect(view.state.selection.main.anchor).toBe(source.indexOf("second") + 1);
    expect(view.state.selection.main.head).toBe(source.indexOf("second") + 4);
    view.dispatch({
      selection: {
        anchor: source.indexOf("first"),
        head: source.indexOf("first") + 3,
      },
    });
    expect(inner.state.selection.main.anchor).toBe(0);
    expect(inner.state.selection.main.head).toBe(3);
  });
  it("preserves code cursor affinity and vertical goal when the widget remounts", () => {
    const source = "> ```\n> first\n> second\n> ```";
    const { view, inner, root } = open_code(source);
    inner.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(7, 1, undefined, 72),
      ]),
    });
    expect(view.state.selection.main.assoc).toBe(1);
    expect(view.state.selection.main.goalColumn).toBe(72);

    view.setState(view.state);
    const content = require_element<HTMLElement>(
      root,
      ".md-code-source .cm-content",
    );
    const restored = EditorView.findFromDOM(content);
    if (!restored) throw new Error("Missing restored code view");
    expect(restored.state.selection.main.assoc).toBe(1);
    expect(restored.state.selection.main.goalColumn).toBe(72);

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(
          view.state.selection.main.head,
          -1,
          undefined,
          36,
        ),
      ]),
    });
    expect(restored.state.selection.main.assoc).toBe(-1);
    expect(restored.state.selection.main.goalColumn).toBe(36);
    expect(view.state.doc.toString()).toBe(source);
  });
});

it("leaves an already long enough closing fence unchanged when expanding the opener", () => {
  const { view, inner } = open_code("~~~js\ncode\n~~~~~~  ");
  inner.dispatch({ changes: { from: 0, to: 4, insert: "~~~" } });
  expect(view.state.doc.toString()).toBe("~~~~js\n~~~\n~~~~~~  ");
});

it("moves to the existing blank quote row after nested code without changing source", () => {
  const source = "> Before\n>\n> ```js\n> code\n> ```\n>\n> After";
  const { view, inner } = open_code(source);
  inner.focus();
  inner.dispatch({ selection: { anchor: inner.state.doc.length } });
  press(inner, "ArrowDown");
  expect(view.state.doc.toString()).toBe(source);
  expect(view.state.selection.main.head).toBe(view.state.doc.line(6).to);
  view.dispatch(view.state.replaceSelection("X"));
  expect(view.state.doc.toString()).toBe(
    source.replace("\n>\n> After", "\n>X\n> After"),
  );
});

it("retains the surviving block and its settings when an earlier block is deleted", () => {
  const first = "```js\nfirst\n```\n\n";
  const last = "```js\nlast\n```";
  const ui = {
    source_height: 140,
    diagram_height: null,
    source_hidden: false,
    diagram_zoom: 1,
  };
  const { view, root } = open_code(first + last, {
    initial_view_states: [null, ui],
  });
  view.dispatch({ changes: { from: 0, to: first.length } });
  expect(view.state.doc.toString()).toBe(last);
  expect(root.querySelectorAll(".md-code-block")).toHaveLength(1);
  expect(read_code_block_view_states(view.state)).toEqual([ui]);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
  expect(view.state.doc.toString()).toBe("");
  expect(root.querySelector(".md-code-block")).toBeNull();
});

it.each([
  ["Resize code block", ".md-code-source", "source_height"],
  ["Resize diagram", ".md-code-diagram", "diagram_height"],
] as const)(
  "focuses the clicked %s handle so arrows resize without moving the caret",
  async (label, selector, target) => {
    const source = "```mermaid\ngraph TD; A-->B\n```";
    const { view, inner, root } = open_code(source, {
      render_diagram: () => Promise.resolve(document.createElement("div")),
      initial_view_states: [
        {
          source_height: 100,
          diagram_height: 100,
          source_hidden: false,
          diagram_zoom: 1,
        },
      ],
    });
    await Promise.resolve();
    inner.focus();
    const selection = view.state.selection;
    const handle = require_element<HTMLElement>(
      root,
      `[aria-label="${label}"]`,
    );
    const resized = require_element<HTMLElement>(root, selector);
    vi.spyOn(resized, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 100),
    );
    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        button: 0,
        clientY: 10,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(new MouseEvent("pointerup", { clientY: 10 }));
    expect(document.activeElement).toBe(handle);
    const outer_keydown = vi.fn();
    view.dom.addEventListener("keydown", outer_keydown);
    handle.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(read_code_block_view_states(view.state)[0]?.[target]).toBe(116);
    expect(outer_keydown).not.toHaveBeenCalled();
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  },
);

it("commits a pointer resize once and cancels an unfinished resize", () => {
  const on_view_states_change = vi.fn();
  const { view, root } = open_code("```js\nhello\n```", {
    initial_view_states: [
      {
        source_height: 100,
        diagram_height: null,
        source_hidden: false,
        diagram_zoom: 1,
      },
    ],
    on_view_states_change,
  });
  const source = require_element<HTMLElement>(root, ".md-code-source");
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
    height: 100,
  } as DOMRect);
  const handle = require_element<HTMLElement>(
    root,
    '[aria-label="Resize code block"]',
  );
  handle.dispatchEvent(
    new MouseEvent("pointerdown", { button: 0, clientY: 10, bubbles: true }),
  );
  document.dispatchEvent(new MouseEvent("pointermove", { clientY: 60 }));
  expect(source.style.height).toBe("150px");
  expect(on_view_states_change).not.toHaveBeenCalled();
  document.dispatchEvent(new MouseEvent("pointerup", { clientY: 60 }));
  expect(read_code_block_view_states(view.state)[0]?.source_height).toBe(150);
  expect(on_view_states_change).toHaveBeenCalledTimes(1);
  handle.dispatchEvent(
    new MouseEvent("pointerdown", { button: 0, clientY: 10, bubbles: true }),
  );
  document.dispatchEvent(new MouseEvent("pointermove", { clientY: 90 }));
  document.dispatchEvent(new MouseEvent("pointercancel"));
  expect(source.style.height).toBe("150px");
  expect(on_view_states_change).toHaveBeenCalledTimes(1);
});

function choose_language(root: HTMLElement, name: string) {
  require_element<HTMLButtonElement>(root, ".md-code-language-button").click();
  const input = require_element<HTMLInputElement>(
    root,
    ".md-code-language-popup input",
  );
  input.value = name;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
}

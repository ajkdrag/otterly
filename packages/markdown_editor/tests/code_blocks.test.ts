/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";
import { commonmark } from "../src/plugins/commonmark/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";
import { source_undo } from "../src/core/source_state";

afterEach(destroy_test_editors);

const editor = (source: string) =>
  test_editor(source, [commonmark(), code_blocks()]);

function code_editors(test: TestEditor): EditorView[] {
  return [
    ...test.view.dom.querySelectorAll<HTMLElement>(
      ".md-code-source .cm-editor",
    ),
  ].flatMap((element) => {
    const view = EditorView.findFromDOM(element);
    return view ? [view] : [];
  });
}

function focused_code(test: TestEditor): EditorView | undefined {
  return code_editors(test).find((view) => view.hasFocus);
}

describe("fenced code", () => {
  test("CODE-001 typing in the code body reaches the note source at once", () => {
    const view = editor("```js\nlet a‸\n```");
    const code = code_editors(view)[0];
    expect(code).toBeDefined();
    code?.focus();
    view.type(" = 1");
    expect(view.saved()).toBe("```js\nlet a = 1\n```");
  });

  test("TYPE-006 the opening fence stays source until Enter, then focus moves into the body", () => {
    const view = editor("‸");
    view.type("```py");
    expect(code_editors(view)).toHaveLength(0);
    view.press("Enter").type("x = 1");
    expect(view.saved()).toBe("```py\nx = 1");
    expect(focused_code(view)).toBeDefined();
  });

  test("TYPE-006 Enter on an unclosed fence above other text closes the fence", () => {
    const view = editor("‸\nafter");
    view.type("```");
    view.press("Enter").type("code");
    expect(view.saved()).toBe("```\ncode\n```\nafter");
  });

  test("CODE-002 a quoted fence gets the quote prefix on its body", () => {
    const view = editor("> ‸");
    view.type("```");
    view.press("Enter").type("a");
    expect(view.saved()).toBe("> ```\n> a");
  });

  test("CODE-003 Enter inside a quoted body keeps the prefix", () => {
    const view = editor("> ```py\n> ab‸\n> ```");
    code_editors(view)[0]?.focus();
    const code = focused_code(view);
    code?.dispatch({ selection: { anchor: 1 } });
    view.press("Enter");
    expect(view.saved()).toBe("> ```py\n> a\n> b\n> ```");
  });

  test("CODE-004 Backspace at a later row joins rows and removes one prefix", () => {
    const view = editor("> ```\n> one\n> two\n> ```");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 4 } });
    view.press("Backspace");
    expect(view.saved()).toBe("> ```\n> onetwo\n> ```");
  });

  test("CODE-005 arrows at the body edges never edit source", () => {
    const source = "> ```py\n> a = 1\n> ```";
    const view = editor(source);
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 0 } });
    view.press("ArrowUp", "ArrowLeft");
    expect(view.saved()).toBe(source);
  });

  test("CODE-008 Mod-Enter starts a paragraph after the block", () => {
    const view = editor("```\ncode\n```");
    code_editors(view)[0]?.focus();
    view.press("Mod-Enter").type("after");
    expect(view.saved()).toBe("```\ncode\n```\n\nafter");
  });

  test("CODE-008 Mod-Enter closes an unfinished fence first", () => {
    const view = editor("```\ncode");
    code_editors(view)[0]?.focus();
    view.press("Mod-Enter");
    expect(view.saved()).toBe("```\ncode\n```\n\n");
  });

  test("CODE-009 Backspace at the start of a one-line body turns it into a paragraph", () => {
    const view = editor("```\nab\n```");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 0 } });
    view.press("Backspace");
    expect(view.saved()).toBe("ab");
  });

  test("CODE-009 a multi-line body keeps its block", () => {
    const view = editor("```\na\nb\n```");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 0 } });
    view.press("Backspace");
    expect(view.saved()).toBe("```\na\nb\n```");
  });

  test("CODE-011 a body line that looks like a closing fence grows the fence", () => {
    const view = editor("```\nx\n```");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 1 } });
    view.press("Enter").type("```");
    expect(view.saved()).toBe("````\nx\n```\n````");
  });

  test("CODE-016 Remove deletes the block between paragraphs and Undo restores the source", () => {
    const source = "a\n\n```js\nx\n```\n\nb";
    const view = editor(source);
    view.view.dom.querySelector<HTMLButtonElement>(".md-code-remove")?.click();
    expect(view.source()).toBe("a\n\n‸b");
    source_undo(view.view);
    expect(view.saved()).toBe(source);
  });

  test("CODE-016 Remove keeps one separator inside quotes and list items", () => {
    const quote = editor("> a\n> ```\n> x\n> ```\n> b");
    quote.view.dom.querySelector<HTMLButtonElement>(".md-code-remove")?.click();
    expect(quote.saved()).toBe("> a\n>\n> b");
    const list = editor("- a\n- ```\n  x\n  ```\n- b");
    list.view.dom.querySelector<HTMLButtonElement>(".md-code-remove")?.click();
    expect(list.saved()).toBe("- a\n- \n- b");
  });

  test("CODE-016 a read-only editor hides the Remove button", () => {
    const view = test_editor("```\nx\n```", [
      commonmark(),
      { name: "read_only", extensions: EditorState.readOnly.of(true) },
      code_blocks(),
    ]);
    expect(
      view.view.dom.querySelector<HTMLButtonElement>(".md-code-remove")?.hidden,
    ).toBe(true);
  });

  test("SRC-006 Undo after typing in a code body restores exact source", () => {
    const source = "```js\nlet a\n```";
    const view = editor(source);
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 5 } });
    view.type("bc");
    expect(view.saved()).toBe("```js\nlet abc\n```");
    source_undo(view.view);
    expect(view.saved()).toBe(source);
  });

  test("text above a block moving it keeps edits mapped to the right place", () => {
    const view = editor("‸\n```\nx\n```");
    view.type("intro ");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 1 } });
    view.type("y");
    expect(view.saved()).toBe("intro \n```\nxy\n```");
  });
});

test("CODE-012 a fence token that is a file extension finds its language", async () => {
  const python = LanguageDescription.of({
    name: "Python",
    extensions: ["py"],
    load: () =>
      Promise.resolve(
        new LanguageSupport(
          StreamLanguage.define({ token: (stream) => (stream.next(), null) }),
        ),
      ),
  });
  const view = test_editor("```py\nx = 1\n```", [
    commonmark(),
    code_blocks({ languages: [python] }),
  ]);
  const label = view.view.dom.querySelector(
    ".md-code-language-button",
  )?.textContent;
  expect(label).toBe("Python ▾");
  await Promise.resolve();
  expect(
    view.view.dom.querySelector(".md-code-toolbar [role=status]")?.textContent,
  ).toBe("");
});

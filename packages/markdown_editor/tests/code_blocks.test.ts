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
import {
  code_blocks,
  read_code_block_view_states,
  set_code_block_view_states,
  type CodeBlockViewState,
} from "../src/plugins/code_blocks/index";
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

  test.each([
    ["a list item", "‸- a\n- b", "```\ncode\n```\n- a\n- b"],
    ["a paragraph line", "‸text below\n- a", "```\ncode\n```\ntext below\n- a"],
    ["a quote line", "> ‸text\n> more", "> ```\n> code\n> ```\n> text\n> more"],
    ["inside a list item", "- ‸item\n- b", "- ```\n  code\n  ```\n  item\n- b"],
  ])(
    "TYPE-006 a fence typed in front of text on %s closes, and the text stays below it",
    (_name, source, expected) => {
      const view = editor(source);
      view.type("```");
      view.press("Enter").type("code");
      expect(view.saved()).toBe(expected);
    },
  );

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

  test.each(["ArrowRight", "ArrowDown"])(
    "CODE-019 %s at the end of the last block starts one row after it",
    (key) => {
      const view = editor("```\ncode\n```");
      const code = code_editors(view)[0];
      code?.focus();
      code?.dispatch({ selection: { anchor: 4 } });
      view.press(key).type("after");
      expect(view.saved()).toBe("```\ncode\n```\nafter");
      view.press("Mod-z");
      expect(view.saved()).toBe("```\ncode\n```");
    },
  );

  test("CODE-019 the new row keeps the quote prefix", () => {
    const view = editor("> ```\n> code\n> ```");
    const code = code_editors(view)[0];
    code?.focus();
    code?.dispatch({ selection: { anchor: 4 } });
    view.press("ArrowRight").type("after");
    expect(view.saved()).toBe("> ```\n> code\n> ```\n> after");
  });

  test.each([
    ["ArrowRight", "```\ncode\n```\n", "```\ncode\n```\nafter"],
    ["ArrowDown", "```\ncode\n```\n\n", "```\ncode\n```\nafter\n"],
    ["ArrowRight", "> ```\n> code\n> ```\n", "> ```\n> code\n> ```\n> after"],
    [
      "ArrowDown",
      "> ```\n> code\n> ```\n\n",
      "> ```\n> code\n> ```\n> after\n",
    ],
  ])(
    "CODE-019 %s at the end of the last block uses the blank row after it in %j",
    (key, source, expected) => {
      const view = editor(source);
      const code = code_editors(view)[0];
      code?.focus();
      code?.dispatch({ selection: { anchor: 4 } });
      view.press(key).type("after");
      expect(view.saved()).toBe(expected);
    },
  );

  test.each([
    ["the start of the last line", "```\none\ntwo\n```", 4],
    ["the middle of the last line", "```\none\ntwo\n```", 5],
    ["a quoted last line", "> ```\n> one\n> two\n> ```", 5],
  ])(
    "CODE-019 Down from %s of the last block moves to the line end without editing",
    (_, source, caret) => {
      const view = editor(source);
      const code = code_editors(view)[0];
      code?.focus();
      code?.dispatch({ selection: { anchor: caret } });
      view.press("ArrowDown");
      expect(view.saved()).toBe(source);
      expect(focused_code(view)?.state.selection.main.head).toBe(7);
      view.press("ArrowDown");
      expect(view.saved()).toBe(
        source + "\n" + (source[0] === ">" ? "> " : ""),
      );
    },
  );

  test.each(["ArrowRight", "ArrowDown"])(
    "CODE-019 %s at the end of a block with a row after it moves there without editing",
    (key) => {
      const view = editor("```\ncode\n```\nnext");
      const code = code_editors(view)[0];
      code?.focus();
      code?.dispatch({ selection: { anchor: 4 } });
      view.press(key);
      expect(view.saved()).toBe("```\ncode\n```\nnext");
      view.type("X");
      expect(view.saved()).toBe("```\ncode\n```\nXnext");
    },
  );

  test("SRC-006 Undo that removes the block gives focus back to the note", () => {
    const view = editor("‸");
    view.type("```");
    view.press("Enter").type("x");
    expect(focused_code(view)).toBeDefined();
    for (let step = 0; step < 10 && code_editors(view).length > 0; step++)
      view.press("Mod-z");
    expect(view.saved()).toBe("```");
    expect(view.view.hasFocus).toBe(true);
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

describe("code block resize handle", () => {
  const thirty_lines = (language: string) =>
    "```" + language + "\n" + "x\n".repeat(30) + "```";
  const view_state = (patch: Partial<CodeBlockViewState>) => ({
    source_height: null,
    diagram_height: null,
    source_hidden: false,
    diagram_zoom: 1,
    ...patch,
  });
  const diagram_options = {
    render_diagram: () => Promise.resolve(document.createElement("div")),
  };

  const find_element = (test: TestEditor, selector: string) => {
    const found = test.view.dom.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };
  const handle_of = (test: TestEditor, label: string) =>
    find_element(test, `[aria-label="${label}"]`);
  const stored = (test: TestEditor) => {
    const [state] = read_code_block_view_states(test.view.state);
    if (!state) throw new Error("no code block");
    return state;
  };
  const code_height = (test: TestEditor) => {
    const [code] = code_editors(test);
    if (!code) throw new Error("no code editor");
    return Math.ceil(code.contentHeight);
  };
  const seed = (test: TestEditor, patch: Partial<CodeBlockViewState>) => {
    test.view.dispatch({
      effects: set_code_block_view_states([view_state(patch)]),
    });
  };
  // jsdom has no layout and every rect height is 0, so the box height at
  // grab time is stubbed. Source and diagram boxes read it from style.height.
  const stub_box_height = (box: HTMLElement, when_unset = 0) => {
    box.getBoundingClientRect = () =>
      ({
        height: box.style.height
          ? Number.parseFloat(box.style.height)
          : when_unset,
      }) as DOMRect;
  };
  const drag = (handle: HTMLElement, distance: number) => {
    const init = { pointerId: 1, button: 0, bubbles: true, clientY: 100 };
    handle.dispatchEvent(new PointerEvent("pointerdown", init));
    document.dispatchEvent(
      new PointerEvent("pointermove", { ...init, clientY: 100 + distance }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", { ...init, clientY: 100 + distance }),
    );
  };
  const press_arrow = (handle: HTMLElement, key: string, times: number) => {
    for (let i = 0; i < times; i++)
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
  };

  test("CODE-015 dragging down stops at the height of the code", () => {
    const view = editor(thirty_lines("js"));
    const fit = code_height(view);
    expect(fit).toBeGreaterThan(48);
    drag(handle_of(view, "Resize code block"), 5000);
    expect(stored(view).source_height).toBe(fit);
  });

  test("CODE-015 dragging up still shrinks the block", () => {
    const view = editor(thirty_lines("js"));
    seed(view, { source_height: 300 });
    stub_box_height(find_element(view, ".md-code-source"));
    drag(handle_of(view, "Resize code block"), -100);
    expect(stored(view).source_height).toBe(200);
  });

  test("CODE-015 ArrowDown stops at the height of the code and ArrowUp steps 16", () => {
    const view = editor(thirty_lines("js"));
    const fit = code_height(view);
    const handle = handle_of(view, "Resize code block");
    press_arrow(handle, "ArrowDown", 100);
    expect(stored(view).source_height).toBe(fit);
    press_arrow(handle, "ArrowUp", 1);
    expect(stored(view).source_height).toBe(fit - 16);
  });

  test("CODE-015 ArrowDown at the limit stores nothing new", () => {
    const states: CodeBlockViewState[][] = [];
    const view = test_editor(thirty_lines("js"), [
      commonmark(),
      code_blocks({ on_view_states_change: (next) => states.push([...next]) }),
    ]);
    const handle = handle_of(view, "Resize code block");
    press_arrow(handle, "ArrowDown", 100);
    const writes = states.length;
    press_arrow(handle, "ArrowDown", 3);
    expect(states).toHaveLength(writes);
  });

  test("CODE-015 a saved height taller than the code is kept but cannot grow", () => {
    const view = editor("```js\nx\n```");
    seed(view, { source_height: 2000 });
    const box = find_element(view, ".md-code-source");
    expect(box.style.height).toBe("2000px");
    stub_box_height(box);
    drag(handle_of(view, "Resize code block"), 50);
    expect(stored(view).source_height).toBe(2000);
  });

  test("CODE-015 a saved height taller than the code can shrink", () => {
    const view = editor("```js\nx\n```");
    seed(view, { source_height: 2000 });
    stub_box_height(find_element(view, ".md-code-source"));
    drag(handle_of(view, "Resize code block"), -1950);
    expect(stored(view).source_height).toBe(50);
  });

  test("CODE-015 ArrowDown on an auto-height block already showing all the code stores nothing", () => {
    const states: CodeBlockViewState[][] = [];
    const view = test_editor(thirty_lines("js"), [
      commonmark(),
      code_blocks({ on_view_states_change: (next) => states.push([...next]) }),
    ]);
    stub_box_height(find_element(view, ".md-code-source"), code_height(view));
    press_arrow(handle_of(view, "Resize code block"), "ArrowDown", 3);
    expect(states).toHaveLength(0);
  });

  test("CODE-015 clicking the handle without moving stores no height", () => {
    // An auto-height box can be shorter than the 48px drag minimum.
    const view = editor("```js\nx\n```");
    stub_box_height(find_element(view, ".md-code-source"), 40);
    drag(handle_of(view, "Resize code block"), 0);
    expect(stored(view).source_height).toBeNull();
  });

  test("CODE-015 an auto-height block shorter than the minimum is not grown by the handle", () => {
    // One line of code fits in less than the 48px drag minimum.
    const view = editor("```js\nx\n```");
    expect(code_height(view)).toBeLessThanOrEqual(40);
    stub_box_height(find_element(view, ".md-code-source"), 40);
    const handle = handle_of(view, "Resize code block");
    press_arrow(handle, "ArrowUp", 1);
    press_arrow(handle, "ArrowDown", 1);
    drag(handle, -20);
    drag(handle, 20);
    expect(stored(view).source_height).toBeNull();
  });

  test("SPACE-012 without a saved height the source box sizes itself to the code", () => {
    const view = editor(thirty_lines("js"));
    const box = find_element(view, ".md-code-source");
    expect(box.style.height).toBe("");
    seed(view, { source_height: 200 });
    expect(box.style.height).toBe("200px");
    seed(view, { source_height: null });
    expect(box.style.height).toBe("");
  });

  test("CODE-015 the diagram handle stops at the height of the rendered diagram", () => {
    const view = test_editor("```mermaid\ngraph TD\n```", [
      commonmark(),
      code_blocks(diagram_options),
    ]);
    seed(view, { diagram_height: 100 });
    stub_box_height(find_element(view, ".md-code-diagram"), 200);
    drag(handle_of(view, "Resize diagram"), 500);
    expect(stored(view).diagram_height).toBe(200);
  });

  test("CODE-015 the handle reports the content fit as its maximum", () => {
    const view = editor(thirty_lines("js"));
    const fit = code_height(view);
    const handle = handle_of(view, "Resize code block");
    handle.focus();
    expect(handle.getAttribute("aria-valuemax")).toBe(String(fit));
    press_arrow(handle, "ArrowDown", 100);
    expect(handle.getAttribute("aria-valuenow")).toBe(String(fit));
    expect(handle.getAttribute("aria-valuemax")).toBe(String(fit));
  });

  test("CODE-015 clicking the handle keeps its value while it has focus", () => {
    const view = editor("```js\nx\n```");
    stub_box_height(find_element(view, ".md-code-source"), 40);
    const handle = handle_of(view, "Resize code block");
    drag(handle, 0);
    expect(document.activeElement).toBe(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
  });

  test("CODE-015 grabbing a scrolled diagram keeps its scroll position", () => {
    const view = test_editor("```mermaid\ngraph TD\n```", [
      commonmark(),
      code_blocks(diagram_options),
    ]);
    seed(view, { diagram_height: 100 });
    const preview = find_element(view, ".md-code-diagram");
    // jsdom has no scrolling. Like a browser, the stub clamps the scroll
    // offset when the box loses its height and so its overflow.
    let scroll_top = 80;
    Object.defineProperty(preview, "scrollTop", {
      get: () => scroll_top,
      set: (value: number) => (scroll_top = value),
    });
    preview.getBoundingClientRect = () => {
      if (!preview.style.height) scroll_top = 0;
      return {
        height: Number.parseFloat(preview.style.height) || 200,
      } as DOMRect;
    };
    const handle = handle_of(view, "Resize diagram");
    drag(handle, 0);
    expect(scroll_top).toBe(80);
    press_arrow(handle, "ArrowDown", 1);
    expect(scroll_top).toBe(80);
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

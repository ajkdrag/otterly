/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { line_numbers } from "../src/plugins/line_numbers";
import { create_markdown_state, create_text_state } from "../src/core/editor";
import { set_editor_mode } from "../src/core/editor_mode";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

const note = [
  "# Title",
  "",
  "```js",
  "const a = 1;",
  "```",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "end",
].join("\n");

function open_note(mode: "rich" | "source", caret: number) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: create_markdown_state(note, {
      plugins: [commonmark(), gfm(), code_blocks()],
      mode,
      source_extensions: line_numbers(),
    }),
  });
  view.dispatch({ selection: { anchor: caret } });
  views.push(view);
  return view;
}

// CodeMirror puts a hidden spacer element first, sized to the widest number.
function shown_numbers(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
    .slice(1)
    .map((element) => element.textContent ?? "");
}

describe("line numbers", () => {
  test("source mode numbers every line of the document", () => {
    const view = open_note("source", 0);
    expect(shown_numbers(view)).toEqual(
      Array.from({ length: 11 }, (_, index) => String(index + 1)),
    );
  });

  test("rich mode has no gutter, even with the caret inside a code block", () => {
    const view = open_note("rich", note.indexOf("const"));
    expect(view.dom.querySelector(".cm-content .cm-editor")).not.toBeNull();
    expect(view.dom.querySelectorAll(".cm-gutters")).toHaveLength(0);
  });

  test("rich mode has no gutter, even with the caret inside a table", () => {
    const view = open_note("rich", note.indexOf("| 1 |") + 2);
    expect(view.dom.querySelector(".cm-content .cm-editor")).not.toBeNull();
    expect(view.dom.querySelectorAll(".cm-gutters")).toHaveLength(0);
  });

  test("switching between modes adds and removes the gutter", () => {
    const view = open_note("rich", 0);
    set_editor_mode(view, "source");
    expect(shown_numbers(view)).toHaveLength(11);
    set_editor_mode(view, "rich");
    expect(view.dom.querySelectorAll(".cm-gutters")).toHaveLength(0);
  });

  test("a text file numbers every line", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: create_text_state("a: 1\nb: 2\nc: 3\n", line_numbers()),
    });
    views.push(view);
    expect(shown_numbers(view)).toEqual(["1", "2", "3", "4"]);
  });

  // With both content margins auto the gutter floats away from the text on a
  // wide pane. jsdom's getComputedStyle ignores specificity, so this resolves
  // the winning rule itself: most classes first, then the later rule.
  test("the text column keeps its left edge against the gutter", () => {
    const view = open_note("source", 0);
    expect(winning_margin_left(view.contentDOM)).toBe("0px");
  });
});

function winning_margin_left(element: Element): string {
  let winner = { classes: -1, value: "" };
  for (const sheet of document.styleSheets)
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!element.matches(rule.selectorText)) continue;
      const value = rule.style.getPropertyValue("margin-left");
      if (!value) continue;
      const classes = rule.selectorText.match(/\.[^\s.>]+/g)?.length ?? 0;
      if (classes >= winner.classes) winner = { classes, value };
    }
  return winner.value;
}

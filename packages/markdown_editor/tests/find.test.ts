/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { links } from "../src/plugins/links/index";
import {
  find,
  get_find_matches,
  get_find_query,
  set_find_query,
  update_find_query,
} from "../src/plugins/find";
import { focus_selection } from "../src/core/surface";
import { create_markdown_state } from "../src/core/editor";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const editor = (source: string) =>
  test_editor(source, [
    commonmark(),
    gfm(),
    code_blocks(),
    links({ open_link: () => {} }),
    find(),
  ]);

function search(view: TestEditor, query: string, selected_index = 0) {
  view.view.dispatch({ effects: set_find_query.of({ query, selected_index }) });
}

function matches(view: TestEditor) {
  return get_find_matches(view.view.state);
}

describe("find", () => {
  test("FIND-001 matches punctuation literally and ignores case, without changing source", () => {
    const source = "Find [a.b] and [A.B]. Also aab.";
    const view = editor(source);
    search(view, "[a.b]");
    expect(matches(view)).toEqual([
      { from: 5, to: 10 },
      { from: 15, to: 20 },
    ]);
    expect(view.view.dom.querySelectorAll(".find-match")).toHaveLength(2);
    expect(view.saved()).toBe(source);
  });

  test("FIND-001 a query with regex characters is not a pattern", () => {
    const view = editor("a+b aab a.b");
    search(view, "a+b");
    expect(matches(view)).toEqual([{ from: 0, to: 3 }]);
    search(view, ".");
    expect(matches(view)).toEqual([{ from: 9, to: 10 }]);
  });

  test("FIND-001 offsets stay in UTF-16 units beside emoji and case-expanding letters", () => {
    const view = editor("😀 İ hello HELLO");
    search(view, "hello");
    expect(matches(view)).toEqual([
      { from: 5, to: 10 },
      { from: 11, to: 16 },
    ]);
  });

  test("FIND-002 positions follow edits and stale matches disappear", () => {
    const view = editor("same same");
    search(view, "same");
    view.view.dispatch({
      changes: [
        { from: 0, insert: "prefix " },
        { from: 5, to: 9, insert: "other" },
      ],
    });
    expect(matches(view)).toEqual([{ from: 7, to: 11 }]);
    expect(view.view.dom.querySelectorAll(".find-match")).toHaveLength(1);
  });

  test("FIND-002 deleting the selected match leaves the last remaining match selected", () => {
    const view = editor("same same");
    search(view, "same", 1);
    view.view.dispatch({ changes: { from: 4, to: 9 } });
    expect(matches(view)).toHaveLength(1);
    expect(view.view.dom.querySelector(".find-match--selected")).not.toBeNull();
  });

  test("FIND-002 navigating keeps the same match list, and dismissing clears highlights", () => {
    const view = editor("same same");
    search(view, "same");
    const first_scan = matches(view);
    search(view, "same", 1);
    expect(matches(view)).toBe(first_scan);
    expect(get_find_query(view.view.state).selected_index).toBe(1);
    expect(
      view.view.dom.querySelector(".find-match--selected")?.textContent,
    ).toBe("same");
    search(view, "");
    expect(matches(view)).toEqual([]);
    expect(view.view.dom.querySelector(".find-match")).toBeNull();
  });

  test("FIND-003 each note's state keeps its own matches when switched in", () => {
    const view = editor("first first");
    search(view, "first");
    const first_note = view.view.state;
    const plugins = [commonmark(), find()];
    view.view.setState(create_markdown_state("first", { plugins }));
    expect(matches(view)).toEqual([]);
    search(view, "first");
    expect(matches(view)).toHaveLength(1);
    view.view.setState(first_note);
    expect(matches(view)).toHaveLength(2);
  });

  test("FIND-004 matches inside a code body are drawn by the code editor", () => {
    const view = editor("```js\nconst Needle = 1;\n```\n\nneedle outside");
    search(view, "needle");
    expect(matches(view)).toHaveLength(2);
    expect(
      view.view.dom.querySelector(".md-code-source .find-match")?.textContent,
    ).toBe("Needle");
  });

  test("FIND-004 the selected match inside a code body is marked selected there", () => {
    const view = editor("```js\nneedle\n```\n\nneedle outside");
    search(view, "needle", 0);
    expect(
      view.view.dom.querySelector(".md-code-source .find-match--selected"),
    ).not.toBeNull();
    search(view, "needle", 1);
    expect(
      view.view.dom.querySelector(".md-code-source .find-match--selected"),
    ).toBeNull();
    expect(
      view.view.dom.querySelector(".find-match--selected")?.textContent,
    ).toBe("needle");
  });

  test("FIND-004 matches inside table cells are highlighted", () => {
    const view = editor("| a | b |\n| - | - |\n| Needle | x |\n\n‸");
    search(view, "needle");
    expect(matches(view)).toHaveLength(1);
    const cell = view.view.dom.querySelector('[data-row="1"][data-col="0"]');
    expect(cell?.querySelector(".find-match")?.textContent).toBe("Needle");
  });

  test("FIND-004 a match in the active table cell is drawn by the cell editor", () => {
    const source = "| a | b |\n| - | - |\n| Needle | x |\n\n";
    const view = editor(source + "‸");
    view.view.dispatch({ selection: { anchor: source.indexOf("Needle") + 2 } });
    focus_selection(view.view);
    search(view, "needle");
    expect(
      view.view.dom.querySelector(".md-table-cell-active .find-match")
        ?.textContent,
    ).toBe("Needle");
  });

  test("FIND reveal: a selected match inside a rendered link shows that link's source", () => {
    const source =
      "intro\n\n[Label](https://example.com) and [Other](https://other.test)";
    const view = editor("‸" + source);
    expect(view.view.dom.querySelectorAll(".md-link-rendered")).toHaveLength(2);
    search(view, "example.com", 0);
    const rendered = [
      ...view.view.dom.querySelectorAll(".md-link-rendered"),
    ].map((link) => link.textContent);
    expect(rendered).toEqual(["Other"]);
    expect(
      view.view.dom.querySelector(".find-match--selected")?.textContent,
    ).toBe("example.com");
    expect(view.saved()).toBe(source);
  });

  test("FIND reveal: an unselected match leaves its link rendered, and dismissing renders it again", () => {
    const source =
      "[Label](https://example.com) and [Label two](https://other.test)";
    const view = editor("‸intro\n\n" + source);
    search(view, "label", 1);
    const rendered = [
      ...view.view.dom.querySelectorAll(".md-link-rendered"),
    ].map((link) => link.textContent);
    expect(rendered).toEqual(["Label"]);
    search(view, "");
    expect(view.view.dom.querySelectorAll(".md-link-rendered")).toHaveLength(2);
  });

  test("FIND-001 update_find_query selects a match without moving the caret or editing", () => {
    const source = "alpha\n\nbeta alpha";
    const view = editor(source + "‸");
    update_find_query(view.view, "alpha", 1);
    expect(get_find_query(view.view.state)).toMatchObject({
      query: "alpha",
      selected_index: 1,
    });
    expect(view.saved()).toBe(source);
  });
});

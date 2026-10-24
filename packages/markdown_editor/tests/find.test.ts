/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { links } from "../src/plugins/links/index";
import {
  expand_replacement,
  find,
  find_regexp,
  get_find_matches,
  get_find_query,
  literal_find_spec,
  replace_all_find_matches,
  replace_find_match,
  set_find_query,
  update_find_query,
  type FindSpec,
} from "../src/plugins/find";
import { focus_selection } from "../src/core/surface";
import { create_markdown_state } from "../src/core/editor";
import { source_undo } from "../src/core/source_state";
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

function search(
  view: TestEditor,
  query: string | FindSpec,
  selected_index = 0,
) {
  const spec = typeof query === "string" ? literal_find_spec(query) : query;
  view.view.dispatch({ effects: set_find_query.of({ spec, selected_index }) });
}

const regex = (text: string): FindSpec => ({
  ...literal_find_spec(text),
  regex: true,
});

function matched_text(view: TestEditor) {
  return matches(view).map(({ from, to }) =>
    view.view.state.doc.sliceString(from, to),
  );
}

function selected_text(view: TestEditor) {
  const { selected_index } = get_find_query(view.view.state);
  const match = matches(view)[selected_index];
  return match ? view.view.state.doc.sliceString(match.from, match.to) : null;
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
    update_find_query(view.view, literal_find_spec("alpha"), 1);
    expect(get_find_query(view.view.state)).toMatchObject({
      spec: { text: "alpha" },
      selected_index: 1,
    });
    expect(view.saved()).toBe(source);
  });

  test("FIND-007 regex, case, and whole word options narrow the matches", () => {
    const view = editor("Cat cat concat cats a1 a22");
    search(view, regex("a\\d+"));
    expect(matched_text(view)).toEqual(["a1", "a22"]);
    search(view, { ...literal_find_spec("cat"), case_sensitive: true });
    expect(matched_text(view)).toEqual(["cat", "cat", "cat"]);
    search(view, { ...literal_find_spec("cat"), whole_word: true });
    expect(matched_text(view)).toEqual(["Cat", "cat"]);
  });

  test("FIND-007 whole word uses Unicode word boundaries, as the vault find does", () => {
    const view = editor("café cafés Café привет приветствие");
    search(view, { ...literal_find_spec("café"), whole_word: true });
    expect(matched_text(view)).toEqual(["café", "Café"]);
    search(view, { ...literal_find_spec("привет"), whole_word: true });
    expect(matched_text(view)).toEqual(["привет"]);
  });

  test("FIND-007 an invalid regex has no matches, and empty matches are skipped", () => {
    const view = editor("aaa b");
    search(view, regex("(unclosed"));
    expect(matches(view)).toEqual([]);
    expect(find_regexp(regex("(unclosed"))).toBeNull();
    expect(find_regexp({ ...regex("a)|(b"), whole_word: true })).toBeNull();
    search(view, regex("a*"));
    expect(matched_text(view)).toEqual(["aaa"]);
  });

  test("FIND-007 regex mode accepts escaped punctuation, as the vault find does", () => {
    const view = editor("#todo a-b a_b x\\-y");
    search(view, regex("\\#\\w+"));
    expect(matched_text(view)).toEqual(["#todo"]);
    search(view, regex("a\\-b|a\\_b"));
    expect(matched_text(view)).toEqual(["a-b", "a_b"]);
    search(view, regex("[\\-]"));
    expect(matched_text(view)).toEqual(["-", "-"]);
    // An escaped backslash stays one, so this is a backslash and a dash.
    search(view, regex("\\\\-"));
    expect(matched_text(view)).toEqual(["\\-"]);
    expect(find_regexp(regex("\\<"))).toBeNull();
  });

  test("FIND-007 regex matches never cross a line", () => {
    const view = editor("foo\nbar\nfoo bar");
    search(view, regex("foo\\s+bar"));
    expect(matched_text(view)).toEqual(["foo bar"]);
    search(view, regex("^bar"));
    expect(matches(view)).toHaveLength(1);
  });

  test("FIND-008 replacing the selected match selects the next one", () => {
    const view = editor("foo foo foo");
    search(view, "foo", 1);
    expect(replace_find_match(view.view, "foofoo")).toBe(true);
    expect(view.saved()).toBe("foo foofoo foo");
    expect(get_find_query(view.view.state).selected_index).toBe(3);
    expect(selected_text(view)).toBe("foo");
    expect(matches(view)[3]).toEqual({ from: 11, to: 14 });
  });

  test("FIND-008 replacing the last match wraps to the first", () => {
    const view = editor("foo foo");
    search(view, "foo", 1);
    replace_find_match(view.view, "bar");
    expect(view.saved()).toBe("foo bar");
    expect(get_find_query(view.view.state).selected_index).toBe(0);
  });

  test("FIND-008 regex replacements expand capture groups", () => {
    const view = editor("v1 and v22");
    search(view, regex("v(?<n>\\d+)"));
    replace_find_match(view.view, "version $1");
    expect(view.saved()).toBe("version 1 and v22");
    replace_find_match(view.view, "${n}!");
    expect(view.saved()).toBe("version 1 and 22!");
  });

  test("FIND-008 literal replacements insert dollar signs as is", () => {
    const view = editor("price");
    search(view, "price");
    replace_find_match(view.view, "$1 $$");
    expect(view.saved()).toBe("$1 $$");
  });

  test("FIND-009 replace all is one undo step", () => {
    const source = "a1 b a2\n\na3";
    const view = editor(source);
    search(view, regex("a(\\d)"));
    expect(replace_all_find_matches(view.view, "<$1>")).toBe(3);
    expect(view.saved()).toBe("<1> b <2>\n\n<3>");
    expect(matches(view)).toEqual([]);
    source_undo(view.view);
    expect(view.saved()).toBe(source);
    expect(selected_text(view)).toBe("a1");
  });

  test("FIND-009 replace all keeps CRLF line endings in the saved source", () => {
    const view = editor("foo\r\nfoo\r\n");
    search(view, "foo");
    replace_all_find_matches(view.view, "bar");
    expect(view.saved()).toBe("bar\r\nbar\r\n");
  });
});

describe("expand_replacement", () => {
  const found = "on 2026-10 ok".match(/(?<year>\d{4})-(\d{2})(x)?/);
  if (!found) throw new Error("the test pattern should match");
  const match = found;

  test("expands numbered and named groups, braced or not", () => {
    expect(expand_replacement("$2/$1", match)).toBe("10/2026");
    expect(expand_replacement("${2}x $year ${year}", match)).toBe(
      "10x 2026 2026",
    );
    expect(expand_replacement("[$0]", match)).toBe("[2026-10]");
  });

  test("follows the Rust rules for $$, unknown groups, and stray dollars", () => {
    expect(expand_replacement("$$1", match)).toBe("$1");
    expect(expand_replacement("$1a|$3|$9|${nope}", match)).toBe("|||");
    expect(expand_replacement("cost: $ ${unclosed $", match)).toBe(
      "cost: $ ${unclosed $",
    );
  });
});

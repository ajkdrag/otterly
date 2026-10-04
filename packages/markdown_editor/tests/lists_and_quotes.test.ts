/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { commonmark } from "../src/plugins/commonmark/index";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const editor = (source: string) => test_editor(source, [commonmark()]);

describe("list items", () => {
  test("LIST-001 Enter continues bullet, ordered, nested, and quoted items", () => {
    expect(editor("- a‸").press("Enter").type("b").source()).toBe("- a\n- b‸");
    expect(editor("1. a‸").press("Enter").type("b").source()).toBe(
      "1. a\n2. b‸",
    );
    expect(editor("- a\n  - b‸").press("Enter").source()).toBe(
      "- a\n  - b\n  - ‸",
    );
    expect(editor("> - a‸").press("Enter").type("b").source()).toBe(
      "> - a\n> - b‸",
    );
  });

  test("LIST-001 Enter in the middle of an item moves the rest to the new item", () => {
    expect(editor("- ab‸cd").press("Enter").source()).toBe("- ab\n- ‸cd");
  });

  test("LIST-001 ordered siblings that count up shift by one", () => {
    expect(editor("1. a‸\n2. b\n3. c").press("Enter").source()).toBe(
      "1. a\n2. ‸\n3. b\n4. c",
    );
  });

  test("LIST-001 a loose list keeps its blank line between items", () => {
    expect(editor("- a\n\n- b‸").press("Enter").source()).toBe(
      "- a\n\n- b\n\n- ‸",
    );
  });

  test("LIST-002 Enter on an empty nested item lifts one level at a time", () => {
    const view = editor("- a\n  - b\n    - ‸");
    view.press("Enter");
    expect(view.source()).toBe("- a\n  - b\n  - ‸");
    view.press("Enter");
    expect(view.source()).toBe("- a\n  - b\n- ‸");
  });

  test("LIST-003 Enter on the last empty item leaves the list with a blank boundary", () => {
    expect(editor("- a\n- ‸").press("Enter").type("prose").source()).toBe(
      "- a\n\nprose‸",
    );
  });

  test("LIST-003 leaving a list inside a quote keeps the quote", () => {
    expect(editor("> - a\n> - ‸").press("Enter").source()).toBe(
      "> - a\n>\n> ‸",
    );
  });

  test("LIST-004 Tab nests the item and its subtree under the previous sibling", () => {
    expect(editor("- a\n- b‸\n  - c").press("Tab").source()).toBe(
      "- a\n  - b‸\n    - c",
    );
  });

  test("LIST-004 Tab inside a quote indents after the quote marker", () => {
    expect(editor("> - a\n> - b‸").press("Tab").source()).toBe(
      "> - a\n>   - b‸",
    );
  });

  test("LIST-005 Tab on a first item changes nothing", () => {
    expect(editor("- a‸\n- b").press("Tab").source()).toBe("- a‸\n- b");
  });

  test("LIST-006 Shift-Tab lifts a nested item with its children", () => {
    expect(editor("- a\n  - b‸\n    - c").press("Shift-Tab").source()).toBe(
      "- a\n- b‸\n  - c",
    );
  });

  test("LIST-006 Shift-Tab at the top level removes the marker and keeps prose separate", () => {
    expect(editor("- a\n- b‸").press("Shift-Tab").source()).toBe("- a\n\nb‸");
  });

  test("LIST-006 Tab then Shift-Tab round-trips unusual marker spacing", () => {
    const view = editor("-   a\n-   b‸");
    view.press("Tab").press("Shift-Tab");
    expect(view.source()).toBe("-   a\n-   b‸");
  });

  test("LIST-007 Backspace at the text start lifts the item", () => {
    expect(editor("- a\n  - ‸b").press("Backspace").source()).toBe("- a\n- ‸b");
    expect(editor("- ‸a").press("Backspace").source()).toBe("‸a");
  });

  test("LIST-007 Backspace at a task's text start lifts the item", () => {
    expect(editor("- a\n  - [ ] ‸b").press("Backspace").source()).toBe(
      "- a\n- [ ] ‸b",
    );
  });

  test("LIST-008 a backwards multi-item selection shifts once", () => {
    const view = editor("- a\n- b‸\n- c‹");
    view.press("Tab");
    expect(view.source()).toBe("- a\n  - b‸\n  - c‹");
  });

  test("LIST-009 Shift-Enter adds a hard break at the item's text column", () => {
    expect(editor("- a‸").press("Shift-Enter").type("b").source()).toBe(
      "- a  \n  b‸",
    );
    expect(editor("> 10. a‸").press("Shift-Enter").source()).toBe(
      "> 10. a  \n>     ‸",
    );
  });

  test("TASK-003 a new item after a checked task is unchecked", () => {
    expect(editor("- [x] done‸").press("Enter").source()).toBe(
      "- [x] done\n- [ ] ‸",
    );
  });

  test("TYPE-002 rapid Enter, Tab, and typing build a nested item", () => {
    expect(editor("- ab‸").press("Enter", "Tab").type("c").source()).toBe(
      "- ab\n  - c‸",
    );
  });

  test("Enter on a lazy continuation line starts a new item", () => {
    expect(editor("- a\nb‸").press("Enter").source()).toBe("- a\nb\n- ‸");
    expect(editor("> - a\n> b‸").press("Enter").source()).toBe(
      "> - a\n> b\n> - ‸",
    );
  });
});

describe("quotes", () => {
  test("QUOTE-001 Enter continues quoted prose", () => {
    expect(editor("> a‸").press("Enter").source()).toBe("> a\n> ‸");
    expect(editor("> > a‸").press("Enter").source()).toBe("> > a\n> > ‸");
  });

  test("QUOTE-001 Enter on a lazy quote line continues the quote", () => {
    expect(editor("> a\nb‸").press("Enter").source()).toBe("> a\nb\n> ‸");
  });

  test("QUOTE-002 Enter on an empty quote line removes one level", () => {
    expect(editor("> > a\n> > ‸").press("Enter").source()).toBe(
      "> > a\n>\n> ‸",
    );
  });

  test("QUOTE-003 two Enters leave quoted prose", () => {
    expect(editor("> text‸").press("Enter", "Enter").type("out").source()).toBe(
      "> text\n\nout‸",
    );
  });

  test("QUOTE-004 walk from quoted list to quote to plain prose", () => {
    const view = editor("> - first\n> - second‸\n");
    view.press("Enter", "Enter").type("Quoted paragraph");
    view.press("Enter", "Enter").type("Outside paragraph");
    expect(view.source()).toBe(
      "> - first\n> - second\n>\n> Quoted paragraph\n\nOutside paragraph‸\n",
    );
  });

  test("QUOTE-002 Enter on the empty quoted row after a quoted list leaves the quote", () => {
    // The list item is still open on that blank row, inside the quote.
    const view = editor("> q\n> - x‸");
    view.press("Enter", "Enter", "Enter").type("Outside");
    expect(view.source()).toBe("> q\n> - x\n>\nOutside‸");
  });

  test("QUOTE-005 Backspace at quote text start lifts one level with a boundary", () => {
    expect(editor("> > previous\n> > ‸child").press("Backspace").source()).toBe(
      "> > previous\n>\n> ‸child",
    );
  });

  test("QUOTE-006 Mod-Enter starts a paragraph after the whole quote", () => {
    expect(editor("> a‸\n> b\n\nnext").press("Mod-Enter").source()).toBe(
      "> a\n> b\n\n‸\n\nnext",
    );
    expect(editor("> - item‸").press("Mod-Enter").source()).toBe(
      "> - item\n\n‸",
    );
  });

  test("Tab on quoted prose does not indent before the quote marker", () => {
    expect(editor("> a‸").press("Tab").source()).not.toMatch(/^\s+>/);
  });
});

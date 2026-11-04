/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { set_editor_mode } from "../src/core/editor_mode";
import type { MarkdownPlugin } from "../src/core/plugin";
import { source_undo } from "../src/core/source_state";
import {
  code_blocks,
  convert_to_code_block,
} from "../src/plugins/code_blocks/index";
import {
  toggle_list,
  type ListKind,
} from "../src/plugins/commonmark/block_commands";
import { commonmark } from "../src/plugins/commonmark/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const plugins = () => [commonmark(), gfm(), code_blocks(), frontmatter()];
const editor = (source: string) => test_editor(source, plugins());
const doc = (test: TestEditor) => test.view.state.doc.toString();

function selected(test: TestEditor) {
  const { from, to, anchor, head } = test.view.state.selection.main;
  return { text: test.view.state.sliceDoc(from, to), backwards: anchor > head };
}

function with_cursors(source: string, positions: number[]) {
  const test = editor(source);
  test.view.dispatch({
    selection: EditorSelection.create(
      positions.map((position) => EditorSelection.cursor(position)),
    ),
  });
  return test;
}

const read_only: MarkdownPlugin = {
  name: "read_only",
  extensions: EditorState.readOnly.of(true),
};

describe("formatting a selection", () => {
  test("FMT-002 bold wraps only the selected word and keeps a backwards selection", () => {
    const test = editor("-   ‸hello‹ world  \n");
    test.press("Mod-b");
    expect(test.source()).toBe("-   **‸hello‹** world  \n");
  });

  test("FMT-002 bold on bold text removes the markers", () => {
    const test = editor("**‹hello‸**");
    test.press("Mod-b");
    expect(test.source()).toBe("‹hello‸");
  });

  test("FMT-002 selected whitespace stays outside the markers, direction kept", () => {
    const test = editor("‸ hello ‹");
    test.press("Mod-b");
    expect(doc(test)).toBe(" **hello** ");
    expect(selected(test)).toEqual({ text: "hello", backwards: true });
  });

  test("FMT-002 a whitespace-only selection is left alone", () => {
    const test = editor("‹   ‸");
    test.press("Mod-b");
    expect(doc(test)).toBe("   ");
  });

  test("FMT-002 italic inside bold keeps the bold markers", () => {
    const test = editor("**‹hello‸**");
    test.press("Mod-i");
    expect(doc(test)).toBe("***hello***");
  });

  test.each([
    ["__‹hello‸__", "Mod-b", "hello"],
    ["_‹hello‸_", "Mod-i", "hello"],
    ["~~‹hello‸~~", "Mod-Shift-x", "hello"],
    ["``‹a ` b‸``", "Mod-e", "a ` b"],
    ["`` ‹`hello`‸ ``", "Mod-e", "`hello`"],
    ["`‹   ‸`", "Mod-e", "   "],
  ])(
    "FMT-002 the toggle removes the whole surrounding syntax in %s",
    (source, key, expected) => {
      const test = editor(source);
      test.press(key);
      expect(doc(test)).toBe(expected);
    },
  );

  test.each([
    ["Mod-b", "**x**"],
    ["Mod-i", "*x*"],
    ["Mod-e", "`x`"],
    ["Mod-Shift-x", "~~x~~"],
  ])(
    "FMT-002 %s formats the selection with its own marker",
    (key, expected) => {
      const test = editor("‹x‸");
      test.press(key);
      expect(doc(test)).toBe(expected);
    },
  );

  test.each(["Mod-b", "Mod-i", "Mod-e", "Mod-Shift-x"])(
    "FMT-002 %s does nothing in a read-only editor",
    (key) => {
      const test = test_editor("‹hello‸", [...plugins(), read_only]);
      test.press(key);
      expect(doc(test)).toBe("hello");
    },
  );

  test.each([
    ["‹prose\n\n~~~js\nhello‸\n~~~", "Mod-b"],
    ["‹prose\n\n    hello‸", "Mod-i"],
    ["`‹hello‸`", "Mod-b"],
    ["‹a `hello‸` word", "Mod-e"],
    ["---\ntit‹le: hello\n---\nbod‸y", "Mod-b"],
  ])(
    "FMT-002 a selection touching literal syntax is not formatted: %s",
    (source, key) => {
      const test = editor(source);
      const before = doc(test);
      test.press(key);
      expect(doc(test)).toBe(before);
    },
  );
});

describe("formatting across blocks and parts of a mark", () => {
  test.each([
    ["‹one\n\ntwo‸", "**one**\n\n**two**"],
    [
      "‹# Heading\n\n- first\n- second‸",
      "# **Heading**\n\n- **first**\n- **second**",
    ],
    ["‹Title\n=====\n\nbody‸", "**Title**\n=====\n\n**body**"],
    ["‹> first\n>\n> second‸", "> **first**\n>\n> **second**"],
  ])(
    "FMT-003 bold keeps block markers, and a second toggle restores: %s",
    (marked, expected) => {
      const test = editor(marked);
      const source = doc(test);
      test.press("Mod-b");
      expect(doc(test)).toBe(expected);
      test.press("Mod-b");
      expect(doc(test)).toBe(source);
    },
  );

  test("NAV-008 a backwards cross-paragraph selection keeps its direction after italic", () => {
    const test = editor("‸one\n\ntwo‹");
    test.press("Mod-i");
    expect(doc(test)).toBe("*one*\n\n*two*");
    expect(selected(test).backwards).toBe(true);
  });

  test("FMT-003 a mixed selection removes the existing bold", () => {
    const test = editor("‹**one**\n\ntwo‸");
    test.press("Mod-b");
    expect(doc(test)).toBe("one\n\ntwo");
  });

  test("FMT-003 formatting outside a partial selection stays", () => {
    const test = editor("**‹hello‸ world**");
    test.press("Mod-b");
    expect(doc(test)).toBe("hello **world**");
  });

  test("FMT-003 un-bolding the middle of a mark splits it", () => {
    const test = editor("**one ‹two‸ three**");
    test.press("Mod-b");
    expect(doc(test)).toBe("**one** two **three**");
  });
});

describe("pending format for future typing", () => {
  test("FMT-004 a toggle at an empty caret adds markers only when text arrives", () => {
    const test = editor("‸");
    test.press("Mod-b");
    expect(doc(test)).toBe("");
    test.type("h").type("i");
    expect(test.source()).toBe("**hi‸**");
    test.press("Mod-b");
    expect(doc(test)).toBe("**hi**");
    test.type("!");
    expect(doc(test)).toBe("**hi**!");
  });

  test("FMT-004 toggling off before typing inserts no markers", () => {
    const test = editor("‸");
    test.press("Mod-i", "Mod-i").type("plain");
    expect(doc(test)).toBe("plain");
  });

  test("FMT-004 two pending formats combine", () => {
    const test = editor("‸");
    test.press("Mod-b", "Mod-i");
    expect(doc(test)).toBe("");
    test.type("both");
    expect(doc(test)).toBe("***both***");
  });

  test("FMT-004 moving the caret clears the pending format", () => {
    const test = editor("‸text");
    test.press("Mod-b");
    test.view.dispatch({ selection: { anchor: 4 } });
    test.type("plain");
    expect(doc(test)).toBe("textplain");
  });

  test("FMT-004 typing plain text inside a bold word splits the bold", () => {
    const test = editor("**he‸llo**");
    test.press("Mod-b").type("XY");
    expect(doc(test)).toBe("**he**XY**llo**");
  });

  test("FMT-004 toggled off at the start of a bold word, typing goes before it", () => {
    const test = editor("**‸hello**");
    test.press("Mod-b").type("X");
    expect(doc(test)).toBe("X**hello**");
  });

  test("FMT-004 every cursor gets the pending format", () => {
    const test = with_cursors("a\nb", [1, 3]);
    test.press("Mod-b").type("X");
    expect(doc(test)).toBe("a**X**\nb**X**");
    test.type("Y");
    expect(doc(test)).toBe("a**XY**\nb**XY**");
  });

  test("FMT-004 toggling at several cursors inside bold leaves the text alone", () => {
    const test = with_cursors("**hello**", [3, 6]);
    test.press("Mod-b");
    expect(doc(test)).toBe("**hello**");
    expect(test.view.state.selection.ranges.map((range) => range.head)).toEqual(
      [3, 6],
    );
  });

  test("FMT-006 inline code at an empty caret changes nothing", () => {
    const test = editor("te‸xt");
    test.press("Mod-e");
    expect(doc(test)).toBe("text");
    test.type("!");
    expect(doc(test)).toBe("te!xt");
  });
});

describe("generated formatting through typing and deletion", () => {
  test("FMT-005 undo and redo move the text and its markers together", () => {
    const test = editor("‸");
    test.press("Mod-b").type("hello");
    expect(doc(test)).toBe("**hello**");
    test.press("Mod-z");
    expect(doc(test)).toBe("");
    test.press("Mod-Shift-z");
    expect(doc(test)).toBe("**hello**");
  });

  test.each([" ", "\n", "\n\n"])(
    "FMT-005 whitespace %j stays outside the new bold",
    (space) => {
      const test = editor("‸");
      test.press("Mod-b").type("hello").type(space);
      expect(doc(test)).toBe(`**hello**${space}`);
      test.type("world");
      expect(doc(test)).toBe(`**hello**${space}**world**`);
    },
  );

  test("FMT-005 typed paragraphs are formatted one by one", () => {
    const test = editor("‸");
    test.press("Mod-b").type(" one\n\ntwo ");
    expect(doc(test)).toBe(" **one**\n\n**two** ");
  });

  test("FMT-005 a trailing space is not inside the italic", () => {
    const test = editor("‸");
    test.press("Mod-i").type("hello ");
    expect(doc(test)).toBe("*hello* ");
  });

  test("FMT-005 whitespace-only typing generates no markers", () => {
    const test = editor("‸");
    test.press("Mod-b").type("  ");
    expect(doc(test)).toBe("  ");
    test.type("word");
    expect(doc(test)).toBe("  **word**");
  });

  test("FMT-005 deleting the last typed character removes the empty markers", () => {
    const test = editor("‸");
    test.press("Mod-b").type("x").press("Backspace");
    expect(test.source()).toBe("‸");
    test.type("y");
    expect(doc(test)).toBe("**y**");
  });

  test("FMT-005 a deletion that arrives as input.delete.backward also removes the empty markers", () => {
    const test = editor("‸");
    test.press("Mod-b").type("x");
    test.view.dispatch({
      changes: { from: 2, to: 3 },
      selection: { anchor: 2 },
      userEvent: "input.delete.backward",
    });
    expect(test.source()).toBe("‸");
    test.type("y");
    expect(doc(test)).toBe("**y**");
  });

  test("FMT-005 bold plus strike stay valid across a space and a deletion", () => {
    const test = editor("‸");
    test.press("Mod-b", "Mod-Shift-x").type("x ");
    expect(doc(test)).toBe("**~~x~~** ");
    test.type("y");
    expect(doc(test)).toBe("**~~x~~** **~~y~~**");
    test.press("Backspace");
    expect(doc(test)).toBe("**~~x~~** ");
  });

  test("FMT-005 turning bold off keeps the inner strike for the next characters", () => {
    const test = editor("‸");
    test.press("Mod-b", "Mod-Shift-x").type("x").press("Mod-b").type("y");
    expect(doc(test)).toBe("**~~x~~**~~y~~");
    test.type("z");
    expect(doc(test)).toBe("**~~x~~**~~yz~~");
  });

  test("FMT-005 IME replacement text stays inside the generated bold", () => {
    const test = editor("‸");
    test.press("Mod-b");
    const { view } = test;
    view.dispatch(view.state.replaceSelection("k"), {
      userEvent: "input.type.compose",
    });
    view.dispatch({
      changes: { from: 2, to: 3, insert: "漢" },
      selection: { anchor: 3 },
      userEvent: "input.type.compose",
    });
    expect(doc(test)).toBe("**漢**");
    expect(view.state.selection.main.head).toBe(3);
  });

  test.each([
    ["**~~‸xy~~**", "Mod-b", "~~z~~**~~xy~~**"],
    ["**~~x‸y~~**", "Mod-b", "**~~x~~**~~z~~**~~y~~**"],
    ["**~~xy‸~~**", "Mod-Shift-x", "**~~xy~~z**"],
  ])(
    "FMT-005 leaving a nested mark keeps the marks ordered: %s",
    (source, key, expected) => {
      const test = editor(source);
      test.press(key).type("z");
      expect(doc(test)).toBe(expected);
    },
  );
});

describe("inline code delimiter", () => {
  test("FMT-006 selected text with a backtick gets a longer delimiter", () => {
    const test = editor("‹a ` b‸");
    test.press("Mod-e");
    expect(doc(test)).toBe("``a ` b``");
  });
});

describe("block style shortcuts", () => {
  test.each([
    ["Mod-Alt-1", "# text"],
    ["Mod-Alt-2", "## text"],
    ["Mod-Alt-3", "### text"],
    ["Mod-Alt-7", "1. text"],
    ["Mod-Alt-8", "- text"],
  ])("FMT-007 %s converts a paragraph", (key, expected) => {
    const test = editor("te‸xt");
    test.press(key);
    expect(doc(test)).toBe(expected);
  });

  test("FMT-007 heading, strike, then code conversion, and one undo steps back", () => {
    const test = editor("‹text‸");
    test.press("Mod-Alt-2");
    expect(test.saved()).toBe("## text");
    test.press("Mod-Alt-x");
    expect(test.saved()).toBe("## ~~text~~");
    test.press("Mod-Alt-c");
    expect(test.saved()).toBe("```\ntext\n```");
    expect(source_undo(test.view)).toBe(true);
    expect(test.saved()).toBe("## ~~text~~");
  });

  test("NAV-008 a backwards selection survives heading and code conversion", () => {
    const test = editor("hello ‸world‹");
    test.press("Mod-Alt-2");
    expect(selected(test)).toEqual({ text: "world", backwards: true });
    test.press("Mod-Alt-c");
    expect(selected(test)).toEqual({ text: "world", backwards: true });
  });

  test("FMT-007 only the containing paragraph changes and undo restores exact line endings", () => {
    const source = "before\r\n\r\none‹ li‸ne\n\nlast\r";
    const test = editor(source);
    test.press("Mod-Alt-2");
    expect(test.saved()).toBe("before\r\n\r\n## one line\n\nlast\r");
    expect(source_undo(test.view)).toBe(true);
    expect(test.saved()).toBe(source.replace(/[‹‸]/g, ""));
  });

  test.each(["‸# title", "‸Title\n==="])(
    "FMT-007 the current heading level is not toggled off: %s",
    (source) => {
      const test = editor(source);
      const before = test.saved();
      test.press("Mod-Alt-1");
      expect(test.saved()).toBe(before);
    },
  );

  test.each([
    "‸Title\nsecond\n===",
    "‹Title\nsecond\n===‸",
    "Title\nsecond\n==‸=",
  ])(
    "FMT-007 a multiline Setext heading converts once to one line: %s",
    (source) => {
      const test = editor(source);
      test.press("Mod-Alt-3");
      expect(doc(test)).toBe("### Title second");
      expect(syntaxTree(test.view.state).topNode.firstChild?.name).toBe(
        "ATXHeading3",
      );
    },
  );

  test("FMT-007 a heading level change keeps the quote prefix and drops closing hashes", () => {
    const test = editor("> ## t‸itle ##");
    test.press("Mod-Alt-1");
    expect(doc(test)).toBe("> # title");
  });

  test("FMT-007 a caret marks only its own line, inside the quote", () => {
    const test = editor("> o‸ne\n> two");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("> - one\n> two");
  });

  test.each([
    ["- item‸", "item"],
    ["1. item‸", "- item"],
  ])(
    "FMT-007 the bullet key restyles an existing item: %j",
    (source, expected) => {
      const test = editor(source);
      test.press("Mod-Alt-8");
      expect(doc(test)).toBe(expected);
    },
  );

  test.each(["- item‸", "1. item‸"])(
    "FMT-007 heading and code keys leave the first paragraph of an item alone: %s",
    (source) => {
      const test = editor(source);
      const before = doc(test);
      test.press("Mod-Alt-2", "Mod-Alt-c");
      expect(doc(test)).toBe(before);
    },
  );

  test("FMT-007 a heading is not forced into the first paragraph of a list item", () => {
    const test = editor("- te‸xt");
    test.press("Mod-Alt-2");
    expect(doc(test)).toBe("- text");
  });

  test("FMT-007 a heading is not wrapped in a list item", () => {
    const test = editor("# ti‸tle");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("# title");
  });

  test.each([
    "```\n‸code\n```",
    "    ‸code",
    "| a |\n|---|\n| ‸b |",
    "---\ntitle: ‸metadata\n---",
  ])("FMT-007 literal content rejects block shortcuts: %j", (source) => {
    const test = editor(source);
    const before = test.saved();
    test.press("Mod-Alt-1", "Mod-Alt-8", "Mod-Alt-c");
    expect(test.saved()).toBe(before);
  });

  test("FMT-007 block shortcuts do nothing in a read-only editor", () => {
    const test = test_editor("‹text‸", [...plugins(), read_only]);
    test.press("Mod-Alt-1", "Mod-Alt-8", "Mod-Alt-c");
    expect(doc(test)).toBe("text");
  });

  test("FMT-007 only selected paragraphs change with several cursors", () => {
    const test = with_cursors("one\n\nskip\n\nthree", [1, 13]);
    test.press("Mod-Alt-2");
    expect(doc(test)).toBe("## one\n\nskip\n\n## three");
  });
});

describe("toggling lists over selected lines", () => {
  const toggle = (source: string, kind: ListKind) => {
    const test = editor(source);
    toggle_list(kind)(test.view);
    return test;
  };

  test.each<[ListKind, string, string]>([
    ["bullet", "‹one\ntwo\nthree‸", "- one\n- two\n- three"],
    ["bullet", "‹one\ntwo\n\nthree\nfour‸", "- one\n- two\n\n- three\n- four"],
    ["ordered", "‹one\n\ntwo\nthree‸", "1. one\n\n2. two\n3. three"],
    ["ordered", "‹- a\n- b‸", "1. a\n2. b"],
    ["bullet", "‹- a\nplain\n1. c‸", "- a\n- plain\n- c"],
    ["task", "‹- a\nb‸", "- [ ] a\n- [ ] b"],
    ["task", "‹* a‸", "* [ ] a"],
    ["bullet", "‹- [x] a‸", "- a"],
    ["bullet", "‹> one\n> two‸", "> - one\n> - two"],
    ["ordered", "‹  indented‸", "1. indented"],
  ])("FMT-007 %s list from %j", (kind, source, expected) => {
    expect(doc(toggle(source, kind))).toBe(expected);
  });

  test.each<[ListKind, string, string]>([
    ["bullet", "‹- a\n- b‸", "a\nb"],
    ["task", "‹- [ ] a\n- [x] b‸", "a\nb"],
    ["ordered", "‹1. a\n\n2) b‸", "a\n\nb"],
  ])(
    "FMT-007 %s toggles off when every line already is one: %j",
    (kind, source, expected) => {
      expect(doc(toggle(source, kind))).toBe(expected);
    },
  );

  test("FMT-007 a lazy quoted line gets its quote marker back", () => {
    expect(doc(toggle("‹> one\ntwo‸", "bullet"))).toBe("> - one\n> - two");
  });

  test("FMT-007 a caret on an empty line gets a marker and stays after it", () => {
    const test = toggle("one\n\n‸", "bullet");
    expect(test.source()).toBe("one\n\n- ‸");
  });

  test("FMT-007 a selection ending at the start of a line leaves that line alone", () => {
    expect(doc(toggle("‹one\ntwo\n‸three", "bullet"))).toBe(
      "- one\n- two\nthree",
    );
  });

  test("FMT-007 continuation lines stay with their item", () => {
    expect(doc(toggle("‹- a\n  b‸", "ordered"))).toBe("1. a\n   b");
    expect(doc(toggle("‹- a\n  b‸", "bullet"))).toBe("a\nb");
  });

  test("FMT-007 nested items keep their nesting and number per parent", () => {
    expect(doc(toggle("‹- a\n  - b\n- c\n  - d‸", "ordered"))).toBe(
      "1. a\n   1. b\n2. c\n   1. d",
    );
  });

  test("FMT-007 an unselected child follows its parent's wider marker", () => {
    expect(doc(toggle("- a‸\n  - b", "ordered"))).toBe("1. a\n   - b");
  });

  test("FMT-007 removing a middle item does not glue it onto the item above", () => {
    expect(doc(toggle("- a\n- ‹b‸\n- c", "bullet"))).toBe("- a\n\nb\n- c");
  });

  test.each([
    ["‹1. a‸\n2. b", "a\n\n2. b"],
    ["1. a\n2. ‹b‸\n3. c", "1. a\n\nb\n\n3. c"],
    ["‹1. a\n   more‸\n2. b", "a\nmore\n\n2. b"],
  ])(
    "FMT-007 removing an item does not glue the next numbered item onto it: %j",
    (source, expected) => {
      expect(doc(toggle(source, "ordered"))).toBe(expected);
    },
  );

  test.each<[ListKind, string, string]>([
    ["bullet", "a\n‸\nb", "a\n\n- \nb"],
    ["ordered", "a\n‸\nb", "a\n\n1. \nb"],
    ["bullet", "a\n‸", "a\n\n- "],
  ])(
    "FMT-007 a marker on a blank line under a paragraph does not join it: %s %j",
    (kind, source, expected) => {
      expect(doc(toggle(source, kind))).toBe(expected);
    },
  );

  test.each<[string, string]>([
    ["1. a\n2. b\n‹c‸", "1. a\n2. b\n3. c"],
    ["1. a\n2. b\n3. ‹c\nd‸", "1. a\n2. b\n3. c\n4. d"],
    ["1. a\n   - x\n‹c‸", "1. a\n   - x\n2. c"],
  ])(
    "FMT-007 ordered numbering continues the list directly above: %j",
    (source, expected) => {
      expect(doc(toggle(source, "ordered"))).toBe(expected);
    },
  );

  test.each<[ListKind, string, string]>([
    ["bullet", "‹+ a\nb‸", "+ a\n+ b"],
    ["ordered", "‹1) a\nb‸", "1) a\n2) b"],
    ["bullet", "* a\n‹b‸", "* a\n* b"],
  ])(
    "FMT-007 new items use the list's own bullet or delimiter: %s %j",
    (kind, source, expected) => {
      expect(doc(toggle(source, kind))).toBe(expected);
    },
  );

  test.each(["‹- \n- b‸", "‹-\n- b‸"])(
    "FMT-007 an empty item loses its marker like the others: %j",
    (source) => {
      expect(doc(toggle(source, "bullet"))).toBe("\nb");
    },
  );

  test("FMT-007 a callout title keeps its place and its body becomes a list", () => {
    expect(doc(toggle("‹> [!note] Title\n> body‸", "bullet"))).toBe(
      "> [!note] Title\n> - body",
    );
  });

  test.each(["# ti‸tle", "‹Title\n===‸", "text\n\n‹***‸"])(
    "FMT-007 headings and rules get no marker: %j",
    (source) => {
      const test = toggle(source, "bullet");
      expect(test.saved()).toBe(source.replace(/[‹‸]/g, ""));
    },
  );

  test("FMT-007 a heading in the selection keeps its text and restarts numbering", () => {
    expect(doc(toggle("‹one\n# h\ntwo\nthree‸", "ordered"))).toBe(
      "1. one\n# h\n1. two\n2. three",
    );
  });

  test.each<[string, string]>([
    ["‹a\n\n> b\n\nc‸", "1. a\n\n> 1. b\n\n1. c"],
    ["‹> a\n> b\n\nc‸", "> 1. a\n> 2. b\n\n1. c"],
    ["‹> a\n>\n> > b\n>\n> c‸", "> 1. a\n>\n> > 1. b\n>\n> 1. c"],
    ["1. x\n‹> a‸", "1. x\n> 1. a"],
    ["‹1) a\n\n> b‸", "1) a\n\n> 1. b"],
  ])(
    "FMT-007 ordered numbering restarts when the quote around the line changes: %j",
    (source, expected) => {
      expect(doc(toggle(source, "ordered"))).toBe(expected);
    },
  );

  test("FMT-007 a selected continuation paragraph becomes a nested item and back", () => {
    const test = editor("- a\n\n  ‹b‸");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("- a\n\n  - b");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("- a\n\n  b");
  });

  test("FMT-007 a selected continuation line becomes a nested item and back", () => {
    const test = editor("1. a\n   ‹cont‸");
    test.press("Mod-Alt-7");
    expect(doc(test)).toBe("1. a\n   1. cont");
    // Removing a nested item never glues its text onto the parent's paragraph.
    test.press("Mod-Alt-7");
    expect(doc(test)).toBe("1. a\n\n   cont");
  });

  test("FMT-007 removing a nested item and the next outer item keeps them apart", () => {
    const test = editor("- a\n  - ‹b\n- c‸");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("- a\n\n  b\n\nc");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("- a\n\n  - b\n\n- c");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("- a\n\n  b\n\nc");
  });

  test("FMT-007 a selection touching a fence changes nothing", () => {
    const source = "‹one\n```\nx\n```\ntwo‸";
    expect(doc(toggle(source, "bullet"))).toBe(source.replace(/[‹‸]/g, ""));
  });

  test("FMT-007 one undo reverts the whole list conversion", () => {
    const test = editor("‹one\ntwo\n\n- three‸");
    test.press("Mod-Alt-7");
    expect(doc(test)).toBe("1. one\n2. two\n\n3. three");
    expect(source_undo(test.view)).toBe(true);
    expect(doc(test)).toBe("one\ntwo\n\n- three");
  });
});

describe("converting prose to code", () => {
  test("FMT-008 inline marks and links turn into their displayed text, and undo restores the source", () => {
    const test = editor("**b‹ol‸d** [link](url) and `code`");
    const before = doc(test);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("```\nbold link and code\n```");
    expect(source_undo(test.view)).toBe(true);
    expect(doc(test)).toBe(before);
  });

  test.each([
    ["> ‸second", "> ```\n> second\n> ```"],
    ["- first\n\n  ‸second", "- first\n\n  ```\n  second\n  ```"],
  ])(
    "FMT-008 the quote or list prefix goes on every fence line: %j",
    (source, expected) => {
      const test = editor(source);
      test.press("Mod-Alt-c");
      expect(doc(test)).toBe(expected);
    },
  );

  test("FMT-008 inline code padding and autolinks become their displayed text", () => {
    const test = editor("`` `li‸teral` `` and <https://example.com>");
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("```\n`literal` and https://example.com\n```");
  });

  test.each(["‸one\\\ntwo", "‸one  \ntwo"])(
    "FMT-008 a hard break becomes a line break in code: %j",
    (source) => {
      const code = editor(source);
      code.press("Mod-Alt-c");
      expect(doc(code)).toBe("```\none\ntwo\n```");
      const heading = editor(source);
      heading.press("Mod-Alt-2");
      expect(doc(heading)).toBe("## one two");
    },
  );

  test("FMT-008 visible backticks get a longer fence", () => {
    const test = editor("```` ``‸` ````");
    test.press("Mod-Alt-c");
    expect(doc(test)).toContain("````\n");
  });

  test.each([
    ["‹one\ntwo\n\nthree\nfour‸", "```\none\ntwo\n\nthree\nfour\n```"],
    ["‹# h\npara\n\nmore‸", "```\nh\npara\n\nmore\n```"],
    ["‹> one\n>\n> **two**‸", "> ```\n> one\n>\n> two\n> ```"],
    ["‹one\n\n- **item**\n\ntwo‸", "```\none\n\n- **item**\n\ntwo\n```"],
  ])("FMT-008 one selection makes one fence: %j", (source, expected) => {
    const test = editor(source);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe(expected);
  });

  test("FMT-008 a line that leaves the quote ends the fence and the next block starts another", () => {
    const test = editor("‹> one\n\ntwo‸");
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("> ```\n> one\n> ```\n\n```\ntwo\n```");
  });

  test("FMT-008 in source mode the fence keeps the Markdown source the user sees", () => {
    const test = editor("‹# Head\n\nsome **bold** and [a](b)‸");
    set_editor_mode(test.view, "source");
    convert_to_code_block(test.view);
    expect(doc(test)).toBe("```\n# Head\n\nsome **bold** and [a](b)\n```");
  });

  test("FMT-008 a selected block with another prefix at the end gets its own fence", () => {
    const test = editor("‹one\n\n> quoted‸");
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("```\none\n```\n\n> ```\n> quoted\n> ```");
  });

  test("FMT-008 a selection touching an HTML comment changes nothing", () => {
    const source = "‹one\n\n<!-- c -->\n\ntwo‸";
    const test = editor(source);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe(source.replace(/[‹‸]/g, ""));
  });

  test("FMT-008 a callout title keeps its marker and its body becomes code", () => {
    const test = editor("‹> [!note] Title\n>\n> body‸");
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("> [!note] Title\n>\n> ```\n> body\n> ```");
  });

  test("FMT-008 each selection range gets its own fence", () => {
    const test = with_cursors("one\n\nskip\n\nthree", [1, 13]);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("```\none\n```\n\nskip\n\n```\nthree\n```");
  });

  test("FMT-008 two carets in one paragraph make one fence", () => {
    const test = with_cursors("one two", [1, 5]);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe("```\none two\n```");
  });

  test("FMT-008 a selection touching a fence changes nothing", () => {
    const source = "‹one\n```\nx\n```\ntwo‸";
    const test = editor(source);
    test.press("Mod-Alt-c");
    expect(doc(test)).toBe(source.replace(/[‹‸]/g, ""));
  });

  test("FMT-008 a selection across blank lines keeps its text and direction", () => {
    const test = editor("o‸ne\n\n**thr**‹ee");
    test.press("Mod-Alt-c");
    expect(selected(test)).toEqual({ text: "ne\n\nthr", backwards: true });
    expect(source_undo(test.view)).toBe(true);
    expect(doc(test)).toBe("one\n\n**thr**ee");
  });
});

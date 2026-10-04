/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { MarkdownPlugin } from "../src/core/plugin";
import { source_undo } from "../src/core/source_state";
import { code_blocks } from "../src/plugins/code_blocks/index";
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

  test("FMT-007 each paragraph becomes one list item, continuation lines indented", () => {
    const test = editor("‹one\ntwo\n\nthree‸");
    test.press("Mod-Alt-7");
    expect(doc(test)).toBe("1. one\n   two\n\n2. three");
  });

  test("FMT-007 a bullet inside a quote keeps the quote markers on every line", () => {
    const test = editor("> o‸ne\n> two");
    test.press("Mod-Alt-8");
    expect(doc(test)).toBe("> - one\n>   two");
  });

  test.each(["- item‸", "1. item‸"])(
    "FMT-007 an existing list item is not restyled: %s",
    (source) => {
      const test = editor(source);
      const before = doc(test);
      test.press("Mod-Alt-8", "Mod-Alt-2", "Mod-Alt-c");
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
    test.press("Mod-Alt-1", "Mod-Alt-c");
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
});

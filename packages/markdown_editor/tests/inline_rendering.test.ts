/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { editor_theme_spec } from "../src/core/editor_theme";
import type { MarkdownPlugin } from "../src/core/plugin";
import { callouts } from "../src/plugins/callouts/index";
import { commonmark } from "../src/plugins/commonmark/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import { images } from "../src/plugins/images/index";
import { links } from "../src/plugins/links/index";
import { wiki_links } from "../src/plugins/wiki_links/index";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(() => {
  destroy_test_editors();
  vi.restoreAllMocks();
});

type OpenOptions = {
  open_link?: (target: string) => void;
  resolve_image?: (
    source: string,
    signal: AbortSignal,
  ) => string | Promise<string>;
  read_only?: boolean;
};

function open(marked_source: string, options: OpenOptions = {}) {
  const open_link = options.open_link ?? vi.fn();
  const resolve_image =
    options.resolve_image ??
    ((source: string) => `https://example.invalid/${source}`);
  const read_only: MarkdownPlugin = {
    name: "read_only",
    extensions: EditorState.readOnly.of(options.read_only ?? false),
  };
  return test_editor(marked_source, [
    commonmark(),
    gfm(),
    links({ open_link }),
    images({ resolve_image }),
    wiki_links(),
    frontmatter(),
    callouts(),
    read_only,
  ]);
}

// A plain first line holds the caret, so nothing below it starts revealed.
const below_caret = (body: string, options?: OpenOptions) =>
  open(`top‸\n\n${body}`, options);

function move_caret_to(editor: TestEditor, position: number) {
  editor.view.dispatch({ selection: { anchor: position } });
}

function select(editor: TestEditor, anchor: number, head: number) {
  editor.view.dispatch({ selection: { anchor, head } });
}

// Offset into the display document (CRLF counts as one character).
function position_of(editor: TestEditor, needle: string, extra = 0) {
  const position = editor.view.state.doc.toString().indexOf(needle);
  if (position < 0) throw new Error(`"${needle}" is not in the document`);
  return position + extra;
}

function shown_text(editor: TestEditor) {
  return editor.view.contentDOM.textContent ?? "";
}

function texts_of(editor: TestEditor, selector: string) {
  return [...editor.view.contentDOM.querySelectorAll(selector)].map(
    (element) => element.textContent,
  );
}

function line_with(editor: TestEditor, text: string) {
  const lines = [
    ...editor.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
  ];
  const line = lines.find((candidate) => candidate.textContent?.includes(text));
  if (!line) throw new Error(`No rendered line contains "${text}"`);
  return line;
}

// The wrapper elements around a line, outermost first.
function wrappers_of(line: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let parent = line.parentElement; parent; parent = parent.parentElement) {
    if (parent.classList.contains("cm-content")) break;
    if (parent.classList.contains("md-wrap")) found.unshift(parent);
  }
  return found;
}

function last_line(editor: TestEditor) {
  return [
    ...editor.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
  ].at(-1);
}

function rendered_links(editor: TestEditor) {
  return [
    ...editor.view.contentDOM.querySelectorAll<HTMLElement>(
      "[data-md-link-target]",
    ),
  ].map((link) => [link.textContent, link.dataset.mdLinkTarget]);
}

describe("source preservation", () => {
  const mixed_source =
    "﻿---\r\ntitle: Mixed\r\n---\r\n# Title  \r\n\r\n" +
    "trailing spaces  \r\nsecond line **bold** and `code` <br> end\n\n" +
    "[ref link][r] and [r] ![img](a.png) [[Wiki|alias]] \\*escaped\\* &amp;\r\n\r\n" +
    "- [ ] task\n- [x] done\r\n\r\n> [!note] Hi\n> body\n\n---\n\n" +
    '[r]: https://example.com "Title"';

  test.each([
    ["mixed fixture", mixed_source],
    ["final newline", "# a\n\ntext **b**\n"],
    ["no final newline", "# a\n\ntext **b**"],
    ["CRLF only", "# a\r\n\r\ntext\r\n- item\r\n"],
    ["empty file", ""],
  ])(
    "SRC-001 opening and moving the caret through every position saves the exact bytes: %s",
    (_name, source) => {
      const editor = open(source);
      expect(editor.saved()).toBe(source);
      const length = editor.view.state.doc.length;
      for (let position = 0; position <= length; position++) {
        move_caret_to(editor, position);
        expect(editor.saved()).toBe(source);
      }
      select(editor, 0, length);
      expect(editor.saved()).toBe(source);
    },
  );
});

describe("inline marks", () => {
  const marks = "plain **bold** then _italic_ and `code` plus ~~gone~~";

  test("FMT-001 bold, italic, code, and strike render without their delimiters", () => {
    const editor = open(`‸${marks}`);
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    expect(texts_of(editor, ".md-emphasis")).toEqual(["italic"]);
    expect(texts_of(editor, ".md-inline-code")).toEqual(["code"]);
    expect(texts_of(editor, ".md-strike")).toEqual(["gone"]);
  });

  test("FMT-001 only the element holding the caret shows its delimiters", () => {
    const editor = open(`‸${marks}`);
    move_caret_to(editor, position_of(editor, "bold", 2));
    expect(texts_of(editor, ".md-strong")).toEqual(["**bold**"]);
    expect(texts_of(editor, ".md-emphasis")).toEqual(["italic"]);
    expect(texts_of(editor, ".md-inline-code")).toEqual(["code"]);
    expect(texts_of(editor, ".md-strike")).toEqual(["gone"]);

    move_caret_to(editor, position_of(editor, "code", 2));
    expect(texts_of(editor, ".md-inline-code")).toEqual(["`code`"]);
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);

    move_caret_to(editor, 0);
    expect(texts_of(editor, ".md-inline-code")).toEqual(["code"]);
  });

  test("FMT-001 a caret touching either end of the element counts as inside it", () => {
    const editor = open(`‸${marks}`);
    const start = position_of(editor, "**bold**");
    const end = start + "**bold**".length;
    for (const caret of [start, end]) {
      move_caret_to(editor, caret);
      expect(texts_of(editor, ".md-strong")).toEqual(["**bold**"]);
    }
    for (const caret of [start - 1, end + 1]) {
      move_caret_to(editor, caret);
      expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    }
  });

  test("FMT-001 a non-empty selection never reveals delimiters", () => {
    const editor = open(`‸${marks}`);
    select(editor, 0, editor.view.state.doc.length);
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    expect(shown_text(editor)).not.toMatch(/[*~`_]/);
    select(editor, position_of(editor, "bold"), position_of(editor, "bold", 4));
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    expect(editor.saved()).toBe(marks);
  });

  test("FMT-001 nested marks reveal along the caret's chain only", () => {
    const editor = open("‸**outer _inner_ end** and **other**");
    move_caret_to(editor, position_of(editor, "outer", 2));
    expect(texts_of(editor, ".md-strong")).toEqual([
      "**outer inner end**",
      "other",
    ]);
    expect(texts_of(editor, ".md-emphasis")).toEqual(["inner"]);

    move_caret_to(editor, position_of(editor, "inner", 2));
    expect(texts_of(editor, ".md-strong")).toEqual([
      "**outer _inner_ end**",
      "other",
    ]);
    expect(texts_of(editor, ".md-emphasis")).toEqual(["_inner_"]);
  });

  test("TYPE-005 incomplete delimiters stay literal until the closing delimiter arrives", () => {
    const editor = open("start ‸");
    editor.type("**bol");
    expect(texts_of(editor, ".md-strong")).toEqual([]);
    expect(editor.source()).toBe("start **bol‸");
    editor.type("d**");
    expect(texts_of(editor, ".md-strong")).toEqual(["**bold**"]);
    editor.type(" after");
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    expect(editor.source()).toBe("start **bold** after‸");
  });

  test.each([
    ["_italic_", ".md-emphasis", "italic"],
    ["~~gone~~", ".md-strike", "gone"],
    ["`code`", ".md-inline-code", "code"],
  ])(
    "TYPE-005 typing %s completes into one rendered element",
    (typed, selector, rendered) => {
      const editor = open("‸");
      editor.type(`${typed} x`);
      expect(texts_of(editor, selector)).toEqual([rendered]);
      expect(editor.source()).toBe(`${typed} x‸`);
    },
  );

  test("TYPE-005 an unfinished marker does not expose neighboring elements", () => {
    const editor = open("**done** then *half‸");
    expect(texts_of(editor, ".md-strong")).toEqual(["done"]);
    expect(texts_of(editor, ".md-emphasis")).toEqual([]);
    expect(shown_text(editor)).toContain("*half");
  });
});

describe("escapes and entities", () => {
  const source = "a \\*literal\\* &amp; &copy; end";

  test("SRC-013 escapes and entities show the character they stand for", () => {
    const editor = open(`‸${source}`);
    expect(shown_text(editor)).toBe("a *literal* & © end");
    expect(editor.saved()).toBe(source);
  });

  test("SRC-013 the caret touching an escape shows its exact source spelling", () => {
    const editor = open(`‸${source}`);
    move_caret_to(editor, position_of(editor, "\\*literal", 1));
    expect(shown_text(editor)).toBe("a \\*literal* & © end");
    move_caret_to(editor, position_of(editor, "&amp;", 2));
    expect(shown_text(editor)).toContain("&amp;");
    expect(shown_text(editor)).toContain("©");
    move_caret_to(editor, 0);
    expect(shown_text(editor)).toBe("a *literal* & © end");
    expect(editor.saved()).toBe(source);
  });

  test("SRC-013 inline code keeps escapes literal", () => {
    const editor = below_caret("`\\*x\\* &amp;`");
    expect(texts_of(editor, ".md-inline-code")).toEqual(["\\*x\\* &amp;"]);
  });

  test("SRC-013 frontmatter keeps escapes and entities literal", () => {
    const editor = open("---\ntitle: \\*a\\* &amp;\n---\n\nbody‸");
    expect(line_with(editor, "title:").textContent).toBe(
      "title: \\*a\\* &amp;",
    );
  });
});

describe("legacy html breaks", () => {
  test("SPACE-008 an inline break renders as a line break and a lone one as a blank row", () => {
    const source = "top‸\n\nbefore<br />after\n\n<br />\n\nend";
    const editor = open(source);
    expect(
      editor.view.contentDOM.querySelectorAll("br.md-html-break"),
    ).toHaveLength(1);
    expect(
      editor.view.contentDOM.querySelectorAll("span.md-html-break"),
    ).toHaveLength(1);
    expect(shown_text(editor)).not.toContain("<br");
    expect(editor.saved()).toBe(source.replace("‸", ""));
  });

  test("SPACE-008 the caret touching an inline break shows its source", () => {
    const editor = open("top‸\n\nbefore<br />after");
    move_caret_to(editor, position_of(editor, "<br", 2));
    expect(
      editor.view.contentDOM.querySelectorAll("br.md-html-break"),
    ).toHaveLength(0);
    expect(shown_text(editor)).toContain("before<br />after");
  });

  test("SPACE-008 a standalone break keeps its blank-row styling while its source shows", () => {
    const editor = open("top‸\n\n<br />\n\nafter");
    const source_line = () =>
      [
        ...editor.view.contentDOM.querySelectorAll<HTMLElement>(
          ".md-legacy-blank-line",
        ),
      ][0];
    expect(source_line()?.classList).toContain("md-blank-line");
    move_caret_to(editor, position_of(editor, "<br", 2));
    expect(source_line()?.textContent).toBe("<br />");
    expect(source_line()?.classList).toContain("md-blank-line");
  });

  test("SPACE-008 breaks in inline code and frontmatter stay literal", () => {
    const editor = open('---\ntitle: "<br />"\n---\n\n`<br />` text‸');
    expect(
      editor.view.contentDOM.querySelectorAll(".md-html-break"),
    ).toHaveLength(0);
    expect(shown_text(editor)).toContain('title: "<br />"');
    expect(texts_of(editor, ".md-inline-code")).toEqual(["<br />"]);
  });

  test("SPACE-008 other html tags are never turned into elements", () => {
    const editor = below_caret("text <b>bold</b> <script>alert(1)</script>");
    expect(editor.view.contentDOM.querySelector("b, script")).toBeNull();
    expect(shown_text(editor)).toContain("<b>bold</b>");
  });
});

describe("headings and line prefixes", () => {
  test("FMT-001 an ATX heading hides its marker unless the caret is inside the prefix", () => {
    const editor = below_caret("## Heading\n\ntext");
    expect(line_with(editor, "Heading").classList).toContain("md-heading-2");
    expect(line_with(editor, "Heading").textContent).toBe("Heading");

    move_caret_to(editor, position_of(editor, "## Heading", 1));
    expect(line_with(editor, "Heading").textContent).toBe("## Heading");

    move_caret_to(editor, position_of(editor, "Heading"));
    expect(line_with(editor, "Heading").textContent).toBe("Heading");
  });

  test("FMT-001 a closing ATX marker shows only while the caret touches it", () => {
    const editor = open("before\n\n### heading ##\n\n‸");
    expect(line_with(editor, "heading").textContent).toBe("heading");
    move_caret_to(editor, position_of(editor, "heading", "heading".length));
    expect(line_with(editor, "heading").textContent).toBe("heading ##");
    move_caret_to(editor, position_of(editor, "heading", 2));
    expect(line_with(editor, "heading").textContent).toBe("heading");
  });

  test("FMT-001 a Setext underline hides until the caret reaches its line", () => {
    const editor = below_caret("Title\n=====\n\nParagraph.");
    expect(line_with(editor, "Title").classList).toContain("md-heading-1");
    expect(
      editor.view.contentDOM.querySelector(".md-setext-underline"),
    ).not.toBeNull();
    move_caret_to(editor, position_of(editor, "==="));
    expect(
      editor.view.contentDOM.querySelector(".md-setext-underline"),
    ).toBeNull();
    expect(shown_text(editor)).toContain("=====");
  });

  test("TYPE-003 a completed Setext heading keeps its heading meaning", () => {
    const editor = below_caret("A real heading\n----------------");
    expect(line_with(editor, "A real heading").classList).toContain(
      "md-heading-2",
    );
    expect(editor.view.contentDOM.querySelector(".md-list-marker")).toBeNull();
  });

  test("TYPE-003 a lone hyphen under a paragraph is a heading while the caret is elsewhere", () => {
    const editor = open("Ti‸tle\n-");
    expect(line_with(editor, "Title").classList).toContain("md-heading-2");
    expect(editor.saved()).toBe("Title\n-");
  });

  test.each([
    "-",
    "*",
    "+",
    "1.",
    "> -",
    "- parent\n  -",
    "Paragraph\n-",
    "> Quote\n> -",
  ])(
    "TYPE-001 a bare marker stays visible source and never becomes a heading: %j",
    (source) => {
      const editor = open(source);
      expect(editor.view.contentDOM.querySelector(".md-heading")).toBeNull();
      const marker = source.split("\n").at(-1)?.trim().replace(/^> /, "") ?? "";
      expect(last_line(editor)?.textContent).toContain(marker);
      expect(last_line(editor)?.textContent).not.toContain("•");

      // The space makes it a list item. The bullet appears at once, so the
      // first body character does not change anything on screen.
      editor.type(" ");
      expect(editor.view.contentDOM.querySelector(".md-heading")).toBeNull();
      expect(
        last_line(editor)?.querySelector(".md-list-marker"),
      ).not.toBeNull();
      expect(editor.source()).toBe(`${source} ‸`);

      editor.type("item");
      expect(last_line(editor)?.classList).not.toContain(
        "md-list-source-visible",
      );
      expect(last_line(editor)?.textContent).toContain("item");
      expect(editor.saved()).toBe(`${source} item`);
    },
  );

  test("TYPE-003 a hyphen and space under a paragraph draws as a bullet, not a heading", () => {
    const editor = open("This is a new note\n-    ‸");
    expect(editor.view.contentDOM.querySelector(".md-heading")).toBeNull();
    expect(texts_of(editor, ".md-list-marker")).toEqual(["•"]);
    editor.view.dispatch({
      selection: { anchor: "This is a new note\n-".length },
    });
    expect(last_line(editor)?.classList).toContain("md-list-source-visible");
    editor.view.dispatch({
      selection: { anchor: editor.view.state.doc.length },
    });
    editor.type("item");
    expect(editor.view.contentDOM.querySelector(".md-heading")).toBeNull();
    expect(editor.saved()).toBe("This is a new note\n-    item");
  });

  test("SPACE-008 a horizontal rule renders as a divider and shows its stars under the caret", () => {
    const editor = open("‸text\n\n***\n\nafter");
    expect(
      editor.view.contentDOM.querySelector(".md-horizontal-rule"),
    ).not.toBeNull();
    expect(shown_text(editor)).not.toContain("***");
    move_caret_to(editor, position_of(editor, "***", 1));
    expect(
      editor.view.contentDOM.querySelector(".md-horizontal-rule"),
    ).toBeNull();
    expect(shown_text(editor)).toContain("***");
  });

  test("SRC-011 a leading rule is a divider but real frontmatter stays literal source", () => {
    const rule = open("---\n\n# Heading\n\nbody‸");
    expect(rule.view.contentDOM.querySelector(".md-frontmatter")).toBeNull();
    expect(line_with(rule, "Heading").classList).toContain("md-heading-1");

    const metadata = open("---\ntitle: x\n---\n\n# Body‸");
    expect(line_with(metadata, "title: x").classList).toContain(
      "md-frontmatter",
    );
    expect(line_with(metadata, "Body").classList).toContain("md-heading-1");
    expect(line_with(metadata, "Body").classList).not.toContain(
      "md-frontmatter",
    );
  });

  test("SPACE-002 blank rows inside quotes and lists keep their blank-line styling", () => {
    for (const source of [
      "> Before\n>\n> After",
      "> - Before\n>\n> - After",
      "- Before\n  \n  After",
    ]) {
      const editor = open(`‸${source}`);
      const blank = [
        ...editor.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
      ][1];
      expect(blank?.classList).toContain("md-blank-line");
      expect(editor.saved()).toBe(source);
    }
  });

  test("SPACE-002 prose right after a quote gets the paragraph gap even without a blank line", () => {
    // Backspace lifting the last quoted line leaves this shape.
    const editor = open("‸> quoted\n>\nlifted");
    const wrappers = wrappers_of(line_with(editor, "lifted"));
    expect(
      wrappers.map((wrapper) => wrapper.classList.contains("md-gap")),
    ).toEqual([true]);
    expect(wrappers[0]?.getAttribute("style")).toContain("--md-gap-after");
  });

  test("QUOTE-008 each nested quote level is its own wrapper around one continuous quote", () => {
    const editor = open("‸> outer\n> > inner\n> back");
    const quotes = (text: string) =>
      wrappers_of(line_with(editor, text)).filter((wrapper) =>
        wrapper.classList.contains("md-quote"),
      );
    expect(quotes("outer")).toHaveLength(1);
    expect(quotes("inner")).toHaveLength(2);
    // A lazy line continues the inner paragraph, so it stays at depth 2.
    expect(quotes("back")).toHaveLength(2);
    // One element per quote, so its bar and box do not break between lines.
    expect(quotes("inner")[0]).toBe(quotes("outer")[0]);
    expect(quotes("back")[1]).toBe(quotes("inner")[1]);
  });

  test("SPACE-003 heading spacing sits on a wrapper around the heading, not on the blank rows around it", () => {
    const editor = open(
      "‸# Title\n\nOpening paragraph.\n\n## Section\n\nFollowing paragraph.",
    );
    const lines = [
      ...editor.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ];
    const gap = (line: HTMLElement | undefined) =>
      line ? (wrappers_of(line)[0]?.getAttribute("style") ?? "") : "";
    expect(gap(lines[0])).toContain("--md-gap-before: 0px");
    expect(gap(lines[4])).toContain("--md-gap-before");
    expect(gap(lines[4])).toContain("--md-gap-after");
    for (const line of lines)
      expect(line.getAttribute("style") ?? "").not.toContain("--md-gap");
    for (const blank of [lines[1], lines[3], lines[5]]) {
      expect(blank?.classList).toContain("md-blank-line");
      expect(gap(blank)).toBe("");
    }
  });

  test("SPACE-004 nested headings stay in their list and quote and skip top-level spacing", () => {
    const editor = open(
      "‸- parent\n  - ## Nested heading\n\n> ### Quoted heading\n\n# Top-level heading",
    );
    const nested = line_with(editor, "Nested heading");
    const quoted = line_with(editor, "Quoted heading");
    const top = line_with(editor, "Top-level heading");
    expect(nested.classList).toContain("md-heading-2");
    expect(nested.classList).toContain("md-list-line");
    expect(nested.classList).not.toContain("md-prose-heading");
    expect(quoted.classList).toContain("md-heading-3");
    expect(
      wrappers_of(quoted).some((wrapper) =>
        wrapper.classList.contains("md-quote"),
      ),
    ).toBe(true);
    expect(quoted.classList).not.toContain("md-prose-heading");
    expect(top.classList).toContain("md-heading-1");
    expect(top.classList).toContain("md-prose-heading");
  });

  test("NAV-001 quote and list prefixes show when the caret is inside them, not at the text start", () => {
    const editor = below_caret("> quote\n\n- item");
    expect(line_with(editor, "quote").textContent).toBe("quote");
    move_caret_to(editor, position_of(editor, "> quote", 1));
    expect(line_with(editor, "quote").textContent).toBe("> quote");
    expect(
      editor.view.contentDOM.querySelector(".md-source-prefix"),
    ).not.toBeNull();
    move_caret_to(editor, position_of(editor, "quote"));
    expect(line_with(editor, "quote").textContent).toBe("quote");

    move_caret_to(editor, position_of(editor, "- item", 1));
    expect(line_with(editor, "item").textContent).toBe("- item");
    move_caret_to(editor, position_of(editor, "item"));
    expect(texts_of(editor, ".md-list-marker")).toEqual(["•"]);
  });

  test("NAV-001 a selection across prefixes keeps quote and list markers rendered", () => {
    const source = "> quote\n> \n> - first\n> - second\n> \n> paragraph";
    const editor = open(source);
    select(editor, 0, editor.view.state.doc.length);
    expect(
      editor.view.contentDOM.querySelector(".md-source-prefix"),
    ).toBeNull();
    expect(shown_text(editor)).not.toContain(">");
    expect(texts_of(editor, ".md-list-marker")[0]).toBe("•");
    expect(editor.saved()).toBe(source);
  });

  test("TYPE-002 an empty bullet shows its bullet before the first body character", () => {
    const editor = open("> - previous\n> - ‸");
    expect(
      last_line(editor)?.querySelector(".md-list-marker")?.textContent,
    ).toBe("•");
    editor.type("dada");
    expect(
      last_line(editor)?.querySelector(".md-list-marker")?.textContent,
    ).toBe("•");
    expect(editor.saved()).toBe("> - previous\n> - dada");
  });
});

describe("tasks", () => {
  test("TASK-001 clicking a checkbox changes only the bracket character and Undo restores it", () => {
    const source = "-   [ ]   a [l](n.md)\n- [x] b";
    const editor = below_caret(source);
    const boxes = () => [
      ...editor.view.contentDOM.querySelectorAll<HTMLInputElement>(
        ".md-task-checkbox",
      ),
    ];
    expect(boxes().map((box) => box.checked)).toEqual([false, true]);

    boxes()[0]?.click();
    expect(editor.saved()).toBe(`top\n\n${source.replace("[ ]", "[x]")}`);
    boxes()[1]?.click();
    expect(editor.saved()).toBe(
      `top\n\n${source.replace("[ ]", "[x]").replace("[x] b", "[ ] b")}`,
    );

    editor.press("Mod-z", "Mod-z");
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });

  test("TASK-002 completed styling covers the task text only, not the next block or the box", () => {
    const editor = below_caret("- [x] finished [l](n.md)\n\nafter");
    expect(texts_of(editor, ".md-task-completed").join("")).toContain(
      "finished",
    );
    expect(texts_of(editor, ".md-task-completed").join("")).not.toContain(
      "after",
    );
    expect(texts_of(editor, ".md-task-completed").join("")).not.toContain(
      "[x]",
    );
    expect(
      line_with(editor, "after").querySelector(".md-task-completed"),
    ).toBeNull();
  });

  test("TASK-004 an empty task keeps its checkbox and no bullet", () => {
    const editor = open("- [ ] ‸");
    expect(
      editor.view.contentDOM.querySelector(".md-task-checkbox"),
    ).not.toBeNull();
    expect(
      editor.view.contentDOM.querySelector(".md-source-prefix"),
    ).toBeNull();
    expect(shown_text(editor)).not.toContain("-");
    editor.type("first");
    expect(
      editor.view.contentDOM.querySelector(".md-task-checkbox"),
    ).not.toBeNull();
    expect(editor.saved()).toBe("- [ ] first");
  });

  test("TASK-005 a read-only editor disables the checkbox and ignores clicks", () => {
    const editor = below_caret("- [ ] task", { read_only: true });
    const box =
      editor.view.contentDOM.querySelector<HTMLInputElement>(
        ".md-task-checkbox",
      );
    expect(box?.disabled).toBe(true);
    box?.click();
    expect(editor.saved()).toBe("top\n\n- [ ] task");
  });

  test("TASK-005 task-like text in frontmatter stays literal", () => {
    const editor = open("---\n- [ ] not a task\n---\n\nbody‸");
    expect(
      editor.view.contentDOM.querySelector(".md-task-checkbox"),
    ).toBeNull();
  });

  test("TYPE-004 an unfinished task marker keeps the bullet as source until its closing space", () => {
    for (const [typed, completed] of [
      ["[ ]", false],
      ["[x]", true],
    ] as const) {
      const editor = open("- ‸");
      editor.type(typed.slice(0, -1));
      expect(
        editor.view.contentDOM.querySelector(".md-task-checkbox"),
      ).toBeNull();
      editor.type(typed.slice(-1));
      expect(
        editor.view.contentDOM.querySelector(".md-task-checkbox"),
      ).toBeNull();
      // The bullet stays drawn and the brackets sit in the body column.
      expect(line_with(editor, typed).textContent).toBe(`•${typed}`);

      editor.type(" ");
      const box =
        editor.view.contentDOM.querySelector<HTMLInputElement>(
          ".md-task-checkbox",
        );
      expect(box?.checked).toBe(completed);

      editor.type("body");
      expect(
        editor.view.contentDOM.querySelector(".md-task-checkbox"),
      ).not.toBeNull();
      expect(line_with(editor, "body").textContent).not.toContain("-");
      expect(editor.saved()).toBe(`- ${typed} body`);
    }
  });
});

describe("links", () => {
  test("LINK-001 every supported link form renders its label and resolves its target", () => {
    const source =
      "[Inline](../note.md#Heading) and [Reference][docs]\n\n<https://example.com/path> [[folder/note#Part|Alias]]\n\n" +
      "https://bare.example/x\n\n[Name][] [Name]\n\n[docs]: https://example.org/docs\n[Name]: first.md\n[Name]: second.md\n";
    const editor = below_caret(source);
    expect(rendered_links(editor)).toEqual([
      ["Inline", "../note.md#Heading"],
      ["Reference", "https://example.org/docs"],
      ["https://example.com/path", "https://example.com/path"],
      ["Alias", "folder/note.md#Part"],
      ["https://bare.example/x", "https://bare.example/x"],
      ["Name", "first.md"],
      ["Name", "first.md"],
    ]);
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });

  test("LINK-001 escapes and entities in a label or destination decode for display and navigation", () => {
    const editor = below_caret("[a_b ~ c &amp; d](path\\(1\\).md)");
    expect(rendered_links(editor)).toEqual([["a_b ~ c & d", "path(1).md"]]);
  });

  test("LINK-001 link-like text in inline code and frontmatter is not clickable", () => {
    const editor = open(
      "---\nurl: https://frontmatter.test\n---\n\n`[code](code.md)`\n\n[real](real.md)\n\ntail‸",
    );
    expect(rendered_links(editor)).toEqual([["real", "real.md"]]);
  });

  test("LINK-002 only the link holding the caret reveals its source", () => {
    const source = "plain [[Wiki note]] and [Label](note.md) end";
    const editor = open(`‸${source}`);
    expect(rendered_links(editor).map(([label]) => label)).toEqual([
      "Wiki note",
      "Label",
    ]);

    move_caret_to(editor, position_of(editor, "Wiki", 1));
    expect(rendered_links(editor).map(([label]) => label)).toEqual(["Label"]);
    expect(shown_text(editor)).toContain("[[Wiki note]]");

    move_caret_to(editor, position_of(editor, "Label", 1));
    expect(rendered_links(editor).map(([label]) => label)).toEqual([
      "Wiki note",
    ]);

    move_caret_to(editor, 0);
    expect(rendered_links(editor).map(([label]) => label)).toEqual([
      "Wiki note",
      "Label",
    ]);
    expect(editor.saved()).toBe(source);
  });

  test("LINK-002 a caret touching either end reveals, one character away does not, selections never do", () => {
    const editor = open("‸before [Label](note.md) after");
    const start = position_of(editor, "[Label]");
    const end = start + "[Label](note.md)".length;
    for (const caret of [start, end]) {
      move_caret_to(editor, caret);
      expect(rendered_links(editor)).toEqual([]);
    }
    for (const caret of [start - 1, end + 1]) {
      move_caret_to(editor, caret);
      expect(rendered_links(editor)).toHaveLength(1);
    }
    select(editor, 0, editor.view.state.doc.length);
    expect(rendered_links(editor)).toHaveLength(1);
  });

  test.each(["[[Wiki]]", "[Label](note.md)"])(
    "LINK-002 plain arrows step into a rendered link by one character: %s",
    (link) => {
      const editor = open(`before‸ ${link} after`);
      const start = position_of(editor, link);
      expect(rendered_links(editor)).toHaveLength(1);

      editor.press("ArrowRight");
      expect(editor.view.state.selection.main.head).toBe(start);
      editor.press("ArrowRight");
      expect(editor.view.state.selection.main.head).toBe(start + 1);
      expect(rendered_links(editor)).toEqual([]);
      expect(editor.saved()).toBe(`before ${link} after`);
    },
  );

  test("LINK-003 a plain click or Enter opens the target, a modified click does not", () => {
    const open_link = vi.fn();
    const editor = below_caret("[Label](https://example.com)", { open_link });
    const link = editor.view.contentDOM.querySelector<HTMLElement>(
      "[data-md-link-target]",
    );
    if (!link) throw new Error("Expected a rendered link");

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenLastCalledWith("https://example.com");
    link.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    expect(open_link).toHaveBeenCalledTimes(2);

    const modified = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      ctrlKey: true,
      cancelable: true,
    });
    link.dispatchEvent(modified);
    expect(open_link).toHaveBeenCalledTimes(2);
    expect(modified.defaultPrevented).toBe(false);
  });

  test("LINK-003 a read-only editor still navigates and exposes link semantics", () => {
    const open_link = vi.fn();
    const editor = below_caret("[Label](note.md)", {
      open_link,
      read_only: true,
    });
    const link = editor.view.contentDOM.querySelector<HTMLElement>(
      "[data-md-link-target]",
    );
    expect(link?.getAttribute("role")).toBe("link");
    expect(link?.getAttribute("aria-label")).toBe("Open Label");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("note.md");
    expect(editor.saved()).toBe("top\n\n[Label](note.md)");
  });

  test("LINK-008 a wiki link shows its alias and navigates to its target", () => {
    const open_link = vi.fn();
    const editor = below_caret(
      "[[folder/note#Part|Alias]] and [[Plain Note]]",
      { open_link },
    );
    expect(rendered_links(editor)).toEqual([
      ["Alias", "folder/note.md#Part"],
      ["Plain Note", "Plain Note.md"],
    ]);
    editor.view.contentDOM
      .querySelector<HTMLElement>("[data-md-link-target]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("folder/note.md#Part");
  });
});

describe("images", () => {
  const rendered_images = (editor: TestEditor) => [
    ...editor.view.contentDOM.querySelectorAll<HTMLImageElement>(
      ".md-image img",
    ),
  ];

  test("IMAGE-001 inline and reference images resolve through the host without touching source", async () => {
    const source =
      "![Alt &amp; text](./image.png)\n\n![Reference][picture]\n\n[picture]: assets/photo.png\n";
    const resolve_image = vi.fn(
      (image: string) => `https://example.invalid/${image}`,
    );
    const editor = below_caret(source, { resolve_image });
    await vi.waitFor(() => {
      expect(rendered_images(editor)).toHaveLength(2);
    });
    expect(rendered_images(editor).map((image) => image.alt)).toEqual([
      "Alt & text",
      "Reference",
    ]);
    expect(
      rendered_images(editor).map((image) => image.getAttribute("src")),
    ).toEqual([
      "https://example.invalid/./image.png",
      "https://example.invalid/assets/photo.png",
    ]);
    expect(
      editor.view.contentDOM.querySelector(".md-link-rendered"),
    ).toBeNull();
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });

  test("IMAGE-001 a base64 data URL is shown as written", async () => {
    const data_url =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=";
    const editor = below_caret(`![pixel](${data_url})`, {
      resolve_image: (image) => image,
    });
    await vi.waitFor(() => {
      expect(rendered_images(editor)).toHaveLength(1);
    });
    expect(rendered_images(editor)[0]?.getAttribute("src")).toBe(data_url);
  });

  test("IMAGE-002 the caret touching an image shows its source, and leaving restores the picture only", async () => {
    const source = "![Alt](image.png)";
    const editor = below_caret(source);
    await vi.waitFor(() => {
      expect(rendered_images(editor)).toHaveLength(1);
    });
    expect(shown_text(editor)).not.toContain("![Alt]");

    move_caret_to(editor, position_of(editor, "Alt", 1));
    expect(shown_text(editor)).toContain(source);

    move_caret_to(editor, 0);
    expect(shown_text(editor)).not.toContain("![Alt]");
    expect(rendered_images(editor)).toHaveLength(1);
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });

  test("IMAGE-002 an image inside a task keeps the checkbox while only the image reveals", async () => {
    const editor = below_caret("- [ ] ![Alt](image.png)");
    await vi.waitFor(() => {
      expect(rendered_images(editor)).toHaveLength(1);
    });
    expect(
      editor.view.contentDOM.querySelector(".md-task-checkbox"),
    ).not.toBeNull();
    move_caret_to(editor, position_of(editor, "Alt", 1));
    expect(shown_text(editor)).toContain("![Alt](image.png)");
    expect(
      editor.view.contentDOM.querySelector(".md-task-checkbox"),
    ).not.toBeNull();
  });

  test("IMAGE-002 image syntax in frontmatter and inline code is not rendered or resolved", async () => {
    const resolve_image = vi.fn(() => "image.png");
    const editor = open(
      '---\nimage: "![a](a.png)"\n---\n\n`![b](b.png)`\n\ntext‸',
      { resolve_image },
    );
    await Promise.resolve();
    expect(resolve_image).not.toHaveBeenCalled();
    expect(editor.view.contentDOM.querySelector(".md-image")).toBeNull();
  });

  test("IMAGE-003 a pending image shows a loading label and a failed one a stable error", async () => {
    const pending = below_caret("![Slow](slow.png)", {
      resolve_image: () => new Promise<string>(() => undefined),
    });
    await vi.waitFor(() => {
      expect(shown_text(pending)).toContain("Loading image: Slow");
    });

    const source = "![Missing](missing.png)";
    const failed = below_caret(source, {
      resolve_image: () => Promise.reject(new Error("missing")),
    });
    await vi.waitFor(() => {
      expect(shown_text(failed)).toContain("Image unavailable: Missing");
    });
    expect(failed.saved()).toBe(`top\n\n${source}`);
  });

  test("IMAGE-003 destroying the editor aborts an image request still in flight", async () => {
    let signal: AbortSignal | undefined;
    const editor = below_caret("![Alt](image.png)", {
      resolve_image: (_source, pending) => {
        signal = pending;
        return new Promise<string>(() => undefined);
      },
    });
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    editor.destroy();
    expect(signal?.aborted).toBe(true);
  });

  test("LINK-009 a linked image opens the outer target and its resize handle does not", async () => {
    const source = "[![Alt](image.png)](target.md)";
    const open_link = vi.fn();
    const resolve_image = vi.fn((image: string) => `resolved:${image}`);
    const editor = below_caret(source, { open_link, resolve_image });
    await vi.waitFor(() => {
      expect(rendered_images(editor)[0]?.getAttribute("src")).toBe(
        "resolved:image.png",
      );
    });
    const link = editor.view.contentDOM.querySelector<HTMLElement>(
      "[data-md-link-target]",
    );
    expect(link?.dataset.mdLinkTarget).toBe("target.md");
    expect(link?.getAttribute("aria-label")).toBe("Open Alt");
    expect(resolve_image).toHaveBeenCalledWith(
      "image.png",
      expect.any(AbortSignal),
    );

    link
      ?.querySelector(".md-image-resize")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).not.toHaveBeenCalled();
    link
      ?.querySelector("img")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("target.md");
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });
});

describe("failure isolation", () => {
  test("a construct that throws in decorate does not remove other rendering", () => {
    const error_log = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const broken_plugin: MarkdownPlugin = {
      name: "broken",
      constructs: [
        {
          kind: "inline",
          name: "broken_emphasis",
          nodes: ["Emphasis"],
          decorate() {
            throw new Error("decorate failed");
          },
        },
      ],
    };
    const editor = test_editor("top‸\n\n**bold** and _soft_ and `code`", [
      commonmark(),
      broken_plugin,
    ]);
    expect(texts_of(editor, ".md-strong")).toEqual(["bold"]);
    expect(texts_of(editor, ".md-inline-code")).toEqual(["code"]);
    // The commonmark construct owns the same node and still runs.
    expect(texts_of(editor, ".md-emphasis")).toEqual(["soft"]);
    expect(error_log).toHaveBeenCalled();

    move_caret_to(editor, position_of(editor, "bold", 1));
    expect(texts_of(editor, ".md-strong")).toEqual(["**bold**"]);
  });
});

describe("callouts", () => {
  const source = "> [!warning] Title\n> body";

  test("a callout is its quote's wrapper with callout classes, and a label replaces the marker", () => {
    const editor = below_caret(source);
    const quote = (text: string) =>
      line_with(editor, text).closest(".md-quote");
    expect(quote("Title")?.classList).toContain("md-callout");
    expect(quote("Title")?.classList).toContain("md-callout-warning");
    // The callout classes merge into the quote's own element.
    expect(quote("body")).toBe(quote("Title"));
    expect(editor.view.contentDOM.querySelectorAll(".md-quote")).toHaveLength(
      1,
    );
    expect(line_with(editor, "Title").classList).toContain("md-callout-title");
    expect(line_with(editor, "body").classList).not.toContain(
      "md-callout-title",
    );
    expect(texts_of(editor, ".md-callout-label")).toEqual(["warning: "]);
    expect(shown_text(editor)).not.toContain("[!warning]");
    expect(editor.saved()).toBe(`top\n\n${source}`);
  });

  test("a callout without a title shows the type as its title", () => {
    const editor = below_caret("> [!tip]\n> body");
    expect(texts_of(editor, ".md-callout-label")).toEqual(["tip"]);
    expect(line_with(editor, "body").closest(".md-quote")?.classList).toContain(
      "md-callout-tip",
    );
  });

  test("the caret on the marker shows the source in place of the label", () => {
    const editor = below_caret(source);
    move_caret_to(editor, position_of(editor, "[!warning]", 3));
    expect(texts_of(editor, ".md-callout-label")).toEqual([]);
    expect(shown_text(editor)).toContain("[!warning]");
    move_caret_to(editor, 0);
    expect(texts_of(editor, ".md-callout-label")).toEqual(["warning: "]);
  });

  test("an ordinary quote is not a callout", () => {
    const editor = below_caret("> [not a callout] text\n> more");
    expect(editor.view.contentDOM.querySelector(".md-callout")).toBeNull();
  });

  test("Enter inside a callout continues the quote like any quote", () => {
    const editor = open(`${source}‸`);
    editor.press("Enter").type("more");
    expect(editor.source()).toBe(`${source}\n> more‸`);
    expect(line_with(editor, "more").closest(".md-quote")?.classList).toContain(
      "md-callout",
    );
  });

  test("Enter on an empty callout line leaves one quote level", () => {
    const editor = open(`${source}\n> ‸`);
    editor.press("Enter");
    expect(editor.source()).toBe(`${source}\n\n‸`);
  });

  test("Backspace at the text start of a callout line lifts it out of the quote", () => {
    const editor = open("> [!note] Title\n> ‸body");
    editor.press("Backspace");
    expect(editor.source()).toBe("> [!note] Title\n\n‸body");
  });
});

describe("character-by-character construction found in native review", () => {
  test("TYPE-001 typing # and then a space keeps the heading marker visible", () => {
    const editor = open("‸");
    editor.type("#");
    expect(last_line(editor)?.textContent).toBe("#");
    editor.type(" ");
    expect(last_line(editor)?.textContent).toContain("#");
    editor.type("Title");
    expect(last_line(editor)?.textContent).toBe("Title");
  });

  test("TYPE-004 task brackets keep the bullet until the caret moves past them", () => {
    const editor = open("- ‸");
    editor.type("[ ]");
    expect(
      last_line(editor)?.querySelector(".md-list-marker")?.textContent,
    ).toBe("•");
    expect(last_line(editor)?.querySelector(".md-task-checkbox")).toBeNull();
    expect(last_line(editor)?.textContent).toContain("[ ]");
    editor.type(" ");
    expect(
      last_line(editor)?.querySelector(".md-task-checkbox"),
    ).not.toBeNull();
    expect(last_line(editor)?.querySelector(".md-list-marker")).toBeNull();
  });
});

describe("line boxes", () => {
  // CodeMirror estimates the height of every line it has not drawn from the
  // first short plain-text line it has drawn: at most 20 characters, only
  // text inside. If that line's box differs from the default, the estimate
  // changes with the viewport, the viewport never settles, and clicks land on
  // a half-drawn view. So a line CodeMirror can sample must carry no style
  // that changes its height. Vertical space belongs on wrappers.
  const vertical_property =
    /^(padding|paddingTop|paddingBottom|margin|marginTop|marginBottom|lineHeight|minHeight|height|fontSize)$/;

  // Every class that some theme rule gives a vertical property.
  function vertical_classes(): Set<string> {
    const found = new Set<string>();
    const specs = [
      editor_theme_spec,
      ...[commonmark(), gfm(), callouts(), frontmatter()].map(
        (plugin) => plugin.theme ?? {},
      ),
    ];
    for (const spec of specs)
      for (const [selector, style] of Object.entries(spec)) {
        const properties = Object.keys(style as object);
        if (!properties.some((name) => vertical_property.test(name))) continue;
        const targeted = selector.replace(/:not\([^)]*\)/g, "");
        for (const name of targeted.match(/\.md-[\w-]+/g) ?? [])
          found.add(name.slice(1));
      }
    return found;
  }

  // The same test CodeMirror's measureTextSize applies to a line.
  function sampleable(line: HTMLElement): boolean {
    const nodes = [...line.childNodes];
    const text = line.textContent ?? "";
    return (
      nodes.length > 0 &&
      nodes.every((node) => node.nodeType === Node.TEXT_NODE) &&
      text.length <= 20 &&
      /^[ -~]*$/.test(text)
    );
  }

  test("SPACE-009 a line CodeMirror can sample for line metrics keeps the default box", () => {
    const source = [
      "Short line.",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "After table.",
      "",
      "> quoted",
      "> > deep",
      "lazy",
      "",
      "- item",
      "  more",
      "lazy item",
      "",
      "- a",
      "  ",
      "- b",
      "",
      "Setext",
      "---",
      "",
      "   ",
      "> [!note] Callout",
      "> body",
      "",
      "# Heading",
      "Tail.",
      "",
      "## ",
    ].join("\n");
    const classes = vertical_classes();
    const editor = open(`${source}‸`);
    const { doc } = editor.view.state;
    let checked = 0;
    for (let number = 1; number <= doc.lines; number++) {
      move_caret_to(editor, doc.line(number).from);
      for (const line of editor.view.contentDOM.querySelectorAll<HTMLElement>(
        ".cm-line",
      )) {
        if (!sampleable(line)) continue;
        checked++;
        const context = `"${line.textContent ?? ""}" with the caret on line ${String(number)}`;
        expect(
          [...line.classList].filter((name) => classes.has(name)),
          context,
        ).toEqual([]);
        expect(line.getAttribute("style") ?? "", context).not.toMatch(
          /padding|line-height|height|margin/,
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(editor.saved()).toBe(source);
  });
});

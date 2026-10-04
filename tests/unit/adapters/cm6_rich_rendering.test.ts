/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceParsing, syntaxTree } from "@codemirror/language";
import { link_rendering } from "../../../packages/markdown_editor/src/link_rendering";
import {
  markdown_language,
  rich_markdown_rendering,
} from "../../../packages/markdown_editor/src/index";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_markdown(source: string) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      extensions: [markdown_language(), rich_markdown_rendering()],
    }),
  });
  views.push(view);
  forceParsing(view, view.state.doc.length, 100);
  return view;
}

describe("CM6 rich rendering", () => {
  it.each([
    "-",
    "*",
    "+",
    "1.",
    "> -",
    "- parent\n  -",
    "Paragraph\n-",
    "> Quote\n> -",
  ])(
    "keeps a bare list marker in prose until whitespace is typed: %s",
    (source) => {
      const view = open_markdown(source);
      view.dispatch({ selection: { anchor: source.length } });
      const last_line = () =>
        [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")].at(-1);
      expect(last_line()?.classList).not.toContain("md-list-line");
      expect(view.contentDOM.querySelector(".md-heading")).toBeNull();
      expect(last_line()?.textContent).toContain(
        source.split("\n").at(-1)?.trim().replace(/^> /, "") ?? "",
      );
      view.dispatch({
        changes: { from: source.length, insert: " " },
        selection: { anchor: source.length + 1 },
      });
      forceParsing(view, view.state.doc.length, 100);
      expect(last_line()?.classList).toContain("md-list-line");
      expect(view.state.doc.toString()).toBe(source + " ");
    },
  );

  it("reveals only the inline element containing the caret", () => {
    const source = "plain **bold** then _italic_ and `code` plus ~~gone~~";
    const view = open_markdown(source);
    const rendered = () =>
      [".md-strong", ".md-emphasis", ".md-inline-code", ".md-strike"].map(
        (selector) => view.contentDOM.querySelector(selector)?.textContent,
      );
    expect(rendered()).toEqual(["bold", "italic", "code", "gone"]);
    view.dispatch({ selection: { anchor: source.indexOf("bold") + 1 } });
    expect(rendered()).toEqual(["**bold**", "italic", "code", "gone"]);
    view.dispatch({ selection: { anchor: source.indexOf("code") + 1 } });
    expect(rendered()).toEqual(["bold", "italic", "`code`", "gone"]);
    for (const anchor of [source.indexOf("**"), source.indexOf("**") + 8]) {
      view.dispatch({ selection: { anchor } });
      expect(rendered()).toEqual(["bold", "italic", "code", "gone"]);
    }
    view.dispatch({ selection: { anchor: 0, head: source.length } });
    expect(rendered()).toEqual(["bold", "italic", "code", "gone"]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("reveals nested marks only along the caret's containing elements", () => {
    const source = "**outer _inner_ end** and **other**";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.indexOf("outer") + 2 } });
    expect(view.contentDOM.querySelector(".md-emphasis")?.textContent).toBe(
      "inner",
    );
    expect(
      [...view.contentDOM.querySelectorAll(".md-strong")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["**outer inner end**", "other"]);
    view.dispatch({ selection: { anchor: source.indexOf("inner") + 2 } });
    expect(view.contentDOM.querySelector(".md-emphasis")?.textContent).toBe(
      "_inner_",
    );
    expect(
      [...view.contentDOM.querySelectorAll(".md-strong")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["**outer _inner_ end**", "other"]);
  });
  it("keeps an empty task rendered at the typing position", () => {
    const source = "- [ ] ";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });
    expect(view.contentDOM.querySelector(".md-task-checkbox")).not.toBeNull();
    expect(view.contentDOM.querySelector(".md-source-prefix")).toBeNull();
    expect(view.contentDOM.textContent).not.toContain("-");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps selected quote and list prefixes rendered", () => {
    const source = "> quote\n> \n> - first\n> - second\n> \n> paragraph";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: 0, head: source.length } });
    expect(view.contentDOM.querySelector(".md-source-prefix")).toBeNull();
    expect(view.contentDOM.textContent).not.toContain(">");
    expect(view.contentDOM.querySelector(".md-list-marker")?.textContent).toBe(
      "•",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("uses native paint only for a single nonempty selection", () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "> first\n> second",
        extensions: [
          markdown_language(),
          rich_markdown_rendering(),
          EditorState.allowMultipleSelections.of(true),
        ],
      }),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: 2, head: 7 } });
    expect(view.dom.classList).toContain("md-native-selection");
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(2, 7),
        EditorSelection.range(10, 16),
      ]),
    });
    expect(view.dom.classList).not.toContain("md-native-selection");
    view.dispatch({ selection: { anchor: 7 } });
    expect(view.dom.classList).not.toContain("md-native-selection");
  });
  it("keeps heading margins independent of blank source rows", () => {
    const source =
      "# Title\n\nOpening paragraph.\n\n## Section\n\nFollowing paragraph.\n### Direct heading\nDirect paragraph.";
    const view = open_markdown(source);
    const lines = [
      ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ];
    expect(lines[0]?.style.getPropertyValue("--md-prose-gap")).toBe(
      "max(0px, 0px)",
    );
    expect(lines[1]?.classList).toContain("md-blank-line");
    expect(lines[2]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "* 1)",
    );
    expect(lines[3]?.classList).toContain("md-blank-line");
    expect(lines[4]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "* 1.75)",
    );
    expect(lines[4]?.classList).toContain("md-prose-heading");
    expect(lines[4]?.classList).toContain("md-prose-block-start");
    expect(lines[5]?.classList).toContain("md-blank-line");
    expect(lines[6]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "* 0.85)",
    );
    expect(lines[7]?.classList).toContain("md-prose-block-start");
    expect(lines[7]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "* 1.5)",
    );
    expect(lines[8]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "* 0.5)",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps paragraph spacing configurable without styling code as prose", () => {
    const source =
      "First paragraph.\n\nSecond paragraph.\n\n```md\n# Code heading\n\ncode paragraph\n```";
    const view = open_markdown(source);
    const lines = [
      ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ];
    expect(lines[1]?.classList).toContain("md-blank-line");
    expect(lines[2]?.style.getPropertyValue("--md-prose-gap")).toContain(
      "--editor-paragraph-spacing",
    );
    expect(lines[5]?.classList).not.toContain("md-prose-heading");
    expect(lines[6]?.classList).not.toContain("md-prose-separator");
  });

  it.each([
    "> Before\n>\n> After",
    "> - Before\n>\n> - After",
    "- Before\n  \n  After",
  ])(
    "marks blank container rows regardless of hidden prefix DOM: %s",
    (source) => {
      const view = open_markdown(source);
      const lines = [
        ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
      ];
      expect(lines[1]?.classList).toContain("md-blank-line");
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it("keeps nested headings inside their list and quote blocks", () => {
    const source =
      "- parent\n  - ## Nested heading\n\n> ### Quoted heading\n\n# Top-level heading";
    const view = open_markdown(source);
    const line_with = (text: string) =>
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")].find(
        (line) => line.textContent?.includes(text),
      );
    const nested_heading = line_with("Nested heading");
    const quoted_heading = line_with("Quoted heading");
    const top_level_heading = line_with("Top-level heading");

    expect(nested_heading?.classList).toContain("md-heading-2");
    expect(nested_heading?.classList).toContain("md-list-line");
    expect(nested_heading?.getAttribute("style")).toContain(
      "--md-list-depth: 2",
    );
    expect(nested_heading?.classList).not.toContain("md-prose-heading");
    expect(nested_heading?.classList).not.toContain("md-prose-block-start");
    expect(quoted_heading?.classList).toContain("md-heading-3");
    expect(quoted_heading?.classList).toContain("md-quote-line");
    expect(quoted_heading?.classList).not.toContain("md-prose-heading");
    expect(top_level_heading?.classList).toContain("md-heading-1");
    expect(top_level_heading?.classList).toContain("md-prose-heading");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("hides the Setext underline height until its source line is edited", () => {
    const source = "Title\n=====\n\nParagraph.";
    const view = open_markdown(source);
    expect(
      view.contentDOM.querySelectorAll(".md-setext-underline"),
    ).toHaveLength(1);
    view.dispatch({ selection: { anchor: source.indexOf("===") } });
    expect(view.contentDOM.querySelector(".md-setext-underline")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps a blank line between loose nested items in their text column", () => {
    const source = "- parent\n  - `inline code`\n\n  - next item";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1 } });
    const blank = view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")[2];
    expect(blank?.classList).toContain("md-list-depth-2");
    expect(blank?.style.getPropertyValue("--md-list-depth")).toBe("2");
    expect(blank?.classList).not.toContain("md-source-prefix-visible");
  });

  it("renders bullets and dividers while keeping their original source editable", () => {
    const source = "cursor\n\n* item\n+ other\n- [ ] task\n\n***\n";
    const view = open_markdown(source);
    expect(
      [...view.dom.querySelectorAll(".md-list-marker")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["•", "•"]);
    expect(view.dom.querySelectorAll(".md-task-checkbox")).toHaveLength(1);
    expect(view.dom.querySelector(".md-horizontal-rule")).not.toBeNull();
    expect(view.state.doc.toString()).toBe(source);
    view.dispatch({ selection: { anchor: source.indexOf("***") } });
    expect(view.dom.querySelector(".md-horizontal-rule")).toBeNull();
    expect(view.contentDOM.textContent).toContain("***");
  });
  it("updates task controls when read-only mode changes", () => {
    const read_only = new Compartment();
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "- [ ] task",
        extensions: [
          markdown_language(),
          rich_markdown_rendering(),
          read_only.of(EditorState.readOnly.of(false)),
        ],
      }),
    });
    views.push(view);
    view.dispatch({
      effects: read_only.reconfigure(EditorState.readOnly.of(true)),
    });
    expect(view.dom.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      true,
    );
    view.dispatch({
      effects: read_only.reconfigure(EditorState.readOnly.of(false)),
    });
    expect(view.dom.querySelector<HTMLInputElement>("input")?.disabled).toBe(
      false,
    );
  });
  it("keeps a leading horizontal rule distinct from frontmatter", () => {
    const view = open_markdown("---\n# Heading\n\nBody");
    expect(view.dom.querySelector(".md-frontmatter")).toBeNull();
    expect(view.dom.querySelector(".md-heading-1")?.textContent?.trim()).toBe(
      "Heading",
    );
  });

  it("recognizes an inserted frontmatter closing fence and stops at it", () => {
    const view = open_markdown("---\ntitle: x\n\n# Body");
    expect(view.dom.querySelector(".md-frontmatter")).toBeNull();
    view.dispatch({ changes: { from: 13, insert: "---\n" } });
    expect(view.dom.querySelectorAll(".md-frontmatter")).toHaveLength(3);
    expect(view.dom.querySelector(".md-heading-1")?.textContent?.trim()).toBe(
      "Body",
    );
  });

  it("disables task edits in a read-only document", () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "- [ ] task",
        extensions: [
          markdown_language(),
          rich_markdown_rendering(),
          EditorState.readOnly.of(true),
        ],
      }),
    });
    views.push(view);
    const checkbox = view.dom.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox?.disabled).toBe(true);
    checkbox?.click();
    expect(view.state.doc.toString()).toBe("- [ ] task");
  });
  it("keeps frontmatter literal and supports wiki links alongside Setext headings", () => {
    const source =
      '\uFEFF---\ntitle: "Quoted" # comment\n# not a heading\n---\n\nTitle\n=====\n\n[[folder/note|Label]]';
    const view = open_markdown(source);
    expect(view.dom.querySelectorAll(".md-frontmatter")).toHaveLength(4);
    expect(view.dom.querySelectorAll(".md-heading-1")).toHaveLength(1);
    expect(
      syntaxTree(view.state).resolveInner(source.indexOf("folder"), 1).name,
    ).toBe("WikiLink");
    expect(view.state.doc.toString()).toBe(source);
  });
  it("renders headings and inline marks without rewriting source", () => {
    const source =
      "cursor\n\n## Heading\n\nText **bold**, _italic_, ~~deleted~~ and `code`.";
    const view = open_markdown(source);
    expect(view.dom.querySelector(".md-heading-2")?.textContent?.trim()).toBe(
      "Heading",
    );
    expect(view.dom.querySelector(".md-strong")?.textContent).toBe("bold");
    expect(view.dom.querySelector(".md-emphasis")?.textContent).toBe("italic");
    expect(view.dom.querySelector(".md-strike")?.textContent).toBe("deleted");
    expect(view.state.doc.toString()).toBe(source);
    view.dispatch({ selection: { anchor: source.indexOf("bold") } });
    expect(view.dom.querySelector(".md-strong")?.textContent).toBe("**bold**");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps an empty bullet prefix editable until its first body character", () => {
    const source = "This is a new note\n-    ";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });

    expect(view.dom.querySelector(".md-heading")).toBeNull();
    expect(view.dom.querySelector(".md-list-marker")?.textContent).toBe("-");
    expect(view.dom.querySelector(".md-list-line")?.classList).toContain(
      "md-list-source-visible",
    );
    expect(view.state.doc.toString()).toBe(source);

    for (const character of "item") {
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: character },
        selection: { anchor: position + 1 },
        userEvent: "input.type",
      });
    }
    expect(view.dom.querySelector(".md-heading")).toBeNull();
    expect(view.dom.querySelector(".md-list-marker")?.textContent).toBe("•");
    expect(view.dom.textContent).toContain("item");
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector(".md-list-marker")?.textContent).toBe("•");
  });

  it("keeps a quoted empty list prefix editable until the first body character", () => {
    const source = "> - previous\n> ";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });

    for (const character of "- ") {
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: character },
        selection: { anchor: position + 1 },
        userEvent: "input.type",
      });
      const line = view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")[1];
      if (character === "-") {
        expect(line?.querySelector(".md-list-marker")).toBeNull();
        expect(line?.classList).not.toContain("md-list-line");
      } else {
        expect(line?.querySelector(".md-list-marker")?.textContent).toBe("-");
        expect(line?.classList).toContain("md-list-source-visible");
      }
    }

    for (const character of "dada") {
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: character },
        selection: { anchor: position + 1 },
        userEvent: "input.type",
      });
      const line = view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")[1];
      expect(line?.querySelector(".md-list-marker")?.textContent).toBe("•");
      expect(line?.textContent).toContain(
        `•${view.state.doc.line(2).text.slice(4)}`,
      );
    }
    expect(view.state.doc.toString()).toBe(`${source}- dada`);
  });

  it("keeps the list gutter while a task marker is still being typed", () => {
    const view = open_markdown("");
    for (const character of "- [ ]") {
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: character },
        selection: { anchor: position + 1 },
        userEvent: "input.type",
      });
      forceParsing(view, view.state.doc.length, 100);
    }

    expect(view.contentDOM.querySelector(".md-list-marker")?.textContent).toBe(
      "•",
    );
    expect(view.contentDOM.querySelector(".md-task-checkbox")).toBeNull();
    expect(view.contentDOM.textContent).toContain("[ ]");

    const position = view.state.selection.main.head;
    view.dispatch({
      changes: { from: position, insert: " " },
      selection: { anchor: position + 1 },
      userEvent: "input.type",
    });
    forceParsing(view, view.state.doc.length, 100);

    expect(view.contentDOM.querySelector(".md-list-marker")).toBeNull();
    expect(view.contentDOM.querySelector(".md-task-checkbox")).not.toBeNull();
    expect(view.state.doc.toString()).toBe("- [ ] ");
  });

  it("ends list styling before a quote-only paragraph after the final item", () => {
    const source = "> - first\n> - second\n> \n> ";
    const view = open_markdown(source);
    const lines = () => [
      ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ];
    const second_item = lines()[1];
    const blank_quote = lines()[2];
    const empty_quote_paragraph = lines()[3];

    expect(second_item?.classList).toContain("md-list-item-end");
    expect(blank_quote?.classList).not.toContain("md-list-line");
    expect(empty_quote_paragraph?.classList).not.toContain("md-list-line");
    expect(empty_quote_paragraph?.classList).toContain("md-quote-line");

    view.dispatch({
      changes: { from: source.length, insert: "Q" },
      selection: { anchor: source.length + 1 },
      userEvent: "input.type",
    });
    forceParsing(view, view.state.doc.length, 100);

    const typed_quote_paragraph = lines()[3];
    expect(typed_quote_paragraph?.classList).not.toContain("md-list-line");
    expect(typed_quote_paragraph?.classList).toContain("md-quote-line");
    expect(typed_quote_paragraph?.textContent).toContain("Q");
    expect(view.state.doc.toString()).toBe(`${source}Q`);

    const between_items = open_markdown("> - first\n> \n> - second");
    const separator = [
      ...between_items.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ][1];
    expect(separator?.classList).toContain("md-list-separator");
    expect(separator?.classList).toContain("md-list-line");
  });

  it("keeps completed Setext headings and their source intact", () => {
    const source = "A real heading\n----------------";
    const view = open_markdown(source);

    expect(view.dom.querySelector(".md-heading-2")?.textContent).toContain(
      "A real heading",
    );
    expect(view.dom.querySelector(".md-list-marker")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps a lone-hyphen Setext heading intact", () => {
    const source = "Title\n-";
    const view = open_markdown(source);
    expect(view.dom.querySelector(".md-heading-2")?.textContent).toContain(
      "Title",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("hides ATX spacing and closing markers without changing source", () => {
    const source = "before\n   ### indented heading ##";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: 0 } });
    const heading_line = [
      ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ][1];
    expect(heading_line?.textContent).toBe("indented heading");
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({ selection: { anchor: source.indexOf("heading") } });
    expect(view.contentDOM.textContent).toContain("   ### indented heading ##");
  });

  it("renders legacy HTML breaks outside code and reveals their source on the active line", () => {
    const source =
      '---\ntitle: "<br />"\n---\n\nbefore<br />after\n\n<br />\n\n~~~html\n<br />\n~~~\n\n<br\n/>';
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });

    expect(view.dom.querySelectorAll("br.md-html-break")).toHaveLength(1);
    expect(view.dom.querySelectorAll(".md-legacy-blank-line")).toHaveLength(1);
    expect(view.dom.querySelectorAll("span.md-html-break")).toHaveLength(1);
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({
      selection: { anchor: source.indexOf("before<br") + "before".length + 2 },
    });
    expect(view.dom.querySelectorAll("br.md-html-break")).toHaveLength(0);
    expect(view.contentDOM.textContent).toContain("<br />");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps a standalone legacy break's blank-row semantics while revealing its source", () => {
    const source = "Before\n\n<br />\n\nAfter";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });
    const blank = () => view.contentDOM.querySelector(".md-legacy-blank-line");
    expect(blank()?.classList).toContain("md-blank-line");
    view.dispatch({ selection: { anchor: source.indexOf("<br") + 2 } });
    expect(blank()?.classList).toContain("md-blank-line");
    expect(blank()?.textContent).toBe("<br />");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("marks nested list and quote depth without changing source", () => {
    const source =
      "> quote\n> > nested quote\n\n- parent\n  - child\n- sibling\n\n> - quoted list";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });
    const line_with = (text: string) =>
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")].find(
        (line) => line.textContent?.includes(text),
      );
    const nested_quote = line_with("nested quote");
    const parent_item = line_with("parent");
    const nested_item = line_with("child");
    const quoted_item = line_with("quoted list");

    expect(line_with("quote")?.classList).toContain("md-quote-depth-1");
    expect(nested_quote?.classList).toContain("md-quote-depth-2");
    expect(nested_quote?.classList).toContain("md-quote-start");
    expect(nested_quote?.classList).toContain("md-quote-end");
    expect(line_with("quote")?.textContent).toBe("quote");
    expect(nested_quote?.textContent).toBe("nested quote");
    expect(parent_item?.classList).toContain("md-list-depth-1");
    expect(parent_item?.classList).toContain("md-list-item-start");
    expect(parent_item?.getAttribute("style")).toContain(
      "--md-list-prefix-chars: 2",
    );
    expect(nested_item?.classList).toContain("md-list-depth-2");
    expect(nested_item?.classList).toContain("md-list-item-end");
    expect(nested_item?.getAttribute("style")).toContain(
      "--md-list-prefix-chars: 4",
    );
    expect(nested_item?.querySelector(".md-list-marker")?.textContent).toBe(
      "◦",
    );
    expect(quoted_item?.classList).toContain("md-list-line");
    expect(quoted_item?.classList).toContain("md-quote-line");
    expect(quoted_item?.getAttribute("style")).toContain("--md-list-depth: 1");
    expect(quoted_item?.getAttribute("style")).toContain("--md-quote-depth: 1");
    expect(quoted_item?.getAttribute("style")).toContain(
      "--md-list-prefix-chars: 2",
    );
    expect(quoted_item?.getAttribute("style")).toContain(
      "--md-quote-prefix-chars: 2",
    );
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({ selection: { anchor: source.indexOf("- parent") } });
    expect(line_with("parent")?.classList).toContain("md-list-source-visible");
    view.dispatch({ selection: { anchor: source.indexOf("nested quote") } });
    expect(line_with("nested quote")?.textContent).toBe("nested quote");
    view.dispatch({ selection: { anchor: source.indexOf("> >") } });
    expect(line_with("nested quote")?.textContent).toBe("> > nested quote");
  });

  it("keeps active ordered, nested, task, and quoted prefixes in one gutter", () => {
    const source =
      "- first\n  continuation\n\n10. ordered\n\n12345. long number\n  - nested\n- [ ] task\n> quote\n> > nested quote\n> - quoted list\n>   - quoted child\noutside";
    const view = open_markdown(source);
    const line_with = (text: string) =>
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")].find(
        (line) => line.textContent?.includes(text),
      );
    const cases = [
      ["first", "- "],
      ["continuation", "  "],
      ["ordered", "10. "],
      ["long number", "12345. "],
      ["nested", "  - "],
      ["quote", "> "],
      ["nested quote", "> > "],
      ["quoted list", "> - "],
      ["quoted child", ">   - "],
    ] as const;

    for (const [body, prefix] of cases) {
      const body_from = source.indexOf(body);
      view.dispatch({ selection: { anchor: body_from } });
      expect(line_with(body)?.querySelector(".md-source-prefix")).toBeNull();
      view.dispatch({ selection: { anchor: body_from - prefix.length } });
      const line = line_with(body);
      expect(line?.classList).toContain("md-source-prefix-visible");
      expect(line?.querySelector(".md-source-prefix")?.textContent).toBe(
        prefix,
      );
      expect(
        [...(line?.querySelectorAll(".md-prefix-space") ?? [])].map(
          (space) => space.textContent,
        ),
      ).toEqual(prefix.match(/[ \t]+/g));
    }

    view.dispatch({ selection: { anchor: source.indexOf("- [ ]") } });
    const task_line = line_with("task");
    expect(task_line?.classList).toContain("md-source-prefix-visible");
    expect(
      task_line?.querySelector(".md-source-prefix .md-task-checkbox"),
    ).not.toBeNull();
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({ selection: { anchor: source.indexOf("outside") } });
    expect(line_with("first")?.querySelector(".md-source-prefix")).toBeNull();
    expect(
      line_with("first")?.querySelector(".md-list-marker")?.textContent,
    ).toBe("•");
    expect(line_with("ordered")?.classList).toContain("md-list-line");
    expect(
      line_with("ordered")?.querySelector(".md-list-marker")?.textContent,
    ).toBe("10.");
    expect(
      line_with("long number")?.querySelector(".md-list-marker")?.textContent,
    ).toBe("12345.");
  });

  it("keeps a quote separate when a new list starts after it", () => {
    const source = "> - quoted\n>   - nested\n\n";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });
    const quote_classes = () =>
      [...view.contentDOM.querySelectorAll(".md-quote-line")].map(
        (line) => line.className,
      );
    const before = quote_classes();
    for (const text of ["-", " ", "outside"]) {
      view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
      expect(quote_classes()).toEqual(before);
      expect(view.contentDOM.querySelector(".md-list-separator")).toBeNull();
    }
    expect(view.state.doc.toString()).toBe(source + "- outside");
  });

  it("does not hang an unindented lazy continuation outside its text column", () => {
    const source = "> quote\ncontinued\n\n- item\ncontinuation";
    const view = open_markdown(source);
    for (const body of ["continued", "continuation"]) {
      view.dispatch({ selection: { anchor: source.indexOf(body) + 3 } });
      const line = [...view.contentDOM.querySelectorAll(".cm-line")].find(
        (line) => line.textContent === body,
      );
      expect(line).toBeDefined();
      expect(line?.classList).not.toContain("md-source-prefix-visible");
    }
  });

  it.each([">   - item", "> >   - item"])(
    "keeps hidden quote and list prefixes disjoint: %s",
    (source) => {
      const view = open_markdown(source);
      view.dispatch({ selection: { anchor: source.length } });
      expect(
        view.contentDOM.querySelector(".md-list-marker")?.textContent,
      ).toBe("•");
      const ranges: { from: number; to: number }[] = [];
      for (const get_ranges of view.state.facet(EditorView.atomicRanges)) {
        get_ranges(view).between(0, source.length, (from, to) => {
          ranges.push({ from, to });
        });
      }
      ranges.sort((a, b) => a.from - b.from);
      expect(ranges).toHaveLength(2);
      expect(ranges[0]?.to).toBe(ranges[1]?.from);
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it("publishes a task toggle synchronously and touches only its marker", () => {
    const source = "cursor\n\n- [ ] pending\n- [X] done\n";
    const view = open_markdown(source);
    const checkbox = view.dom.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    if (!checkbox) throw new Error("Expected a task checkbox");
    checkbox.click();
    expect(view.state.doc.toString()).toBe(source.replace("[ ]", "[x]"));
    expect(view.dom.querySelectorAll("input:checked")).toHaveLength(2);
  });

  it("marks only task body paragraphs and identifies blank list separators", () => {
    const source = "- [x] done **bold**\n\n- [ ] pending\n\noutside";
    const view = open_markdown(source);
    const task_bodies = view.dom.querySelectorAll(".md-task-completed");
    expect(task_bodies).toHaveLength(1);
    expect(task_bodies[0]?.textContent).toContain("done");
    expect(task_bodies[0]?.querySelector(".md-task-checkbox")).toBeNull();
    expect(task_bodies[0]?.querySelector(".md-list-marker")).toBeNull();
    expect(
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")]
        .filter((line) => line.textContent === "")
        .some((line) => line.classList.contains("md-list-separator")),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps unknown syntax editable and does not interpret tasks inside code", () => {
    const source =
      "cursor\n\n:::custom\nunknown\n:::\n\n~~~text\n- [ ] literal\n~~~\n";
    const view = open_markdown(source);
    expect(view.dom.querySelector(".md-task-checkbox")).toBeNull();
    const position = source.indexOf("unknown");
    view.dispatch({
      changes: { from: position, to: position + 7, insert: "edited" },
    });
    expect(view.state.doc.toString()).toBe(source.replace("unknown", "edited"));
  });

  it("keeps task markers atomic at both arrow boundaries", () => {
    const source = "- [ ] task";
    const view = open_markdown(source);
    const marker_from = source.indexOf("[ ]");
    const marker_to = marker_from + 3;
    view.dispatch({ selection: { anchor: source.indexOf("task") } });

    view.focus();
    press_key(view, "ArrowLeft");
    const after_left = view.state.selection.main.head;
    expect(after_left <= marker_from || after_left >= marker_to).toBe(true);
    press_key(view, "ArrowRight");
    expect(view.state.selection.main.head).toBe(source.indexOf("task"));
    view.dispatch({
      changes: { from: view.state.selection.main.head, insert: "x" },
      selection: { anchor: view.state.selection.main.head + 1 },
    });
    expect(view.state.doc.toString()).toBe("- [ ] xtask");
    expect(view.state.doc.toString().slice(marker_from, marker_to)).toBe("[ ]");
  });

  it("shows escaped punctuation and entities while preserving their source", () => {
    const source = "focus\n\n\\* &amp; &#x1F642;";
    const view = open_markdown(source);
    expect(view.dom.querySelectorAll(".md-literal").length).toBe(3);
    expect(view.dom.textContent).toContain("* & 🙂");
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({ selection: { anchor: source.indexOf("&amp;") + 1 } });
    expect(view.dom.querySelectorAll(".md-literal")).toHaveLength(2);
    expect(view.contentDOM.textContent).toContain("* &amp; 🙂");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("renders task controls beside nested links and leaves paragraph breaks alone", () => {
    const source =
      "intro\n\n- [ ] [Nested **task**](note.md)\n\nnext paragraph";
    const open_link = () => {};
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          rich_markdown_rendering(),
          link_rendering({ open_link }),
        ],
      }),
    });
    views.push(view);
    expect(view.dom.querySelector(".md-task-checkbox")).not.toBeNull();
    expect(view.dom.querySelector(".md-link-rendered")?.textContent).toBe(
      "Nested task",
    );
    expect(view.state.doc.toString()).toBe(source);
  });
});

function press_key(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

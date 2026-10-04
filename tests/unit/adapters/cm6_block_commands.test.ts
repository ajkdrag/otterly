/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorState, EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown_editor_extensions } from "../../../packages/markdown_editor/src/editor_extensions";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import {
  create_markdown_state,
  get_markdown_source,
  source_undo,
} from "../../../packages/markdown_editor/src/source_state";
import {
  set_block_style,
  insert_code_block,
} from "../../../packages/markdown_editor/src/block_commands";
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});
function open(source: string, from = 0, to = from, readOnly = false) {
  const root = document.createElement("div");
  document.body.append(root);
  const state = create_markdown_state(source, [
    markdown_language(),
    EditorState.readOnly.of(readOnly),
    EditorState.allowMultipleSelections.of(true),
  ]);
  const view = new EditorView({
    parent: root,
    state: state.update({ selection: { anchor: from, head: to } }).state,
  });
  views.push(view);
  return view;
}
describe("block commands", () => {
  it("registers the documented block and strikethrough shortcuts in the composed editor", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const state = create_markdown_state("text", markdown_editor_extensions());
    const view = new EditorView({
      parent: root,
      state: state.update({ selection: { anchor: 0, head: 4 } }).state,
    });
    views.push(view);
    const press = (key: string) => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    press("2");
    expect(get_markdown_source(view.state)).toBe("## text");
    press("x");
    expect(get_markdown_source(view.state)).toBe("## ~~text~~");
    press("c");
    expect(get_markdown_source(view.state)).toBe("```\ntext\n```");
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe("## ~~text~~");
  });

  it("preserves backwards text selections during heading and code conversion", () => {
    const view = open("hello world", 11, 6);
    set_block_style(2)(view);
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("world");
    expect(view.state.selection.main.anchor).toBeGreaterThan(
      view.state.selection.main.head,
    );
    insert_code_block(view);
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("world");
    expect(view.state.selection.main.anchor).toBeGreaterThan(
      view.state.selection.main.head,
    );
  });

  it("converts the containing paragraph and leaves all outside bytes unchanged", () => {
    const source = "before\r\n\r\none line\n\nlast\r";
    const view = open(source, 13, 16);
    expect(set_block_style(2)(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(
      "before\r\n\r\n## one line\n\nlast\r",
    );
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });
  it.each(["# title", "Title\n==="])(
    "does not toggle off the current heading level: %s",
    (source) => {
      const view = open(source);
      expect(set_block_style(1)(view)).toBe(false);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );
  it.each([
    [0, 0],
    [0, 16],
    [15, 15],
  ])("converts one multiline Setext block exactly once", (from, to) => {
    const view = open("Title\nsecond\n===", from, to);
    expect(set_block_style(3)(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("### Title second");
    expect(syntaxTree(view.state).topNode.firstChild?.name).toBe("ATXHeading3");
  });
  it("keeps quote nesting when changing a heading level", () => {
    const view = open("> ## title ##", 6);
    set_block_style(1)(view);
    expect(view.state.doc.toString()).toBe("> # title");
  });
  it("wraps each paragraph as one list item and indents its continuation", () => {
    const view = open("one\ntwo\n\nthree", 0, 14);
    set_block_style("ordered")(view);
    expect(view.state.doc.toString()).toBe("1. one\n   two\n\n2. three");
  });
  it("preserves quote markers when wrapping a multiline list item", () => {
    const view = open("> one\n> two", 3);
    set_block_style("bullet")(view);
    expect(view.state.doc.toString()).toBe("> - one\n>   two");
  });
  it.each(["- item", "1. item"])(
    "keeps existing list items unchanged, matching wrapIn",
    (source) => {
      const view = open(source, source.length);
      expect(set_block_style("bullet")(view)).toBe(false);
      expect(set_block_style(2)(view)).toBe(false);
      expect(insert_code_block(view)).toBe(false);
      expect(view.state.doc.toString()).toBe(source);
    },
  );
  it.each([
    "```\ncode\n```",
    "    code",
    "| a |\n|---|\n| b |",
    "---\ntitle: metadata\n---",
  ])("rejects literal contexts without changing source: %s", (source) => {
    const view = open(source, source.indexOf("\n") + 1);
    expect(set_block_style(1)(view)).toBe(false);
    expect(insert_code_block(view)).toBe(false);
    expect(get_markdown_source(view.state)).toBe(source);
  });
  it("honors readonly", () => {
    const view = open("text", 0, 4, true);
    expect(set_block_style(1)(view)).toBe(false);
    expect(insert_code_block(view)).toBe(false);
  });
  it("converts the containing text block to visible code content", () => {
    const view = open("**bold** [link](url) and `code`", 3, 5);
    expect(insert_code_block(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("```\nbold link and code\n```");
    expect(source_undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("**bold** [link](url) and `code`");
  });
  it.each(["> ", "  "])(
    "preserves a quote or later list paragraph prefix for code: %s",
    (prefix) => {
      const source = prefix === "  " ? "- first\n\n  second" : "> second";
      const view = open(source, source.indexOf("second"));
      expect(insert_code_block(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(
        prefix === "  "
          ? "- first\n\n  ```\n  second\n  ```"
          : "> ```\n> second\n> ```",
      );
    },
  );
  it("converts inline code padding and autolinks to their displayed code text", () => {
    const view = open("`` `literal` `` and <https://example.com>", 5);
    insert_code_block(view);
    expect(view.state.doc.toString()).toBe(
      "```\n`literal` and https://example.com\n```",
    );
  });
  it("does not wrap a heading in a list item that requires a first paragraph", () => {
    const view = open("# title", 3);
    expect(set_block_style("bullet")(view)).toBe(false);
  });
  it.each(["one\\\ntwo", "one  \ntwo"])(
    "keeps hard line breaks when converting prose to code: %s",
    (source) => {
      const view = open(source, 0);
      insert_code_block(view);
      expect(view.state.doc.toString()).toBe("```\none\ntwo\n```");
      source_undo(view);
      set_block_style(2)(view);
      expect(view.state.doc.toString()).toBe("## one two");
    },
  );
  it("uses a longer fence when visible code contains backticks", () => {
    const view = open("```` ``` ````", 6);
    insert_code_block(view);
    expect(view.state.doc.toString()).toContain("````\n");
  });
  it("changes only selected paragraphs for multiple selections", () => {
    const view = open("one\n\nskip\n\nthree");
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(13),
      ]),
    });
    set_block_style(2)(view);
    expect(view.state.doc.toString()).toBe("## one\n\nskip\n\n## three");
  });
});

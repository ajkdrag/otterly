/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { create_markdown_state } from "../src/core/editor";
import { set_editor_mode } from "../src/core/editor_mode";
import { commonmark } from "../src/plugins/commonmark/index";
import { find, set_find_query } from "../src/plugins/find";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import { links } from "../src/plugins/links/index";
import { tag_at, tags, type TagOptions } from "../src/plugins/tags/index";
import { inside_link } from "../src/plugins/tags/tag_syntax";
import { wiki_links } from "../src/plugins/wiki_links/index";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

// jsdom has no layout, and CodeMirror measures ranges for mouse selection.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});
afterAll(() => {
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});
afterEach(() => {
  destroy_test_editors();
  vi.restoreAllMocks();
});

type TagCase = {
  name: string;
  markdown: string;
  index: string[];
  editor?: string[];
};

// The Rust parser runs the same cases. The path is a variable because Vite
// rewrites `new URL("literal", import.meta.url)` into a served asset URL.
const fixture_path = "../../../tests/fixtures/tag_cases.json";
const fixture = JSON.parse(
  readFileSync(new URL(fixture_path, import.meta.url), "utf8"),
) as { cases: TagCase[] };

const tag_key = (tag: string) => tag.normalize("NFC").toLowerCase();

// The tags the editor would draw as chips, deduped like the index.
function chip_tags(state: EditorState): string[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  if (!tree) throw new Error("The note did not parse");
  const seen = new Set<string>();
  const found: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "Hashtag" || inside_link(node.node)) return;
      const tag = state.sliceDoc(node.from + 1, node.to);
      if (seen.has(tag_key(tag))) return;
      seen.add(tag_key(tag));
      found.push(tag);
    },
  });
  return found;
}

function plugins(options: TagOptions = {}) {
  return [
    commonmark(),
    gfm(),
    frontmatter(),
    links({ open_link: () => {} }),
    wiki_links(),
    find(),
    tags(options),
  ];
}

function open(source: string, options: TagOptions = {}) {
  return test_editor(source, plugins(options));
}

function chips(editor: TestEditor) {
  return [...editor.view.contentDOM.querySelectorAll<HTMLElement>(".md-tag")];
}

function only_chip(editor: TestEditor): HTMLElement {
  const [chip, ...others] = chips(editor);
  if (!chip || others.length)
    throw new Error(`Expected one chip, found ${String(chips(editor).length)}`);
  return chip;
}

// A press and release on the chip. `moved` is how far the pointer went.
function click(target: HTMLElement, moved = 0, init: MouseEventInit = {}) {
  const at = { bubbles: true, cancelable: true, button: 0, ...init };
  target.dispatchEvent(
    new MouseEvent("mousedown", { ...at, clientX: 1, clientY: 1 }),
  );
  const release = { ...at, clientX: 1 + moved, clientY: 1 };
  target.dispatchEvent(new MouseEvent("mouseup", release));
  target.dispatchEvent(new MouseEvent("click", release));
}

describe("tag grammar", () => {
  test.each(fixture.cases)("TAG-001 $name", (tag_case) => {
    const state = create_markdown_state(tag_case.markdown, {
      plugins: plugins(),
    });
    expect(chip_tags(state)).toEqual(tag_case.editor ?? tag_case.index);
  });
});

describe("tag chips", () => {
  test("TAG-002 a tag is one chip with a dimmed hash, clickable while the caret is elsewhere", () => {
    const editor = open("top‸\n\nsee #project now", { open_tag: vi.fn() });
    const chip = only_chip(editor);
    expect(chip.textContent).toBe("#project");
    expect(chip.classList.contains("md-tag-clickable")).toBe(true);
    expect(chip.querySelector(".md-tag-hash")?.textContent).toBe("#");

    editor.view.dispatch({ selection: { anchor: "top\n\nsee #pro".length } });
    expect(only_chip(editor).classList.contains("md-tag-clickable")).toBe(
      false,
    );
  });

  test("TAG-002 without open_tag a chip is not clickable", () => {
    const editor = open("top‸\n\nsee #project");
    expect(only_chip(editor).classList.contains("md-tag-clickable")).toBe(
      false,
    );
  });

  test("TAG-002 tags in link text and images are not chips, a bare [text] tag is", () => {
    const editor = open(
      "top‸\n\n[see #x](https://e.com) ![see #y](a.png) [ #z]",
    );
    expect(only_chip(editor).textContent).toBe("#z");

    editor.view.dispatch({ selection: { anchor: "top\n\n[see #".length } });
    expect(only_chip(editor).textContent).toBe("#z");
  });

  test("TAG-003 source mode colors the tag text and draws no chip", () => {
    const editor = open("top‸\n\nsee #project", { open_tag: vi.fn() });
    set_editor_mode(editor.view, "source");
    expect(chips(editor)).toEqual([]);
    expect(editor.view.dom.classList.contains("md-source-mode")).toBe(true);
    const colored = [
      ...editor.view.contentDOM.querySelectorAll(".md-tag-source"),
    ].map((element) => element.textContent);
    expect(colored.join("")).toBe("#project");
  });

  test("TAG-004 a plain click opens the tag, a drag or a modified click does not", () => {
    const open_tag = vi.fn();
    const editor = open("top‸\n\nsee #project now", { open_tag });
    click(only_chip(editor));
    expect(open_tag).toHaveBeenCalledWith("project");

    click(only_chip(editor), 10);
    click(only_chip(editor), 0, { metaKey: true });
    click(only_chip(editor), 0, { shiftKey: true });
    expect(open_tag).toHaveBeenCalledTimes(1);
  });

  test("TAG-004 clicking the tag the caret is in places the caret instead", () => {
    const open_tag = vi.fn();
    const editor = open("see #pro‸ject", { open_tag });
    click(only_chip(editor));
    expect(open_tag).not.toHaveBeenCalled();
  });

  test("TAG-005 typing, deleting and undo or redo keep the exact source", () => {
    const editor = open("note ‸");
    editor.type("#");
    expect(chips(editor)).toEqual([]);
    editor.type("ab");
    expect(only_chip(editor).textContent).toBe("#ab");
    expect(editor.source()).toBe("note #ab‸");

    editor.press("Backspace", "Backspace");
    expect(editor.source()).toBe("note #‸");
    expect(chips(editor)).toEqual([]);

    // One typing burst is one undo step.
    editor.press("Mod-z");
    expect(editor.saved()).toBe("note ");
    editor.press("Mod-Shift-z");
    expect(editor.saved()).toBe("note #");
    editor.type("x");
    expect(only_chip(editor).textContent).toBe("#x");
  });

  test("TAG-006 arrows step through a tag one char at a time", () => {
    const editor = open("a ‸#tag b");
    for (const head of [3, 4, 5, 6, 7]) {
      editor.press("ArrowRight");
      expect(editor.view.state.selection.main.head).toBe(head);
    }
    editor.press("ArrowLeft");
    expect(editor.view.state.selection.main.head).toBe(6);
  });

  test("TAG-007 tag_at finds the tag from its hash through the char after it", () => {
    const state = create_markdown_state("see #idea and [x #no](u)", {
      plugins: plugins(),
    });
    expect(tag_at(state, 4)).toBe("idea");
    expect(tag_at(state, 6)).toBe("idea");
    expect(tag_at(state, 9)).toBe("idea");
    expect(tag_at(state, 3)).toBeNull();
    expect(tag_at(state, 10)).toBeNull();
    expect(tag_at(state, "see #idea and [x #n".length)).toBeNull();
  });

  test("TAG-008 a tag in an inactive table cell is a chip that opens without editing the cell", () => {
    const open_tag = vi.fn();
    const editor = open("| a |\n| - |\n| see #cell |\n\nafter‸", {
      open_tag,
    });
    const chip = editor.view.dom.querySelector<HTMLElement>(
      "[data-row][data-col] .md-tag.md-tag-clickable",
    );
    if (!chip) throw new Error("Expected a chip in the table cell");
    expect(chip.textContent).toBe("#cell");
    click(chip);
    expect(open_tag).toHaveBeenCalledWith("cell");
    expect(editor.view.dom.querySelector(".md-table-cell-active")).toBeNull();
  });

  test("TAG-009 a find match over part of a tag leaves the chip in one piece", () => {
    const editor = open("top‸\n\nsee #project now");
    editor.view.dispatch({
      effects: set_find_query.of({ query: "ject n", selected_index: -1 }),
    });
    const chip = only_chip(editor);
    expect(chip.textContent).toBe("#project");
    expect(chip.querySelector(".find-match")?.textContent).toBe("ject");
  });
});

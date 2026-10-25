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
import { EditorState } from "@codemirror/state";
import { create_markdown_state } from "../src/core/editor";
import { set_editor_mode } from "../src/core/editor_mode";
import { commonmark } from "../src/plugins/commonmark/index";
import { find, set_find_query } from "../src/plugins/find";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import { links } from "../src/plugins/links/index";
import {
  tag_at,
  tags,
  type TagOptions,
  type TagSuggestion,
} from "../src/plugins/tags/index";
import { inside_link } from "../src/plugins/tags/tag_syntax";
import { wiki_links } from "../src/plugins/wiki_links/index";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

// jsdom has no layout, and CodeMirror measures ranges for mouse selection and
// the completion tooltip.
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

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// A press and release on the chip. `moved` is how far the pointer went.
// `after_press` runs once the press is in, where CodeMirror moves the caret.
function click(
  target: HTMLElement,
  moved = 0,
  init: MouseEventInit = {},
  after_press?: () => void,
) {
  const at = { bubbles: true, cancelable: true, button: 0, ...init };
  target.dispatchEvent(
    new MouseEvent("mousedown", { ...at, clientX: 1, clientY: 1 }),
  );
  after_press?.();
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

    // The caret in the tag only takes the click class away. Same chip, same
    // text, so nothing moves.
    editor.view.dispatch({ selection: { anchor: "top\n\nsee #pro".length } });
    const active = only_chip(editor);
    expect(active.textContent).toBe("#project");
    expect(active.classList.contains("md-tag-clickable")).toBe(false);
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

  test("TAG-002 a find match over part of a tag leaves the chip in one piece", () => {
    const editor = open("top‸\n\nsee #project now");
    editor.view.dispatch({
      effects: set_find_query.of({ query: "ject n", selected_index: -1 }),
    });
    const chip = only_chip(editor);
    expect(chip.textContent).toBe("#project");
    expect(chip.querySelector(".find-match")?.textContent).toBe("ject");
  });
});

describe("tag editing", () => {
  test("TAG-003 typing, deleting and undo or redo keep the exact source", () => {
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

  test("TAG-003 arrows step through a tag one char at a time", () => {
    const editor = open("a ‸#tag b");
    for (const head of [3, 4, 5, 6, 7]) {
      editor.press("ArrowRight");
      expect(editor.view.state.selection.main.head).toBe(head);
    }
    editor.press("ArrowLeft");
    expect(editor.view.state.selection.main.head).toBe(6);
  });
});

describe("tag clicks", () => {
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

  test("TAG-004 a click puts the caret back, so the same chip opens again", async () => {
    const open_tag = vi.fn();
    const editor = open("‸see #project", { open_tag });
    // The press lands on the chip and CodeMirror moves the caret into it.
    const caret_into_tag = () => {
      editor.view.dispatch({ selection: { anchor: "see #pro".length } });
    };

    click(only_chip(editor), 0, {}, caret_into_tag);
    expect(open_tag).toHaveBeenCalledTimes(1);
    expect(editor.view.state.selection.main.head).toBe(0);

    // The click class follows the caret once the mouse freeze lifts.
    await pause(150);
    expect(only_chip(editor).classList.contains("md-tag-clickable")).toBe(true);
    click(only_chip(editor), 0, {}, caret_into_tag);
    expect(open_tag).toHaveBeenCalledTimes(2);
  });

  test("TAG-004 a drag from a chip keeps the selection it made", () => {
    const open_tag = vi.fn();
    const editor = open("‸see #project", { open_tag });
    click(only_chip(editor), 10, {}, () => {
      editor.view.dispatch({ selection: { anchor: 4, head: 8 } });
    });
    expect(open_tag).not.toHaveBeenCalled();
    expect(editor.view.state.selection.main.from).toBe(4);
    expect(editor.view.state.selection.main.to).toBe(8);
  });

  test("TAG-004 a read-only note still opens the tag on click", () => {
    const open_tag = vi.fn();
    const editor = test_editor("top‸\n\nsee #project", [
      ...plugins({ open_tag }),
      { name: "read_only", extensions: [EditorState.readOnly.of(true)] },
    ]);
    click(only_chip(editor));
    expect(open_tag).toHaveBeenCalledWith("project");
  });

  test("TAG-004 tag_at finds the tag from its hash through the char after it", () => {
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
});

describe("tag completion", () => {
  const suggestions: TagSuggestion[] = [
    { tag: "project", count: 12 },
    { tag: "work/projects", count: 3 },
  ];

  function completing(
    source: string,
    query_tags: NonNullable<TagOptions["query_tags"]>,
  ) {
    return open(source, { query_tags });
  }

  function menu_labels(editor: TestEditor) {
    return currentCompletions(editor.view.state).map(
      (completion) => completion.label,
    );
  }

  async function menu_opens(editor: TestEditor) {
    await vi.waitFor(() => {
      expect(
        editor.view.dom.querySelector(".cm-tooltip-autocomplete"),
      ).not.toBeNull();
    });
  }

  function menu_is_closed(editor: TestEditor) {
    return editor.view.dom.querySelector(".cm-tooltip-autocomplete") === null;
  }

  test("TAG-005 # and a letter offer tags with their counts, and Enter completes", async () => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing("see ‸", query);
    editor.type("#p");
    await menu_opens(editor);
    expect(query).toHaveBeenLastCalledWith("p", expect.any(AbortSignal));
    expect(menu_labels(editor)).toEqual(["#project", "#work/projects"]);
    const option = editor.view.dom.querySelector(".md-tag-option");
    expect(option?.querySelector(".cm-completionDetail")?.textContent).toBe(
      "12",
    );
    editor.press("Enter");
    expect(editor.source()).toBe("see #project‸");
  });

  test.each([
    ["after a letter", "C‸"],
    ["in inline code", "`a ‸`"],
    ["in a URL", "see https://a.com/‸"],
    ["in link text", "[see ‸](https://e.com)"],
    ["in frontmatter", "---\ntags: ‸\n---\n"],
  ])("TAG-005 no lookup %s", async (_where, source) => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing(source, query);
    editor.type("#p");
    await pause(30);
    expect(query).not.toHaveBeenCalled();
    expect(menu_is_closed(editor)).toBe(true);
  });

  test.each([
    ["a quote with no space", ">‸"],
    ["a quote with a space", "> ‸"],
  ])(
    "TAG-005 completes where the parser draws a chip: %s",
    async (_where, source) => {
      const query = vi.fn(() => Promise.resolve(suggestions));
      const editor = completing(source, query);
      editor.type("#p");
      await menu_opens(editor);
      expect(query).toHaveBeenLastCalledWith("p", expect.any(AbortSignal));
    },
  );

  test("TAG-005 completes in a source mode table row, which has no space after the pipe", async () => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing("| a |\n| - |\n|‸|", query);
    set_editor_mode(editor.view, "source");
    editor.type("#p");
    await menu_opens(editor);
    expect(query).toHaveBeenLastCalledWith("p", expect.any(AbortSignal));
  });

  test("TAG-005 a lone # waits for a letter, Ctrl-Space shows the top tags", async () => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing("see ‸", query);
    editor.type("#");
    await pause(30);
    expect(query).not.toHaveBeenCalled();
    startCompletion(editor.view);
    await menu_opens(editor);
    expect(query).toHaveBeenCalledWith("", expect.any(AbortSignal));
  });

  test("TAG-005 a finished tag is not offered again, so Enter makes a new line", async () => {
    const query = vi.fn(() => Promise.resolve([{ tag: "Project", count: 2 }]));
    const editor = completing("see ‸", query);
    editor.type("#project");
    await vi.waitFor(() => {
      expect(query).toHaveBeenLastCalledWith(
        "project",
        expect.any(AbortSignal),
      );
    });
    await pause(30);
    expect(menu_is_closed(editor)).toBe(true);
    editor.press("Enter");
    expect(editor.saved()).toMatch(/^see #project\n/);
  });

  test("TAG-005 completing in the middle of a tag replaces the whole tag", async () => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing("see #p‸oj later", query);
    editor.type("r");
    await menu_opens(editor);
    expect(query).toHaveBeenLastCalledWith("pr", expect.any(AbortSignal));
    editor.press("Enter");
    expect(editor.source()).toBe("see #project‸ later");
  });

  test("TAG-005 emoji are tag chars, before the caret and after it", async () => {
    const query = vi.fn(() => Promise.resolve([{ tag: "🔥hot", count: 2 }]));
    const editor = completing("see #🔥h‸ot later", query);
    editor.type("o");
    await menu_opens(editor);
    expect(query).toHaveBeenLastCalledWith("🔥ho", expect.any(AbortSignal));
    editor.press("Enter");
    expect(editor.source()).toBe("see #🔥hot‸ later");
  });

  test("TAG-006 completion still works in source mode", async () => {
    const query = vi.fn(() => Promise.resolve(suggestions));
    const editor = completing("see ‸", query);
    set_editor_mode(editor.view, "source");
    editor.type("#p");
    await menu_opens(editor);
    editor.press("Enter");
    expect(editor.source()).toBe("see #project‸");
  });
});

describe("tags in source mode", () => {
  test("TAG-006 source mode colors the tag text, draws no chip and a click does not open", () => {
    const open_tag = vi.fn();
    const editor = open("top‸\n\nsee #project", { open_tag });
    set_editor_mode(editor.view, "source");
    expect(chips(editor)).toEqual([]);
    expect(editor.view.dom.classList.contains("md-source-mode")).toBe(true);
    const colored = [
      ...editor.view.contentDOM.querySelectorAll<HTMLElement>(".md-tag-source"),
    ];
    expect(colored.map((element) => element.textContent).join("")).toBe(
      "#project",
    );

    for (const element of colored) click(element);
    expect(open_tag).not.toHaveBeenCalled();
  });
});

describe("tags in tables", () => {
  test("TAG-007 a tag in an inactive table cell is a chip that opens without editing the cell", () => {
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
});

describe("tags in large notes", () => {
  test("TAG-009 chips are drawn for the visible part only", () => {
    const paragraphs = Array.from(
      { length: 5000 },
      (_, index) => `paragraph ${String(index)} with #tag${String(index)}`,
    );
    const editor = open(`${paragraphs.join("\n\n")}‸`, { open_tag: vi.fn() });

    const tree = ensureSyntaxTree(
      editor.view.state,
      editor.view.state.doc.length,
      5000,
    );
    let hashtags = 0;
    tree?.iterate({
      enter(node) {
        if (node.name === "Hashtag") hashtags++;
      },
    });
    expect(hashtags).toBe(5000);
    expect(chips(editor).length).toBeGreaterThan(0);
    expect(chips(editor).length).toBeLessThan(200);
  });
});

/** @vitest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  currentCompletions,
  selectedCompletionIndex,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { links } from "../src/plugins/links/index";
import { slash_menu } from "../src/plugins/menus/slash_menu";
import {
  wiki_links,
  type WikiSuggestion,
} from "../src/plugins/wiki_links/index";
import { source_undo } from "../src/core/source_state";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

// jsdom has no layout, and the completion tooltip measures ranges.
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
afterEach(destroy_test_editors);

const note: WikiSuggestion = {
  title: "Note",
  path: "folder/Note.md",
  kind: "existing",
};
const planned: WikiSuggestion = {
  title: "New Note",
  path: "New Note.md",
  kind: "planned",
  ref_count: 3,
};

function slash_editor(source: string) {
  return test_editor(source, [
    commonmark(),
    gfm(),
    code_blocks(),
    frontmatter(),
    slash_menu(),
  ]);
}

function wiki_editor(
  source: string,
  query_wiki_links: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly WikiSuggestion[]>,
) {
  return test_editor(source, [
    commonmark(),
    links({ open_link: () => {} }),
    wiki_links({ query_wiki_links }),
  ]);
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

function code_surface(editor: TestEditor): EditorView | undefined {
  return (
    [
      ...editor.view.dom.querySelectorAll<HTMLElement>(
        ".md-code-source .cm-editor",
      ),
    ]
      .map((element) => EditorView.findFromDOM(element))
      .find((view) => view?.hasFocus) ?? undefined
  );
}

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("slash menu", () => {
  test("MENU-001 slash on an empty line offers every block command with icon and description", async () => {
    const view = slash_editor("‸");
    view.type("/");
    await menu_opens(view);
    expect([...menu_labels(view)].sort()).toEqual([
      "Blockquote",
      "Bullet List",
      "Code Block",
      "Divider",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
      "Ordered List",
      "Table",
      "Task List",
    ]);
    const first = view.view.dom.querySelector(".md-slash-option");
    expect(first?.querySelector(".md-slash-icon")?.textContent).toBe("H1");
    expect(first?.querySelector(".cm-completionDetail")?.textContent).not.toBe(
      "",
    );
  });

  // The pre-redesign menu listed headings, code, table, lists, quote, then divider.
  test("MENU-001 commands keep their existing order", async () => {
    const view = slash_editor("‸");
    view.type("/");
    await menu_opens(view);
    expect(menu_labels(view)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
      "Code Block",
      "Table",
      "Bullet List",
      "Ordered List",
      "Task List",
      "Blockquote",
      "Divider",
    ]);
  });

  test.each([
    ["h3", ["Heading 3"]],
    ["snippet", ["Code Block"]],
    ["spreadsheet", ["Table"]],
    ["separator", ["Divider"]],
  ])(
    "MENU-001 filtering by %s matches labels and aliases",
    async (query, expected) => {
      const view = slash_editor("‸");
      view.type("/" + query);
      await menu_opens(view);
      expect(menu_labels(view)).toEqual(expected);
    },
  );

  test.each([
    ["inside fenced code", "```md\n/‸\n```"],
    ["inside frontmatter", "---\ntitle: /‸\n---\n"],
    ["inside inline code", "`‸`"],
    ["after text on the line", "word ‸"],
  ])("MENU-001 slash does not open a menu %s", async (_where, source) => {
    const view = slash_editor(source);
    // Typing into a literal block goes through the nested editor for code, so type outside it.
    view.view.focus();
    view.type("/");
    await pause(50);
    expect(menu_is_closed(view)).toBe(true);
  });

  test("MENU-002 Enter accepts the highlighted command once and inserts no newline", async () => {
    const view = slash_editor("‸");
    view.type("/h2");
    await menu_opens(view);
    view.press("Enter");
    expect(view.source()).toBe("## ‸");
    expect(menu_is_closed(view)).toBe(true);
  });

  test("MENU-002 Up and Down stop at the ends of the menu", async () => {
    const view = slash_editor("‸");
    view.type("/");
    await menu_opens(view);
    view.press("ArrowUp");
    expect(selectedCompletionIndex(view.view.state)).toBe(0);
    for (let step = 0; step < 20; step++) view.press("ArrowDown");
    expect(selectedCompletionIndex(view.view.state)).toBe(12);
    expect(menu_is_closed(view)).toBe(false);
  });

  test("MENU-002 Escape closes the menu and leaves the source unchanged", async () => {
    const view = slash_editor("‸");
    view.type("/co");
    await menu_opens(view);
    view.press("Escape");
    expect(menu_is_closed(view)).toBe(true);
    expect(view.source()).toBe("/co‸");
  });

  test("MENU-003 Code Block inside a quote yields a quoted fence and focuses the code body", async () => {
    const view = slash_editor("> ‸");
    view.type("/co");
    await menu_opens(view);
    view.press("Enter");
    expect(view.saved()).toBe("> ```\n> \n> ```");
    expect(code_surface(view)).toBeDefined();
  });

  test("MENU-001 slash works inside a list item and inserts into that item", async () => {
    const view = slash_editor("- ‸");
    view.type("/h1");
    await menu_opens(view);
    view.press("Enter");
    expect(view.saved()).toBe("- # ");
  });

  test("MENU-003 text after the query moves into the new code block", async () => {
    const view = slash_editor("/co‸ remaining");
    view.type("d");
    await menu_opens(view);
    view.press("Enter");
    expect(view.saved()).toBe("```\n remaining\n```");
  });

  test("MENU-003 a Table command focuses the first cell and Undo restores the query", async () => {
    const view = slash_editor("before\n\n‸\n\nafter");
    view.type("/table");
    await menu_opens(view);
    view.press("Enter");
    expect(view.view.dom.querySelector("[data-row]")).not.toBeNull();
    expect(view.view.dom.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(view.view.contentDOM);
    source_undo(view.view);
    expect(view.saved()).toBe("before\n\n/table\n\nafter");
  });
});

describe("wiki completion", () => {
  test("MENU-005 accepting a suggestion closes the brackets once", async () => {
    const view = wiki_editor("‸", () => Promise.resolve([note]));
    view.type("[[no");
    await menu_opens(view);
    view.press("Enter");
    expect(view.saved()).toBe("[[folder/Note]]");
  });

  test("MENU-005 existing closing brackets are reused and surrounding text is kept", async () => {
    const query = vi.fn(() => Promise.resolve([note]));
    const view = wiki_editor("before [[n‸]] after", query);
    view.type("o");
    await menu_opens(view);
    view.press("Enter");
    expect(query).toHaveBeenCalledWith("no", expect.any(AbortSignal));
    expect(view.saved()).toBe("before [[folder/Note]] after");
  });

  test("MENU-005 completion inside a task keeps the task text", async () => {
    const view = wiki_editor("- [ ] see ‸ now", () => Promise.resolve([note]));
    view.view.dispatch({ selection: { anchor: "- [ ] see ".length } });
    view.type("[[no");
    await menu_opens(view);
    view.press("Enter");
    expect(view.saved()).toBe("- [ ] see [[folder/Note]] now");
  });

  test("MENU-005 planned notes show a reference count and existing notes show their path", async () => {
    const view = wiki_editor("‸", () => Promise.resolve([note, planned]));
    view.type("[[n");
    await menu_opens(view);
    const menu = view.view.dom.querySelector(".md-wiki-menu");
    expect(
      menu?.querySelector(".md-wiki-planned .cm-completionDetail")?.textContent,
    ).toBe("3 refs");
    expect(
      menu?.querySelector(
        ".md-wiki-option:not(.md-wiki-planned) .cm-completionDetail",
      )?.textContent,
    ).toBe("folder/Note.md");
    view.press("ArrowDown", "Enter");
    expect(view.saved()).toBe("[[New Note]]");
  });

  test.each([
    ["in inline code", "`[[no‸`"],
    ["after an alias separator", "[[note|al‸"],
  ])("MENU-005 no lookup %s", async (_where, source) => {
    const query = vi.fn(() => Promise.resolve([note]));
    const view = wiki_editor(source, query);
    view.type("x");
    await pause(50);
    expect(query).not.toHaveBeenCalled();
    expect(menu_is_closed(view)).toBe(true);
  });

  test("MENU-006 a result that arrives after the text changed does not open a menu or edit", async () => {
    let resolve_lookup: (items: readonly WikiSuggestion[]) => void = () => {};
    const lookup = new Promise<readonly WikiSuggestion[]>((resolve) => {
      resolve_lookup = resolve;
    });
    let signal: AbortSignal | undefined;
    const view = wiki_editor("‸", (_query, abort_signal) => {
      signal = abort_signal;
      return lookup;
    });
    view.type("[[no");
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    // Delete the brackets so the query no longer applies, then answer the old query.
    view.press("Backspace", "Backspace", "Backspace", "Backspace");
    view.type("plain");
    resolve_lookup([note]);
    await pause(50);
    expect(menu_is_closed(view)).toBe(true);
    expect(view.saved()).toBe("plain");
  });

  test("MENU-006 destroying the view aborts the pending lookup", async () => {
    let resolve_lookup: (items: readonly WikiSuggestion[]) => void = () => {};
    let signal: AbortSignal | undefined;
    const view = wiki_editor("‸", (_query, abort_signal) => {
      signal = abort_signal;
      return new Promise((resolve) => {
        resolve_lookup = resolve;
      });
    });
    view.type("[[no");
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    view.destroy();
    expect(signal?.aborted).toBe(true);
    resolve_lookup([note]);
  });

  test("MENU-006 a late result after the view is destroyed leaves no menu behind", async () => {
    let resolve_lookup: (items: readonly WikiSuggestion[]) => void = () => {};
    let asked = false;
    const view = wiki_editor("‸", () => {
      asked = true;
      return new Promise((resolve) => {
        resolve_lookup = resolve;
      });
    });
    view.type("[[no");
    await vi.waitFor(() => {
      expect(asked).toBe(true);
    });
    view.destroy();
    resolve_lookup([note]);
    await pause(20);
    expect(document.querySelector(".cm-tooltip-autocomplete")).toBeNull();
  });
});

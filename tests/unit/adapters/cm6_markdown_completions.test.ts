/** @vitest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CompletionContext,
  selectedCompletionIndex,
  startCompletion,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { markdown_completion_source } from "../../../packages/markdown_editor/src/markdown_completions";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import {
  create_markdown_state,
  get_markdown_source,
  markdown_editor_extensions,
} from "../../../packages/markdown_editor/src/index";

const views: EditorView[] = [];
const range_client_rects = Object.getOwnPropertyDescriptor(
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
  if (range_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      range_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_document(
  source: string,
  anchor = source.length,
  read_only = false,
) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      selection: { anchor },
      extensions: [
        markdown_language(),
        history(),
        EditorState.readOnly.of(read_only),
      ],
    }),
  });
  views.push(view);
  return view;
}

function accept(
  view: EditorView,
  result: CompletionResult | null,
  label: string,
) {
  const item = result?.options.find((option) => option.label === label);
  if (!result || !item || typeof item.apply !== "function")
    throw new Error(`Missing completion ${label}`);
  item.apply(view, item, result.from, view.state.selection.main.head);
}

describe("CM6 Markdown completions", () => {
  async function open_menu(
    source = "/",
    query_wiki_links?: () => Promise<
      readonly {
        title: string;
        path: string;
        kind: "existing" | "planned";
        ref_count?: number;
      }[]
    >,
  ) {
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(
        source,
        markdown_editor_extensions(
          query_wiki_links ? { query_wiki_links } : {},
        ),
      ),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: source.length } });
    view.focus();
    startCompletion(view);
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".cm-tooltip-autocomplete")).not.toBeNull();
    });
    return view;
  }
  function press(view: EditorView, key: string) {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  }
  it("renders all slash commands with their original icon, label, and description", async () => {
    const view = await open_menu();
    const menu = view.dom.querySelector(".md-slash-menu");
    const rows = [...(menu?.querySelectorAll(".md-slash-option") ?? [])];
    expect(rows).toHaveLength(13);
    expect(
      rows.map((row) => row.querySelector(".md-slash-icon")?.textContent),
    ).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "</>",
      "⊞",
      "•",
      "#",
      "☐",
      "❝",
      "—",
    ]);
    expect(rows[0]?.querySelector(".cm-completionLabel")?.textContent).toBe(
      "Heading 1",
    );
    expect(rows[0]?.querySelector(".cm-completionDetail")?.textContent).toBe(
      "Large section heading",
    );
    expect(rows[6]?.querySelector(".cm-completionDetail")?.textContent).toBe(
      "Code with syntax highlighting",
    );
    expect(
      rows[0]?.querySelector(".md-slash-icon")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(menu?.querySelector(".cm-completionIcon")).toBeNull();
  });
  it("clamps arrow navigation and accepts immediately without inserting a newline", async () => {
    const view = await open_menu();
    press(view, "ArrowUp");
    expect(selectedCompletionIndex(view.state)).toBe(0);
    for (let index = 0; index < 15; index++) press(view, "ArrowDown");
    expect(selectedCompletionIndex(view.state)).toBe(12);
    press(view, "Enter");
    expect(get_markdown_source(view.state)).toBe("---\n\n");
    expect(view.dom.querySelector(".cm-tooltip-autocomplete")).toBeNull();
  });
  it("accepts a mouse-picked command and keeps Escape source-neutral", async () => {
    const view = await open_menu();
    press(view, "Escape");
    expect(view.dom.querySelector(".cm-tooltip-autocomplete")).toBeNull();
    expect(get_markdown_source(view.state)).toBe("/");
    startCompletion(view);
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".md-slash-option")).not.toBeNull();
    });
    view.dom
      .querySelector(".md-slash-option")
      ?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    expect(get_markdown_source(view.state)).toBe("# ");
    expect(view.hasFocus).toBe(true);
  });
  it.each([
    ["snippet", "Code Block"],
    ["spreadsheet", "Table"],
    ["callout", "Blockquote"],
    ["separator", "Divider"],
    ["large", "Heading 1"],
    ["subtitle", "Heading 2"],
  ])("preserves the former slash alias %s", async (query, label) => {
    const view = open_document(`/${query}`);
    const result = await markdown_completion_source()(
      new CompletionContext(view.state, view.state.doc.length, false),
    );
    expect(result?.options.map((option) => option.label)).toEqual([label]);
  });
  it("keeps wiki suggestions compact with a distinct planned-note reference badge", async () => {
    const view = await open_menu("[[n", () =>
      Promise.resolve([
        { title: "Note", path: "folder/Note.md", kind: "existing" },
        {
          title: "New Note",
          path: "New Note.md",
          kind: "planned",
          ref_count: 3,
        },
      ]),
    );
    const menu = view.dom.querySelector(".md-wiki-menu");
    expect(menu?.querySelectorAll(".md-wiki-option")).toHaveLength(2);
    expect(menu?.querySelector(".md-slash-icon")).toBeNull();
    expect(
      menu?.querySelector(".md-wiki-planned .cm-completionDetail")?.textContent,
    ).toBe("3 refs");
    expect(
      menu?.querySelector(
        ".md-wiki-option:not(.md-wiki-planned) .cm-completionDetail",
      )?.textContent,
    ).toBe("folder/Note.md");
    press(view, "ArrowDown");
    press(view, "Enter");
    expect(get_markdown_source(view.state)).toBe("[[New Note]]");
  });
  it.each(["Table", "Code Block"])(
    "focuses the inserted %s for immediate typing",
    async (label) => {
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state("/", markdown_editor_extensions()),
      });
      views.push(view);
      view.dispatch({ selection: { anchor: 1 } });
      const result = await markdown_completion_source()(
        new CompletionContext(view.state, 1, false),
      );
      accept(view, result, label);
      const editable =
        label === "Table"
          ? view.dom.querySelector('[data-row="0"][data-col="0"]')
          : view.dom.querySelector(".md-code-source .cm-content");
      expect(editable).not.toBeNull();
      expect(document.activeElement).toBe(editable);
    },
  );
  it("offers all existing slash commands and filters aliases", async () => {
    const view = open_document("/");
    const source = markdown_completion_source();
    expect(
      (await source(new CompletionContext(view.state, 1, false)))?.options,
    ).toHaveLength(13);
    view.dispatch({
      changes: { from: 1, insert: "h3" },
      selection: { anchor: 3 },
    });
    expect(
      (await source(new CompletionContext(view.state, 3, false)))?.options.map(
        (item) => item.label,
      ),
    ).toEqual(["Heading 3"]);
  });

  it.each([
    ["Heading 2", "## "],
    ["Bullet List", "- "],
    ["Ordered List", "1. "],
    ["Task List", "- [ ] "],
    ["Blockquote", "> "],
    ["Divider", "---\n\n"],
    ["Code Block", "```\n\n```\n"],
  ])("inserts %s and undoes exactly", async (label, expected) => {
    const view = open_document("before\n\n/\n\nafter", 9);
    const result = await markdown_completion_source()(
      new CompletionContext(view.state, 9, false),
    );
    accept(view, result, label);
    expect(view.state.doc.toString()).toBe(`before\n\n${expected}\n\nafter`);
    undo(view);
    expect(view.state.doc.toString()).toBe("before\n\n/\n\nafter");
  });

  it("preserves text after the slash query inside the new code block", async () => {
    const view = open_document("/code remaining", 5);
    const result = await markdown_completion_source()(
      new CompletionContext(view.state, 5, false),
    );
    accept(view, result, "Code Block");
    expect(view.state.doc.toString()).toBe("```\n remaining\n```\n");
  });

  it.each([
    "```md\n/code\n```",
    "- /code",
    "    /code",
    "---\ntitle: /code\n---",
    "`/code`",
  ])(
    "does not offer slash commands in literal or list context: %s",
    async (source) => {
      const position = source.indexOf("/code") + 5;
      const view = open_document(source, position);
      expect(
        await markdown_completion_source()(
          new CompletionContext(view.state, position, false),
        ),
      ).toBeNull();
    },
  );

  it("completes a wiki target once, retaining existing closing brackets", async () => {
    const view = open_document("before [[no]] after", 11);
    const query = vi.fn(() =>
      Promise.resolve([
        { title: "Note", path: "folder/Note.md", kind: "existing" as const },
      ]),
    );
    const result = await markdown_completion_source({
      query_wiki_links: query,
    })(new CompletionContext(view.state, 11, false));
    accept(view, result, "Note");
    expect(query).toHaveBeenCalledWith("no", expect.any(AbortSignal));
    expect(view.state.doc.toString()).toBe("before [[folder/Note]] after");
    undo(view);
    expect(view.state.doc.toString()).toBe("before [[no]] after");
  });

  it("completes a wiki target inside a task and keeps surrounding paragraph text", async () => {
    const source = "before\n\n- [ ] *prefix [[no]]*\n\nafter";
    const position = source.indexOf("no") + 2;
    const view = open_document(source, position);
    const query = vi.fn(() =>
      Promise.resolve([
        { title: "Note", path: "folder/Note.md", kind: "existing" as const },
      ]),
    );
    const result = await markdown_completion_source({
      query_wiki_links: query,
    })(new CompletionContext(view.state, position, false));
    accept(view, result, "Note");
    expect(view.state.doc.toString()).toBe(
      "before\n\n- [ ] *prefix [[folder/Note]]*\n\nafter",
    );
    expect(query).toHaveBeenCalledWith("no", expect.any(AbortSignal));
  });

  it("accepts an async wiki suggestion through the editor keymap without duplicating brackets", async () => {
    const source = "before\n\n[[no]]\n\nafter";
    const position = source.indexOf("no") + 2;
    const query = vi.fn(() =>
      Promise.resolve([
        { title: "Note", path: "folder/Note.md", kind: "existing" as const },
      ]),
    );
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(
        source,
        markdown_editor_extensions({ query_wiki_links: query }),
      ),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: position } });
    startCompletion(view);

    await vi.waitFor(() => {
      expect(query).toHaveBeenCalledWith("no", expect.any(AbortSignal));
      expect(view.dom.querySelector(".cm-tooltip-autocomplete")).not.toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.state.doc.toString()).toBe(
      "before\n\n[[folder/Note]]\n\nafter",
    );
    expect(get_markdown_source(view.state)).toBe(
      "before\n\n[[folder/Note]]\n\nafter",
    );
  });

  it("does not query wiki suggestions in code, aliases, or read-only documents", async () => {
    const query = vi.fn(() => Promise.resolve([]));
    const source = markdown_completion_source({ query_wiki_links: query });
    for (const [text, position, readonly] of [
      ["`[[note`", 7, false],
      ["[[note|alias", 12, false],
      ["[[note", 6, true],
    ] as const) {
      const view = open_document(
        text,
        Math.min(text.length, position),
        readonly,
      );
      expect(
        await source(
          new CompletionContext(
            view.state,
            view.state.selection.main.head,
            false,
          ),
        ),
      ).toBeNull();
    }
    expect(query).not.toHaveBeenCalled();
  });
});

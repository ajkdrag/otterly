/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { defaultKeymap } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  create_markdown_state,
  get_markdown_source,
  source_undo,
} from "../../../packages/markdown_editor/src/source_state";
import { markdown_editor_extensions } from "../../../packages/markdown_editor/src/editor_extensions";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { markdown_editing_keymap } from "../../../packages/markdown_editor/src/editing_commands";

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_editor(source: string, cursor = source.length) {
  const view = new EditorView({
    parent: document.body,
    state: create_markdown_state(source, [
      markdown_language(),
      markdown_editing_keymap,
      keymap.of(defaultKeymap),
    ]),
  });
  views.push(view);
  view.dispatch({ selection: { anchor: cursor } });
  return view;
}

function open_composed(
  source: string,
  cursor = source.replace(/\r\n/g, "\n").length,
) {
  const view = new EditorView({
    parent: document.body,
    state: create_markdown_state(source, markdown_editor_extensions()),
  });
  views.push(view);
  view.dispatch({ selection: { anchor: cursor } });
  return view;
}

function press(view: EditorView, key: string, shiftKey = false) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("CM6 source editing commands", () => {
  it.each([
    "> Quote",
    "> first\n> second",
    "> > nested",
    "> - bullet",
    "> `inline code`",
    "> [link](https://example.com)",
    "> Quote\r\n> next",
  ])("Cmd-Enter creates prose outside the complete quote: %s", (source) => {
    const view = open_composed(source);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    const position = view.state.selection.main.head;
    expect(view.state.doc.toString()).toBe(
      source.replace(/\r\n/g, "\n") + "\n\n",
    );
    view.dispatch({
      changes: { from: position, insert: "Outside" },
      selection: { anchor: position + 7 },
      userEvent: "input.type",
    });
    const tree = ensureSyntaxTree(view.state, view.state.doc.length, 100);
    if (!tree) throw new Error("Missing quote exit tree");
    let node = tree.resolveInner(position + 1);
    while (node.parent) {
      expect(node.name).not.toBe("Blockquote");
      expect(node.name).not.toBe("ListItem");
      node = node.parent;
    }
    let undo_count = 0;
    while (source_undo(view)) undo_count++;
    expect(undo_count).toBeGreaterThan(0);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it.each([
    ["> quote", "> quote\n\n", 0],
    ["> > quote", "> > quote\n> \n> ", 1],
    ["> quote\r\n> ", "> quote\r\n\r\n", 0],
    ["- > quote\n  > ", "- > quote\n  \n  ", 0],
  ])(
    "exits one empty quote level with Enter: %s",
    (source, expected, depth) => {
      const view = open_composed(source);
      if (!source.endsWith("> ")) press(view, "Enter");
      press(view, "Enter");
      expect(get_markdown_source(view.state)).toBe(expected);
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: "next" },
        selection: { anchor: position + 4 },
        userEvent: "input.type",
      });
      const tree = ensureSyntaxTree(view.state, view.state.doc.length, 100);
      if (!tree) throw new Error("Missing quote exit syntax tree");
      let node = tree.resolveInner(position + 1);
      let quote_depth = 0;
      let list_depth = 0;
      while (node.parent) {
        if (node.name === "Blockquote") quote_depth++;
        if (node.name === "ListItem") list_depth++;
        node = node.parent;
      }
      expect(quote_depth).toBe(depth);
      expect(list_depth).toBe(source.startsWith("- >") ? 1 : 0);
      let undo_count = 0;
      while (source_undo(view)) undo_count++;
      expect(undo_count).toBeGreaterThan(0);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );

  it("steps from a quoted list through quoted prose into outside prose", () => {
    const source = "> - first\n> - second\n";
    const view = open_composed(source, source.length - 1);
    const type_text = (text: string) => {
      const from = view.state.selection.main.head;
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.type",
      });
    };
    press(view, "Enter");
    press(view, "Enter");
    type_text("Quoted paragraph");
    expect(get_markdown_source(view.state)).toBe(
      "> - first\n> - second\n> \n> Quoted paragraph\n",
    );
    press(view, "Enter");
    press(view, "Enter");
    type_text("Outside paragraph");
    expect(get_markdown_source(view.state)).toBe(
      "> - first\n> - second\n> \n> Quoted paragraph\n\nOutside paragraph\n",
    );
    let undo_count = 0;
    while (source_undo(view)) undo_count++;
    expect(undo_count).toBeGreaterThan(0);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it.each(["- previous\n- ", "> - previous\n> - "])(
    "exits the last list level into a separate paragraph: %s",
    (source) => {
      const view = open_editor(source);
      press(view, "Enter");
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: "paragraph" },
        selection: { anchor: position + 9 },
        userEvent: "input.type",
      });
      let node = syntaxTree(view.state).resolveInner(position + 1);
      const parents: string[] = [];
      while (node.parent) {
        parents.push(node.parent.name);
        node = node.parent;
      }
      expect(parents).not.toContain("ListItem");
      expect(parents.includes("Blockquote")).toBe(source.startsWith(">"));
      expect(get_markdown_source(view.state)).toBe(
        source.startsWith(">")
          ? "> - previous\n> \n> paragraph"
          : "- previous\n\nparagraph",
      );
    },
  );
  it.each([
    ["> quote", "> quote\n> "],
    ["- parent\n  - child", "- parent\n  - child\n  - "],
    ["> - parent\n>   - child", "> - parent\n>   - child\n>   - "],
  ])(
    "continues the active container in the fully composed editor: %s",
    async (source, expected) => {
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state(source, markdown_editor_extensions()),
      });
      views.push(view);
      view.dispatch({ selection: { anchor: source.length } });
      view.focus();
      press(view, "Enter");
      await Promise.resolve();
      expect(get_markdown_source(view.state)).toBe(expected);
      expect(view.state.selection.main.head).toBe(expected.length);
      const position = view.state.selection.main.head;
      view.dispatch({
        changes: { from: position, insert: "next" },
        selection: { anchor: position + 4 },
        userEvent: "input.type",
      });
      await Promise.resolve();
      press(view, "Enter");
      expect(view.state.doc.length).toBeGreaterThan(expected.length + 4);
    },
  );

  it.each([
    [
      "> This is a block quote\n> - Another quote\n> - Yet another\n> - Right????\n  > - Ikr\n  >   - Ikr\n>     - ",
      "nested quoted item",
    ],
    [
      "1. adada\n2. adaad\n     - dadad\n     - dada",
      "nested ordered/bullet item",
    ],
    ["> quote\n> ", "empty quoted line"],
  ])("handles Enter at the end of the draft's %s", async (source) => {
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, markdown_editor_extensions()),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: source.length } });
    view.focus();
    const before = get_markdown_source(view.state);
    press(view, "Enter");
    await Promise.resolve();
    expect(get_markdown_source(view.state)).not.toBe(before);
  });
  it.each([
    [
      "> - parent\n  >   - child\n>     - ",
      "> - parent\n  >   - child\n>   - ",
    ],
    ["- parent\n  - child\n    - ", "- parent\n  - child\n  - "],
    ["> - parent\n>   - ", "> - parent\n> - "],
    ["> - ", "> "],
    ["1. parent\n   - ", "1. parent\n2. "],
    ["- [x] parent\n  - ", "- [x] parent\n- [ ] "],
  ])("lifts an empty item exactly one list level: %s", (source, expected) => {
    const view = open_editor(source);
    press(view, "Enter");
    expect(get_markdown_source(view.state)).toBe(expected);
    expect(view.state.selection.main.head).toBe(expected.length);
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });
  it("preserves mixed line endings and all earlier quote whitespace while lifting", () => {
    const source = "> - parent\r\n  >   - child\n>     - ";
    const view = open_editor(source, source.replace(/\r\n/g, "\n").length);
    press(view, "Enter");
    expect(get_markdown_source(view.state)).toBe(
      "> - parent\r\n  >   - child\n>   - ",
    );
  });
  it("inserts an ordinary newline inside YAML instead of continuing Markdown markers", () => {
    const source = "---\nitems: - item\n---";
    const view = open_editor(source, source.indexOf("item\n") + 4);
    press(view, "Enter");
    expect(get_markdown_source(view.state)).toBe("---\nitems: - item\n\n---");
  });
  it.each([
    ["first line", "line", "first line  \n"],
    ["- [ ] task", "task", "- [ ] task  \n  "],
    ["> quote", "quote", "> quote  \n> "],
    ["> - item", "item", "> - item  \n>   "],
  ])("inserts a Markdown hard break in %s", (source, cursor_text, expected) => {
    const view = open_editor(
      source,
      source.indexOf(cursor_text) + cursor_text.length,
    );
    press(view, "Enter", true);
    expect(view.state.doc.toString()).toBe(expected);
  });

  it("keeps a hard break and subsequent text in the same list item", () => {
    const view = open_editor("- [ ] task");
    press(view, "Enter", true);
    view.dispatch({
      changes: { from: view.state.selection.main.head, insert: "continued" },
      selection: {
        anchor: view.state.selection.main.head + "continued".length,
      },
    });
    expect(view.state.doc.toString()).toBe("- [ ] task  \n  continued");
  });

  it.each([
    ["> - parent\n>   - child\n>     - grandchild", ">       "],
    ["-\titem", "    "],
    ["-   item", "    "],
    ["> -\titem", ">   "],
  ])("keeps list indentation on a hard break in %s", (source, prefix) => {
    const view = open_composed(source);
    press(view, "Enter", true);
    expect(get_markdown_source(view.state)).toBe(source + "  \n" + prefix);
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("uses the source buffer's existing line ending for hard breaks", () => {
    const source = "- [ ] task\r\n";
    const view = open_editor(source, source.indexOf("task") + 4);
    press(view, "Enter", true);
    expect(get_markdown_source(view.state)).toBe("- [ ] task  \r\n  \r\n");
  });

  it.each([
    "---\ntitle: value\n---\nbody",
    "```md\ntext\n```",
    "`inline code`",
  ])("does not add hard-break syntax inside literals: %s", (source) => {
    const cursor =
      source.indexOf("text") >= 0
        ? source.indexOf("text") + 4
        : source.indexOf("value") >= 0
          ? source.indexOf("value") + 2
          : source.indexOf("code") + 2;
    const view = open_editor(source, cursor);
    press(view, "Enter", true);
    expect(view.state.doc.toString()).not.toContain("  \n");
  });

  it.each([
    ["- parent\n- child", "- parent\n  - child"],
    ["> - parent\n> - child", "> - parent\n>   - child"],
    [
      "> - parent\n>   - sibling\n>   - child",
      "> - parent\n>   - sibling\n>     - child",
    ],
    ["10. parent\n11. child", "10. parent\n    11. child"],
    ["-   parent\n- child", "-   parent\n    - child"],
    ["-\tparent\n- child", "-\tparent\n    - child"],
    ["9.\tparent\n10. child", "9.\tparent\n    10. child"],
    [
      "- parent\n- child\n  - descendant",
      "- parent\n  - child\n    - descendant",
    ],
  ])(
    "indents a whole list item after its quote prefix: %s",
    (source, expected) => {
      const view = open_composed(source, source.indexOf("child") + 2);
      press(view, "Tab");
      expect(get_markdown_source(view.state)).toBe(expected);
      expect(
        view.state.sliceDoc(
          view.state.selection.main.head - 2,
          view.state.selection.main.head + 3,
        ),
      ).toBe("child");
      press(view, "Tab", true);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );

  it.each([
    ["- child", "child"],
    ["> - child", "> child"],
    ["- [ ] child", "child"],
    ["- parent\n  - child", "- parent\n- child"],
    ["> - parent\n>   - child", "> - parent\n> - child"],
    ["> > child", "> child"],
  ])(
    "removes one container with Backspace at its first text: %s",
    (source, expected) => {
      const view = open_composed(source, source.indexOf("child"));
      press(view, "Backspace");
      expect(get_markdown_source(view.state)).toBe(expected);
      expect(source_undo(view)).toBe(true);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );

  it("moves a backwards selection of ordered siblings as one level and undoes exactly", () => {
    const source = "> 9. previous\r\n> 10. child\n> 11. sibling\r\n";
    const view = open_composed(source);
    const original = view.state.doc.toString();
    view.dispatch({
      selection: {
        anchor: original.indexOf("sibling") + 7,
        head: original.indexOf("child"),
      },
    });
    press(view, "Tab");
    expect(get_markdown_source(view.state)).toBe(
      "> 9. previous\r\n>    10. child\n>    11. sibling\r\n",
    );
    expect(view.state.selection.main.anchor).toBeGreaterThan(
      view.state.selection.main.head,
    );
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("does not indent an item twice when two selections touch its subtree", () => {
    const source = "> - previous\n> - child\n>   - descendant";
    const view = open_composed(source);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(source.indexOf("child")),
        EditorSelection.cursor(source.indexOf("descendant")),
      ]),
    });
    press(view, "Tab");
    expect(get_markdown_source(view.state)).toBe(
      "> - previous\n>   - child\n>     - descendant",
    );
    expect(view.state.selection.ranges).toHaveLength(2);
  });

  it("keeps a first item in its list when Tab has no preceding sibling", () => {
    const source = "> - parent\n>   - child";
    const view = open_composed(source);
    press(view, "Tab");
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("does not mutate readonly lists through container keys", () => {
    const source = "> - parent\n> - child";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, [
        markdown_editor_extensions(),
        EditorState.readOnly.of(true),
      ]),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: source.indexOf("child") } });
    for (const [key, shift] of [
      ["Tab", false],
      ["Tab", true],
      ["Backspace", false],
      ["Enter", false],
    ] as const)
      press(view, key, shift);
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("keeps generic indentation and deletion inside literal blocks", () => {
    const source = "```md\n> - child\n```";
    const view = open_editor(source, source.indexOf("child"));
    press(view, "Tab");
    expect(get_markdown_source(view.state)).toBe("```md\n  > - child\n```");
    press(view, "Tab", true);
    press(view, "Backspace");
    expect(get_markdown_source(view.state)).toBe("```md\n> -child\n```");
  });

  it.each([
    ["> previous\n> child", "> previous\n\nchild"],
    ["> > previous\n> > child", "> > previous\n> \n> child"],
  ])(
    "Backspace exits a continued quote without leaving a lazy quoted paragraph: %s",
    (source, expected) => {
      const view = open_composed(source, source.indexOf("child"));
      press(view, "Backspace");
      expect(get_markdown_source(view.state)).toBe(expected);
      expect(source_undo(view)).toBe(true);
      expect(get_markdown_source(view.state)).toBe(source);
    },
  );

  it.each(["- ", "> - ", "- [ ] "])(
    "removes an empty list marker: %s",
    (source) => {
      const view = open_composed(source);
      press(view, "Backspace");
      expect(get_markdown_source(view.state)).toBe(
        source.startsWith(">") ? "> " : "",
      );
    },
  );

  it("does not leave lifted prose as a lazy continuation of the prior list", () => {
    const view = open_composed("> - previous\n> - child");
    press(view, "Tab", true);
    expect(get_markdown_source(view.state)).toBe("> - previous\n> \n> child");
    const node = ensureSyntaxTree(
      view.state,
      view.state.doc.length,
      100,
    )?.resolveInner(view.state.selection.main.head, -1);
    expect(node?.parent?.name).toBe("Blockquote");
  });

  it.each([
    ["- [ ] task", "- [ ] task\n- [ ] "],
    ["- [x] task", "- [x] task\n- [ ] "],
  ])(
    "continues task items with Enter and starts the next item unchecked",
    (source, expected) => {
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state(source, markdown_editor_extensions()),
      });
      views.push(view);
      view.dispatch({ selection: { anchor: source.length } });
      press(view, "Enter");
      expect(get_markdown_source(view.state)).toBe(expected);
    },
  );
});

/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceParsing } from "@codemirror/language";
import {
  get_find_matches,
  markdown_find_highlights,
  set_find_query,
} from "../../../packages/markdown_editor/src/find_highlights";
import {
  create_markdown_state,
  markdown_editor_extensions,
  get_markdown_source,
} from "../../../packages/markdown_editor/src/index";

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_document(doc: string, query: string) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions: markdown_find_highlights() }),
  });
  views.push(view);
  view.dispatch({ effects: set_find_query.of({ query, selected_index: 0 }) });
  return view;
}

describe("CM6 find highlights", () => {
  it.each(["label", "image.png", "**", "[X]"])(
    "reveals a selected source match hidden by rich rendering: %s",
    (query) => {
      const source =
        "cursor\r\n\r\n[Label](https://example.com)\r\n\r\n![Picture](image.png)\r\n\r\n**bold**\r\n\r\n- [X] complete";
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state(
          source,
          markdown_editor_extensions({ open_link: () => {} }),
        ),
      });
      views.push(view);
      forceParsing(view, view.state.doc.length, 100);
      view.dispatch({
        effects: set_find_query.of({ query, selected_index: 0 }),
      });
      expect(
        view.dom
          .querySelector(".find-match--selected")
          ?.textContent?.toLowerCase(),
      ).toBe(query.toLowerCase());
      expect(get_markdown_source(view.state)).toBe(source);
      view.dispatch({
        effects: set_find_query.of({ query: "", selected_index: 0 }),
      });
      expect(view.dom.querySelector(".md-link-rendered")).not.toBeNull();
    },
  );
  it("matches literal punctuation case-insensitively without changing source", () => {
    const source = "Find [a.b] and [A.B]. Also aab.";
    const view = open_document(source, "[a.b]");
    expect(get_find_matches(view.state)).toEqual([
      { from: 5, to: 10 },
      { from: 15, to: 20 },
    ]);
    expect(view.dom.querySelectorAll(".find-match")).toHaveLength(2);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("reuses matches when navigating and clears them when dismissed", () => {
    const view = open_document("same same", "same");
    const matches = get_find_matches(view.state);
    view.dispatch({
      effects: set_find_query.of({ query: "same", selected_index: 1 }),
    });
    expect(get_find_matches(view.state)).toBe(matches);
    expect(view.dom.querySelector(".find-match--selected")?.textContent).toBe(
      "same",
    );
    view.dispatch({
      effects: set_find_query.of({ query: "", selected_index: 0 }),
    });
    expect(get_find_matches(view.state)).toEqual([]);
    expect(view.dom.querySelector(".find-match")).toBeNull();
  });

  it("updates positions and removes stale matches after edits", () => {
    const view = open_document("same same", "same");
    view.dispatch({
      changes: [
        { from: 0, insert: "prefix " },
        { from: 5, to: 9, insert: "other" },
      ],
    });
    expect(get_find_matches(view.state)).toEqual([{ from: 7, to: 11 }]);
  });

  it("keeps UTF-16 offsets correct beside emoji and case-expanding letters", () => {
    const source = "😀 İ hello HELLO";
    const view = open_document(source, "hello");
    expect(get_find_matches(view.state)).toEqual([
      { from: 5, to: 10 },
      { from: 11, to: 16 },
    ]);
  });

  it("preserves independent queries when cached buffers are restored", () => {
    const view = open_document("first first", "first");
    const first = view.state;
    view.setState(
      EditorState.create({
        doc: "second",
        extensions: markdown_find_highlights(),
      }),
    );
    expect(get_find_matches(view.state)).toEqual([]);
    view.setState(first);
    expect(get_find_matches(view.state)).toHaveLength(2);
  });
});

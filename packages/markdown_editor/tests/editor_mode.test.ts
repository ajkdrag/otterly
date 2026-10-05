/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { create_text_state } from "../src/core/editor";
import { get_editor_mode, set_editor_mode } from "../src/core/editor_mode";
import { get_markdown_source, source_undo } from "../src/core/source_state";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const editor = (source: string) =>
  test_editor(source, [commonmark(), gfm(), code_blocks()]);

describe("source mode", () => {
  test("MODE-001 source mode shows every character, and rich mode renders again", () => {
    const note = editor(
      "# Title\n\n**bold**\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nend‸",
    );
    const { view } = note;
    expect(view.dom.querySelector(".md-table-widget")).not.toBeNull();

    set_editor_mode(view, "source");
    expect(get_editor_mode(view.state)).toBe("source");
    expect(view.dom.classList).toContain("md-source-mode");
    expect(view.dom.querySelector(".md-table-widget")).toBeNull();
    expect(view.dom.querySelector(".md-heading")).toBeNull();
    expect(view.contentDOM.textContent).toContain("# Title");
    expect(view.contentDOM.textContent).toContain("**bold**");

    set_editor_mode(view, "rich");
    expect(view.dom.classList).not.toContain("md-source-mode");
    expect(view.dom.querySelector(".md-table-widget")).not.toBeNull();
  });

  test("MODE-002 switching modes keeps the undo history and the selection", () => {
    const note = editor("text‸");
    note.type(" more");
    set_editor_mode(note.view, "source");
    expect(note.source()).toBe("text more‸");
    source_undo(note.view);
    expect(note.saved()).toBe("text");
  });

  test("MODE-003 construct keys stay off in source mode", () => {
    const note = editor("- item‸");
    set_editor_mode(note.view, "source");
    note.press("Enter").type("x");
    // Rich mode would continue the list with "- ".
    expect(note.saved()).toBe("- item\nx");
  });

  test("MODE-003 Backspace deletes one character next to a heading mark", () => {
    const note = editor("# ‸Title");
    set_editor_mode(note.view, "source");
    note.press("Backspace");
    expect(note.saved()).toBe("#Title");
  });
});

describe("plain text files", () => {
  test("MODE-004 a plain text state keeps line endings and undo", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: create_text_state("a: 1\r\nb: 2\r\n"),
    });
    // Text files look like source mode: monospace, no rendering.
    expect(view.dom.classList).toContain("md-source-mode");
    view.dispatch({ changes: { from: 4, insert: "0" } });
    expect(get_markdown_source(view.state)).toBe("a: 10\r\nb: 2\r\n");
    source_undo(view);
    expect(get_markdown_source(view.state)).toBe("a: 1\r\nb: 2\r\n");
    view.destroy();
    parent.remove();
  });
});

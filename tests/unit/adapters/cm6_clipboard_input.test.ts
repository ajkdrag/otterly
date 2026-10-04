/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  create_markdown_state,
  get_markdown_source,
  markdown_editor_extensions,
  source_undo,
  type MarkdownEditorOptions,
} from "../../../packages/markdown_editor/src/index";

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

function open_document(
  source: string,
  options: MarkdownEditorOptions = {},
  readonly = false,
) {
  const view = new EditorView({
    parent: document.body,
    state: create_markdown_state(source, [
      markdown_editor_extensions(options),
      EditorState.readOnly.of(readonly),
    ]),
  });
  views.push(view);
  return view;
}

function paste_source(
  view: EditorView,
  data: Record<string, string>,
  files: File[] = [],
) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => data[type] ?? "",
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
    },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

describe("CM6 clipboard integration", () => {
  it("preserves mixed line endings when pasting and undoing beside rendered blocks", () => {
    const original =
      "\uFEFF# Heading\r\n\r\n| Left | Right |\r| --- | --- |\n| one | two |\r\n\r\n~~~js extra\r\nconst n = 1;\r\n~~~\n\nEnd";
    const view = open_document(original);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const inserted = "\r\n**Bold**\r_Italic_\n";
    expect(
      paste_source(view, { "text/plain": inserted }).defaultPrevented,
    ).toBe(true);
    expect(get_markdown_source(view.state)).toBe(original + inserted);
    expect(source_undo(view)).toBe(true);
    expect(get_markdown_source(view.state)).toBe(original);
  });

  it("prefers Markdown clipboard source over converted HTML", () => {
    const convert = vi.fn(() => "converted");
    const view = open_document("", { html_to_markdown: convert });
    paste_source(view, {
      "text/markdown": "_original_",
      "text/plain": "original",
      "text/html": "<em>original</em>",
    });
    expect(get_markdown_source(view.state)).toBe("_original_");
    expect(convert).not.toHaveBeenCalled();
  });

  it("converts only the pasted fragment and falls back to plain text on conversion failure", () => {
    const convert = vi
      .fn()
      .mockReturnValueOnce("**pasted**")
      .mockImplementationOnce(() => {
        throw new Error("invalid fragment");
      });
    const original = "[label][id]\r\n\r\n[id]: /unchanged\r\n\r\n";
    const view = open_document(original, { html_to_markdown: convert });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    paste_source(view, {
      "text/plain": "pasted",
      "text/html": "<b>pasted</b>",
    });
    expect(get_markdown_source(view.state)).toBe(original + "**pasted**");
    paste_source(view, { "text/plain": " fallback", "text/html": "<broken>" });
    expect(get_markdown_source(view.state)).toBe(
      original + "**pasted** fallback",
    );
  });

  it("keeps clipboard text literal in inline code and frontmatter", () => {
    const convert = vi.fn(() => "**converted**");
    const image = vi.fn();
    for (const source of ["---\nname: value\n---\n", "`value`"]) {
      const view = open_document(source, {
        html_to_markdown: convert,
        on_image_paste: image,
      });
      const position = source.indexOf("value") + 2;
      view.dispatch({ selection: { anchor: position } });
      paste_source(
        view,
        {
          "text/plain": "plain",
          "text/markdown": "**rich**",
          "text/html": "<b>rich</b>",
        },
        [new File(["image"], "image.png", { type: "image/png" })],
      );
      expect(get_markdown_source(view.state)).toBe(
        source.slice(0, position) + "plain" + source.slice(position),
      );
    }
    expect(convert).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
  });

  it("hands image files to the host without changing the document", () => {
    const image = vi.fn();
    const view = open_document("original", { on_image_paste: image });
    const file = new File(["image"], "image.png", { type: "image/png" });
    expect(
      paste_source(view, { "text/plain": "ignored" }, [file]).defaultPrevented,
    ).toBe(true);
    expect(image).toHaveBeenCalledWith(file);
    expect(get_markdown_source(view.state)).toBe("original");
  });

  it("does not change a read-only document or invoke host clipboard handlers", () => {
    const image = vi.fn();
    const convert = vi.fn();
    const view = open_document(
      "original",
      { on_image_paste: image, html_to_markdown: convert },
      true,
    );
    paste_source(
      view,
      { "text/plain": "changed", "text/html": "<b>changed</b>" },
      [new File(["image"], "image.png", { type: "image/png" })],
    );
    expect(get_markdown_source(view.state)).toBe("original");
    expect(image).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
  });
});

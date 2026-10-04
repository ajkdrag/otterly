/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import {
  clipboard,
  type MarkdownClipboardOptions,
} from "../src/plugins/clipboard";
import { source_redo, source_undo } from "../src/core/source_state";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(destroy_test_editors);

function editor(source: string, options: MarkdownClipboardOptions = {}) {
  return test_editor(source, [
    commonmark(),
    gfm(),
    code_blocks(),
    frontmatter(),
    clipboard(options),
  ]);
}

// Dispatches a real paste event. `target` is the DOM element that receives it.
function paste(
  target: HTMLElement,
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
  target.dispatchEvent(event);
  return event;
}

const paste_into = (
  view: TestEditor,
  data: Record<string, string>,
  files: File[] = [],
) => paste(view.view.contentDOM, data, files);

const png = () => new File(["image"], "image.png", { type: "image/png" });

describe("clipboard", () => {
  test("CLIP-001 explicit Markdown wins over HTML and plain text, and is not converted again", () => {
    const html_to_markdown = vi.fn(() => "converted");
    const view = editor("‸", { html_to_markdown });
    const event = paste_into(view, {
      "text/markdown": "_original_",
      "text/plain": "original",
      "text/html": "<em>original</em>",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(view.saved()).toBe("_original_");
    expect(html_to_markdown).not.toHaveBeenCalled();
  });

  test("CLIP-002 HTML is converted through the host with the plain text as fallback input", () => {
    const html_to_markdown = vi.fn(
      (html: string, plain: string) =>
        `**${plain}**:${html.length > 0 ? "html" : ""}`,
    );
    const view = editor("‸", { html_to_markdown });
    paste_into(view, { "text/plain": "bold", "text/html": "<b>bold</b>" });
    expect(html_to_markdown).toHaveBeenCalledWith("<b>bold</b>", "bold");
    expect(view.saved()).toBe("**bold**:html");
  });

  test("CLIP-002 only the pasted fragment changes, and the rest of the note keeps its bytes", () => {
    const original = "[label][id]\r\n\r\n[id]: /unchanged\r\n\r\n";
    const view = editor(original + "‸", {
      html_to_markdown: () => "**pasted**",
    });
    paste_into(view, { "text/plain": "pasted", "text/html": "<b>pasted</b>" });
    expect(view.saved()).toBe(original + "**pasted**");
  });

  test("CLIP-002 a failing conversion falls back to the plain text", () => {
    const html_to_markdown = vi.fn(() => {
      throw new Error("invalid fragment");
    });
    const view = editor("start ‸", { html_to_markdown });
    const event = paste_into(view, {
      "text/plain": "fallback",
      "text/html": "<broken>",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(view.saved()).toBe("start fallback");
  });

  test("CLIP-002 plain text is pasted unchanged when the host has no converter", () => {
    const view = editor("‸");
    paste_into(view, {
      "text/plain": "a **b**",
      "text/html": "<b>ignored</b>",
    });
    expect(view.saved()).toBe("a **b**");
  });

  test("CLIP-003 inline code receives plain text, not Markdown, HTML, or images", () => {
    const html_to_markdown = vi.fn(() => "**converted**");
    const on_image_paste = vi.fn();
    const view = editor("`val‸ue`", { html_to_markdown, on_image_paste });
    paste_into(
      view,
      {
        "text/plain": "plain",
        "text/markdown": "**rich**",
        "text/html": "<b>rich</b>",
      },
      [png()],
    );
    expect(view.saved()).toBe("`valplainue`");
    expect(html_to_markdown).not.toHaveBeenCalled();
    expect(on_image_paste).not.toHaveBeenCalled();
  });

  test("CLIP-003 frontmatter receives plain text, not Markdown, HTML, or images", () => {
    const html_to_markdown = vi.fn(() => "**converted**");
    const on_image_paste = vi.fn();
    const view = editor("---\nname: va‸lue\n---\n", {
      html_to_markdown,
      on_image_paste,
    });
    paste_into(
      view,
      {
        "text/plain": "plain",
        "text/markdown": "**rich**",
        "text/html": "<b>rich</b>",
      },
      [png()],
    );
    expect(view.saved()).toBe("---\nname: vaplainlue\n---\n");
    expect(html_to_markdown).not.toHaveBeenCalled();
    expect(on_image_paste).not.toHaveBeenCalled();
  });

  test("CLIP-003 a fenced code body receives plain text and no conversion runs", () => {
    const html_to_markdown = vi.fn(() => "**converted**");
    const on_image_paste = vi.fn();
    const view = editor("```js\nlet a‸\n```", {
      html_to_markdown,
      on_image_paste,
    });
    const body = view.view.dom.querySelector<HTMLElement>(
      ".md-code-source .cm-content",
    );
    expect(body).not.toBeNull();
    const surface = EditorView.findFromDOM(
      body?.closest<HTMLElement>(".cm-editor") ?? view.view.dom,
    );
    surface?.focus();
    paste(
      body ?? view.view.contentDOM,
      { "text/plain": " = 1", "text/html": "<b> = 2</b>" },
      [png()],
    );
    expect(view.saved()).toBe("```js\nlet a = 1\n```");
    expect(html_to_markdown).not.toHaveBeenCalled();
    expect(on_image_paste).not.toHaveBeenCalled();
  });

  test("CLIP-003 pasting multiple lines into a quoted fence keeps every line quoted", () => {
    const view = editor("> ```\n> a‸\n> ```");
    const body = view.view.dom.querySelector<HTMLElement>(
      ".md-code-source .cm-content",
    );
    EditorView.findFromDOM(
      body?.closest<HTMLElement>(".cm-editor") ?? view.view.dom,
    )?.focus();
    paste(body ?? view.view.contentDOM, { "text/plain": "\nb" });
    expect(view.saved()).toBe("> ```\n> a\n> b\n> ```");
  });

  test("CLIP-006 an image file goes to the host and the note is untouched", () => {
    const on_image_paste = vi.fn();
    const view = editor("original‸", { on_image_paste });
    const file = png();
    const event = paste_into(view, { "text/plain": "ignored" }, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(on_image_paste).toHaveBeenCalledWith(file);
    expect(view.saved()).toBe("original");
  });

  test("CLIP-006 non-image files do not reach the image handler and plain text still pastes", () => {
    const on_image_paste = vi.fn();
    const view = editor("‸", { on_image_paste });
    paste_into(view, { "text/plain": "text" }, [
      new File(["pdf"], "a.pdf", { type: "application/pdf" }),
    ]);
    expect(on_image_paste).not.toHaveBeenCalled();
    expect(view.saved()).toBe("text");
  });

  test("CLIP-003 a read-only note ignores the paste and calls no host handler", () => {
    const html_to_markdown = vi.fn();
    const on_image_paste = vi.fn();
    const read_only = test_editor("original‸", [
      commonmark(),
      { name: "read_only", extensions: [EditorState.readOnly.of(true)] },
      clipboard({ html_to_markdown, on_image_paste }),
    ]);
    paste_into(
      read_only,
      { "text/plain": "changed", "text/html": "<b>changed</b>" },
      [png()],
    );
    expect(read_only.saved()).toBe("original");
    expect(html_to_markdown).not.toHaveBeenCalled();
    expect(on_image_paste).not.toHaveBeenCalled();
  });

  test("CLIP-005 Undo and Redo restore exact bytes around a multiline paste with mixed line endings", () => {
    const original =
      "﻿# Heading\r\n\r\n| Left | Right |\r| --- | --- |\n| one | two |\r\n\r\n~~~js extra\r\nconst n = 1;\r\n~~~\n\nEnd";
    const view = editor(original + "‸");
    const inserted = "\r\n**Bold**\r_Italic_\n";
    paste_into(view, { "text/plain": inserted });
    expect(view.saved()).toBe(original + inserted);
    expect(source_undo(view.view)).toBe(true);
    expect(view.saved()).toBe(original);
    expect(source_redo(view.view)).toBe(true);
    expect(view.saved()).toBe(original + inserted);
  });

  test("CLIP-005 a paste is its own Undo step, separate from the typing before it", () => {
    const view = editor("‸");
    view.type("typed ");
    paste_into(view, { "text/plain": "pasted" });
    expect(view.saved()).toBe("typed pasted");
    source_undo(view.view);
    expect(view.saved()).toBe("typed ");
  });

  test("CLIP-005 Undo puts the caret back where it was before the paste", () => {
    const view = editor("ab‸cd");
    paste_into(view, { "text/plain": "XYZ" });
    expect(view.source()).toBe("abXYZ‸cd");
    source_undo(view.view);
    expect(view.source()).toBe("ab‸cd");
  });

  test("CLIP-001 pasting over a selection replaces only the selection", () => {
    const view = editor("one ‹two‸ three");
    paste_into(view, { "text/plain": "2" });
    expect(view.saved()).toBe("one 2 three");
  });

  test("CLIP-006 an empty clipboard changes nothing", () => {
    const view = editor("keep‸");
    paste_into(view, {});
    expect(view.saved()).toBe("keep");
  });
});

/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cursorCharLeft, cursorCharRight } from "@codemirror/commands";
import { forceParsing } from "@codemirror/language";
import { link_rendering } from "../../../packages/markdown_editor/src/link_rendering";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_markdown(source: string, read_only = false) {
  const open_link = vi.fn();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      extensions: [
        markdown_language(),
        link_rendering({ open_link }),
        ...(read_only ? [EditorState.readOnly.of(true)] : []),
      ],
    }),
  });
  views.push(view);
  forceParsing(view, view.state.doc.length, 100);
  return { view, open_link };
}

describe("CM6 link rendering", () => {
  it.each(["[[Wiki]]", "[Label](note.md)"])(
    "enters a rendered text link with plain arrows: %s",
    (link) => {
      const source = "before " + link + " after";
      const { view } = open_markdown(source);
      const from = "before ".length;
      const to = from + link.length;
      view.dispatch({ selection: { anchor: from } });
      expect(cursorCharRight(view)).toBe(true);
      expect(view.state.selection.main.head).toBe(from + 1);
      expect(view.contentDOM.querySelector("[data-md-link-target]")).toBeNull();
      expect(cursorCharLeft(view)).toBe(true);
      expect(
        view.contentDOM.querySelector("[data-md-link-target]"),
      ).not.toBeNull();
      view.dispatch({ selection: { anchor: to } });
      expect(cursorCharLeft(view)).toBe(true);
      expect(view.state.selection.main.head).toBe(to - 1);
      expect(view.contentDOM.querySelector("[data-md-link-target]")).toBeNull();
      expect(view.state.doc.toString()).toBe(source);
    },
  );
  it("keeps neighboring links rendered on the caret's line", () => {
    const source = "plain [[Wiki note]] and [Label](note.md) end";
    const { view } = open_markdown(source);
    const labels = () =>
      [...view.contentDOM.querySelectorAll("[data-md-link-target]")].map(
        (el) => el.textContent,
      );
    expect(labels()).toEqual(["Wiki note", "Label"]);
    view.dispatch({ selection: { anchor: source.indexOf("Wiki") + 1 } });
    expect(labels()).toEqual(["Label"]);
    view.dispatch({ selection: { anchor: source.indexOf("Label") + 1 } });
    expect(labels()).toEqual(["Wiki note"]);
    for (const anchor of [source.indexOf("[["), source.indexOf("]]") + 2]) {
      view.dispatch({ selection: { anchor } });
      expect(labels()).toEqual(["Wiki note", "Label"]);
    }
    view.dispatch({ selection: { anchor: 0, head: source.length } });
    expect(labels()).toEqual(["Wiki note", "Label"]);
    expect(view.state.doc.toString()).toBe(source);
  });
  it("renders bare GFM URLs on inactive lines", () => {
    const { view } = open_markdown("cursor\n\nhttps://example.com/path\n");
    expect(
      view.dom.querySelector<HTMLElement>("[data-md-link-target]")?.dataset
        .mdLinkTarget,
    ).toBe("https://example.com/path");
  });
  it("preserves literal punctuation and decodes escapes in link labels and targets", () => {
    const { view } = open_markdown(
      "cursor\n\n[a_b ~ c &amp; d](path\\(1\\).md)\n",
    );
    const link = view.dom.querySelector<HTMLElement>("[data-md-link-target]");
    expect(link?.textContent).toBe("a_b ~ c & d");
    expect(link?.dataset.mdLinkTarget).toBe("path(1).md");
  });

  it("resolves collapsed and shortcut references using the first definition", () => {
    const { view } = open_markdown(
      "cursor\n\n[Name][] [Name]\n\n[Name]: first.md\n[Name]: second.md\n",
    );
    expect(
      [...view.dom.querySelectorAll<HTMLElement>("[data-md-link-target]")].map(
        (link) => link.dataset.mdLinkTarget,
      ),
    ).toEqual(["first.md", "first.md"]);
  });
  it("renders inline, reference, autolinks, and wiki aliases without changing source", () => {
    const source =
      "cursor\n\n[Inline](../note.md#Heading) and [Reference][docs]\n\n<https://example.com/path> [[folder/note#Part|Alias]]\n\n[docs]: https://example.org/docs\n";
    const { view } = open_markdown(source);

    expect(
      [...view.dom.querySelectorAll("[data-md-link-target]")].map((node) => [
        node.textContent,
        (node as HTMLElement).dataset.mdLinkTarget,
      ]),
    ).toEqual([
      ["Inline", "../note.md#Heading"],
      ["Reference", "https://example.org/docs"],
      ["https://example.com/path", "https://example.com/path"],
      ["Alias", "folder/note.md#Part"],
    ]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("reveals source inside the active link and renders it again when the caret leaves", () => {
    const source = "cursor\n\n[Label](note.md)\n";
    const { view } = open_markdown(source);
    expect(view.dom.querySelector("[data-md-link-target]")).not.toBeNull();

    view.dispatch({ selection: { anchor: source.indexOf("Label") } });
    expect(view.dom.querySelector("[data-md-link-target]")).toBeNull();
    expect(view.dom.textContent).toContain("[Label](note.md)");

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector("[data-md-link-target]")?.textContent).toBe(
      "Label",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("does not render link-like text in frontmatter, inline code, or fenced code", () => {
    const source =
      "---\nurl: https://frontmatter.test\n---\n\n`[code](code.md)`\n\n```md\n[code](fence.md)\n```\n\n[real](real.md)\n";
    const { view } = open_markdown(source);
    expect(
      [...view.dom.querySelectorAll("[data-md-link-target]")].map(
        (node) => (node as HTMLElement).dataset.mdLinkTarget,
      ),
    ).toEqual(["real.md"]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("opens a rendered link by plain click or Enter, but leaves modified clicks alone", () => {
    const { view, open_link } = open_markdown(
      "cursor\n\n[Label](https://example.com)\n",
    );
    const link = view.dom.querySelector<HTMLElement>("[data-md-link-target]");
    if (!link) throw new Error("Expected rendered link");

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("https://example.com");
    link.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    expect(open_link).toHaveBeenCalledTimes(2);

    const modified = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      ctrlKey: true,
      cancelable: true,
    });
    link.dispatchEvent(modified);
    expect(open_link).toHaveBeenCalledTimes(2);
    expect(modified.defaultPrevented).toBe(false);
  });

  it("keeps rendered link semantics and navigation in read-only mode", () => {
    const { view, open_link } = open_markdown(
      "cursor\n\n[Label](note.md)\n",
      true,
    );
    const link = view.dom.querySelector<HTMLElement>("[data-md-link-target]");
    expect(link?.getAttribute("role")).toBe("link");
    expect(link?.getAttribute("aria-label")).toBe("Open Label");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(open_link).toHaveBeenCalledWith("note.md");
    expect(view.state.doc.toString()).toBe("cursor\n\n[Label](note.md)\n");
  });
});

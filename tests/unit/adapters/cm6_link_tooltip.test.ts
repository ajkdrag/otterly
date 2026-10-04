/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { forceParsing } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { link_tooltip } from "../../../packages/markdown_editor/src/link_tooltip";
import { link_rendering } from "../../../packages/markdown_editor/src/link_rendering";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function open_editor(source: string, read_only = false, edit_key?: string) {
  const opened: string[] = [];
  const copied: string[] = [];
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      extensions: [
        markdown_language(),
        link_tooltip({
          open_link: (target) => {
            opened.push(target);
          },
          copy_link: (target) => {
            copied.push(target);
          },
          ...(edit_key ? { edit_key } : {}),
        }),
        link_rendering({
          open_link: (target) => {
            opened.push(target);
          },
        }),
        ...(read_only ? [EditorState.readOnly.of(true)] : []),
      ],
    }),
  });
  views.push(view);
  forceParsing(view, view.state.doc.length, 100);
  return { view, opened, copied };
}

function start_edit(view: EditorView, source: string, text: string) {
  view.dispatch({ selection: { anchor: source.indexOf(text) + 1 } });
  view.focus();
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      key: "k",
      ctrlKey: true,
    }),
  );
  const dialog = view.dom.querySelector<HTMLElement>(".cm-link-tooltip--edit");
  if (!dialog) throw new Error("Mod-K did not open the link editor");
  return dialog;
}

describe("CM6 link tooltip", () => {
  it("shows keyboard-accessible actions and opens editing with the configured key", () => {
    const source = "cursor\n\n[label](note.md)";
    const { view } = open_editor(source, false, "Alt-Enter");
    const link = view.dom.querySelector<HTMLElement>("[data-md-link-target]");
    if (!link) throw new Error("Expected rendered link");
    link.focus();

    const preview = view.dom.querySelector<HTMLElement>(
      ".cm-link-tooltip--preview",
    );
    expect(preview).not.toBeNull();
    const edit_action = [...(preview?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Edit",
    );
    expect(edit_action?.title).toBe("Edit link (Alt+Enter)");
    expect(edit_action?.getAttribute("aria-keyshortcuts")).toBe("Alt+Enter");
    expect(
      [
        ...(preview?.querySelectorAll(".cm-link-tooltip__preview button") ??
          []),
      ].map((button) => button.textContent),
    ).toEqual(["Copy", "Open", "Edit", "Remove"]);
    expect(
      preview
        ?.querySelector(".cm-link-tooltip__action--copy svg")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).not.toBeNull();
  });

  it("edits an inline destination without changing angle or title syntax", () => {
    const source = '[label](<https://old.test> "tip")';
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "label");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    const edit_rows = dialog.querySelectorAll(".cm-link-tooltip__edit-row");
    expect(edit_rows).toHaveLength(2);
    expect(
      [...dialog.querySelectorAll(".cm-link-tooltip__field-name")].map(
        (name) => name.textContent,
      ),
    ).toEqual(["Text", "Link"]);
    expect(
      edit_rows[1]?.querySelector(".cm-link-tooltip__action--save svg"),
    ).not.toBeNull();
    target.value = "https://new.test/path";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(
      '[label](<https://new.test/path> "tip")',
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).toBeNull();
  });

  it("edits the outer destination of a linked image without touching the image source", () => {
    const source = "[![Alt](image.png)](target.md)";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "target");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    target.value = "new-target.md";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(
      "[![Alt](image.png)](new-target.md)",
    );
  });

  it("edits a reference occurrence by converting only that occurrence to inline", () => {
    const source =
      '[first][ref] and [second][ref]\n\n[ref]: https://old.test "title"';
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "first");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    target.value = "https://new.test";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(
      '[first](https://new.test "title") and [second][ref]\n\n[ref]: https://old.test "title"',
    );
  });

  it("keeps wiki syntax and leaves a no-op edit byte-for-byte unchanged", () => {
    const source = "[[pages/Topic#Section|Shown]]";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "Topic");
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(source);

    const next_dialog = start_edit(view, source, "Topic");
    const target = next_dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    target.value = "pages/Other#Section";
    next_dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe("[[pages/Other#Section|Shown]]");
  });

  it("writes wiki targets as wiki text when the target contains spaces", () => {
    const source = "[[pages/Topic|Shown]]";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "Topic");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    target.value = "pages/New note";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe("[[pages/New note|Shown]]");
  });

  it.each(["[implicit]", "[visible][]"])(
    "resolves and preserves the destination when editing a shortcut reference %s",
    (source_link) => {
      const label = source_link.includes("visible") ? "visible" : "implicit";
      const source = `${source_link}\n\n[${label}]: https://destination.test "title"`;
      const { view } = open_editor(source);
      const dialog = start_edit(view, source, label);
      const text = dialog.querySelector<HTMLInputElement>(
        'input[aria-label="Text"]',
      );
      if (!text) throw new Error("Missing text input");
      text.value = "changed";
      dialog.querySelector<HTMLButtonElement>("button")?.click();
      expect(view.state.doc.toString()).toBe(
        `[changed](https://destination.test "title")\n\n[${label}]: https://destination.test "title"`,
      );
    },
  );

  it("escapes a changed Markdown label without changing the target", () => {
    const source = '[label](https://example.test "title")';
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "label");
    const text = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Text"]',
    );
    if (!text) throw new Error("Missing text input");
    text.value = "shown] label";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(
      '[shown\\] label](https://example.test "title")',
    );
  });

  it("escapes opening brackets in edited Markdown labels", () => {
    const source = "[label](https://example.test)";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "label");
    const text = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Text"]',
    );
    if (!text) throw new Error("Missing text input");
    text.value = "shown[ label";
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(
      "[shown\\[ label](https://example.test)",
    );
  });

  it.each([
    ["https://example.test/a)b", "[label](<https://example.test/a)b>)"],
    ["https://example.test/a<b>", "[label](<https://example.test/a%3Cb%3E>)"],
  ])("writes a safe inline destination for %s", (target_value, expected) => {
    const source = "[label](https://old.test)";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "label");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    target.value = target_value;
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(view.state.doc.toString()).toBe(expected);
  });

  it.each([
    ["image", "![image](https://example.test)"],
    ["inline code", "`[label](https://example.test)`"],
    ["fenced code", "```md\n[label](https://example.test)\n```"],
    ["frontmatter", "---\nurl: https://example.test\n---\nbody"],
    ["reference definition", "[ref]: https://example.test"],
  ])("does not open Mod-K for %s", (_kind, source) => {
    const { view } = open_editor(source);
    const target = source.indexOf("https://example.test");
    const selection = target >= 0 ? target + 2 : source.indexOf("image") + 2;
    view.dispatch({ selection: { anchor: selection } });
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "k",
        ctrlKey: true,
      }),
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).toBeNull();
  });

  it("keeps the target field available when the text field is disabled", () => {
    const source = "https://example.test";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "example");
    const target = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Link"]',
    );
    if (!target) throw new Error("Missing link input");
    expect(target.disabled).toBe(false);
    expect(
      dialog.querySelector<HTMLInputElement>('input[aria-label="Text"]')
        ?.disabled,
    ).toBe(true);
  });

  it("closes the editor when the pointer lands outside it", () => {
    const source = "intro\n[label](https://example.test)";
    const { view } = open_editor(source);
    start_edit(view, source, "label");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).toBeNull();
  });

  it("returns focus to the editor after cancel", () => {
    const source = "[label](https://example.test)";
    const { view } = open_editor(source);
    const dialog = start_edit(view, source, "label");
    const cancel = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    cancel?.click();
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it("does not expose edit or remove actions in read-only mode", () => {
    const source = "[label](https://example.test)";
    const { view } = open_editor(source, true);
    view.dispatch({ selection: { anchor: source.indexOf("label") + 1 } });
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "k",
        ctrlKey: true,
      }),
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("shows hover actions for rendered links and delegates open/copy/remove", async () => {
    vi.useFakeTimers();
    const source = "intro\n[label](https://example.test)";
    const opened: string[] = [];
    const copied: string[] = [];
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          link_rendering({
            open_link: (target) => {
              opened.push(target);
            },
          }),
          link_tooltip({
            open_link: (target) => {
              opened.push(target);
            },
            copy_link: (target) => {
              copied.push(target);
            },
          }),
        ],
      }),
    });
    views.push(view);
    forceParsing(view, view.state.doc.length, 100);
    const link = view.dom.querySelector<HTMLElement>(".md-link-rendered");
    if (!link) throw new Error("Expected the inactive link widget");
    link.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
    );
    await vi.advanceTimersByTimeAsync(249);
    expect(view.dom.querySelector(".cm-link-tooltip--preview")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    const preview = view.dom.querySelector<HTMLElement>(
      ".cm-link-tooltip--preview",
    );
    if (!preview) throw new Error("Expected the hover preview");
    const buttons = [...preview.querySelectorAll("button")];
    const action = (name: string) => {
      const button = buttons.find((item) => item.textContent === name);
      if (!button) throw new Error(`Missing ${name} action`);
      button.click();
    };
    action("Open");
    action("Copy");
    expect(opened).toEqual(["https://example.test"]);
    expect(copied).toEqual(["https://example.test"]);
    action("Remove");
    expect(view.state.doc.toString()).toBe("intro\nlabel");
  });

  it("replaces the hover preview with edit and keeps hover closed while editing", async () => {
    vi.useFakeTimers();
    const source = "intro\n[label](https://example.test)";
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          link_rendering({ open_link: () => {} }),
          link_tooltip({ open_link: () => {} }),
        ],
      }),
    });
    views.push(view);
    forceParsing(view, view.state.doc.length, 100);
    const link = view.dom.querySelector<HTMLElement>(".md-link-rendered");
    if (!link) throw new Error("Expected the inactive link widget");
    const move_over_link = () =>
      link.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 2,
          clientY: 2,
        }),
      );
    move_over_link();
    await vi.advanceTimersByTimeAsync(250);
    const preview = view.dom.querySelector<HTMLElement>(
      ".cm-link-tooltip--preview",
    );
    if (!preview) throw new Error("Expected the hover preview");
    preview
      .querySelector<HTMLButtonElement>(".cm-link-tooltip__action--edit")
      ?.click();
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).not.toBeNull();
    expect(view.dom.querySelector(".cm-link-tooltip--preview")).toBeNull();

    move_over_link();
    await vi.advanceTimersByTimeAsync(350);
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).not.toBeNull();
    expect(view.dom.querySelector(".cm-link-tooltip--preview")).toBeNull();
    expect(view.dom.querySelector(".cm-tooltip-arrow")).toBeNull();
  });

  it("closes an active hover preview when Mod-K opens the editor", async () => {
    vi.useFakeTimers();
    const source = "intro\n[label](https://example.test)";
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          link_rendering({ open_link: () => {} }),
          link_tooltip({ open_link: () => {} }),
        ],
      }),
    });
    views.push(view);
    forceParsing(view, view.state.doc.length, 100);
    const link = view.dom.querySelector<HTMLElement>(".md-link-rendered");
    if (!link) throw new Error("Expected the inactive link widget");
    link.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 2,
        clientY: 2,
      }),
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(view.dom.querySelector(".cm-link-tooltip--preview")).not.toBeNull();
    view.dispatch({ selection: { anchor: source.indexOf("label") + 1 } });
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.dom.querySelector(".cm-link-tooltip--edit")).not.toBeNull();
    expect(view.dom.querySelector(".cm-link-tooltip--preview")).toBeNull();
  });

  it("reports a rejected asynchronous copy without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const source = "intro\n[label](https://example.test)";
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          link_rendering({ open_link: () => {} }),
          link_tooltip({
            open_link: () => {},
            copy_link: () => Promise.reject(new Error("clipboard unavailable")),
          }),
        ],
      }),
    });
    views.push(view);
    forceParsing(view, view.state.doc.length, 100);
    view.dom
      .querySelector<HTMLElement>(".md-link-rendered")
      ?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    const preview = view.dom.querySelector<HTMLElement>(
      ".cm-link-tooltip--preview",
    );
    if (!preview) throw new Error("Expected the hover preview");
    [...preview.querySelectorAll("button")]
      .find((button) => button.textContent === "Copy")
      ?.click();
    await Promise.resolve();
    expect(preview.querySelector('[role="status"]')?.textContent).toBe(
      "Could not copy link.",
    );
  });

  it("omits Copy when the host does not provide clipboard support", () => {
    const source = "cursor\n\n[label](https://example.test)";
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown_language(),
          link_rendering({ open_link: () => {} }),
          link_tooltip({ open_link: () => {} }),
        ],
      }),
    });
    views.push(view);
    forceParsing(view, view.state.doc.length, 100);
    view.dom.querySelector<HTMLElement>(".md-link-rendered")?.focus();
    const preview = view.dom.querySelector<HTMLElement>(
      ".cm-link-tooltip--preview",
    );
    if (!preview) throw new Error("Expected the focused link preview");
    expect(preview.querySelector(".cm-link-tooltip__action--copy")).toBeNull();
    expect(
      [
        ...(preview?.querySelectorAll(".cm-link-tooltip__action-label") ?? []),
      ].map((label) => label.textContent),
    ).toEqual(["Open", "Edit", "Remove"]);
  });
});

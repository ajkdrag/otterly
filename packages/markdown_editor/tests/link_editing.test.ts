/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { commonmark } from "../src/plugins/commonmark/index";
import { code_blocks } from "../src/plugins/code_blocks/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { images } from "../src/plugins/images/index";
import { links } from "../src/plugins/links/index";
import { wiki_links } from "../src/plugins/wiki_links/index";
import { source_undo } from "../src/core/source_state";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(destroy_test_editors);

function editor(
  source: string,
  extra: readonly { name: string; extensions: unknown }[] = [],
) {
  return test_editor(source, [
    commonmark(),
    code_blocks(),
    frontmatter(),
    images({ resolve_image: () => Promise.resolve("") }),
    links({ open_link: () => {} }),
    wiki_links(),
    ...(extra as never[]),
  ]);
}

const read_only = {
  name: "read_only",
  extensions: EditorState.readOnly.of(true),
};

function edit_dialog(view: TestEditor) {
  view.press("Mod-k");
  const dialog = view.view.dom.querySelector<HTMLElement>(
    ".cm-link-tooltip--edit",
  );
  if (!dialog) throw new Error("Mod-k did not open the link editor");
  return dialog;
}

function input(dialog: HTMLElement, name: "Text" | "Link") {
  const field = dialog.querySelector<HTMLInputElement>(
    `input[aria-label="${name}"]`,
  );
  if (!field) throw new Error(`Missing ${name} field`);
  return field;
}

function click(dialog: HTMLElement, label: string) {
  const button = [...dialog.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Missing ${label} button`);
  button.click();
}

function save_link(view: TestEditor, text: string | null, link: string | null) {
  const dialog = edit_dialog(view);
  if (text !== null) input(dialog, "Text").value = text;
  if (link !== null) input(dialog, "Link").value = link;
  click(dialog, "Save");
}

const edit_tooltip = (view: TestEditor) =>
  view.view.dom.querySelector(".cm-link-tooltip--edit");

describe("link editor", () => {
  test("LINK-005 Mod-k on a link opens the editor filled with its text and destination", () => {
    const view = editor("see [lab‸el](note.md) here");
    const dialog = edit_dialog(view);
    expect(input(dialog, "Text").value).toBe("label");
    expect(input(dialog, "Link").value).toBe("note.md");
  });

  test("LINK-005 Save changes only the edited link and closes the editor", () => {
    const view = editor("[one](a.md) and [t‸wo](b.md) and [three](c.md)");
    save_link(view, null, "new.md");
    expect(view.saved()).toBe(
      "[one](a.md) and [two](new.md) and [three](c.md)",
    );
    expect(edit_tooltip(view)).toBeNull();
  });

  test("LINK-005 Enter in a field saves, Escape cancels and returns focus to the editor", () => {
    const view = editor("[la‸bel](old.md)");
    const dialog = edit_dialog(view);
    input(dialog, "Link").value = "typed.md";
    input(dialog, "Link").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(edit_tooltip(view)).toBeNull();
    expect(view.saved()).toBe("[label](old.md)");
    expect(document.activeElement).toBe(view.view.contentDOM);

    const second = edit_dialog(view);
    input(second, "Link").value = "typed.md";
    input(second, "Link").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.saved()).toBe("[label](typed.md)");
  });

  test("LINK-005 Cancel leaves the source exact and returns focus to the editor", () => {
    const view = editor("[la‸bel](old.md)");
    const dialog = edit_dialog(view);
    input(dialog, "Text").value = "changed";
    click(dialog, "Cancel");
    expect(view.saved()).toBe("[label](old.md)");
    expect(document.activeElement).toBe(view.view.contentDOM);
  });

  test("LINK-005 clicking outside closes the editor without applying partial values", () => {
    const view = editor("intro\n\n[la‸bel](old.md)");
    const dialog = edit_dialog(view);
    input(dialog, "Link").value = "half-typed";
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(edit_tooltip(view)).toBeNull();
    expect(view.saved()).toBe("intro\n\n[label](old.md)");
  });

  test("LINK-006 Save without changes leaves exact bytes, and Undo restores an edit exactly", () => {
    const original = '[la‸bel](<https://old.test> "tip")';
    const view = editor(original);
    const source = view.saved();
    save_link(view, null, null);
    expect(view.saved()).toBe(source);

    save_link(view, null, "https://new.test/path");
    expect(view.saved()).toBe('[label](<https://new.test/path> "tip")');
    source_undo(view.view);
    expect(view.saved()).toBe(source);
  });

  test.each([
    ["shown] label", "[shown\\] label](https://example.test)"],
    ["shown[ label", "[shown\\[ label](https://example.test)"],
  ])(
    "LINK-006 label %s is escaped and the destination is untouched",
    (label, expected) => {
      const view = editor("[la‸bel](https://example.test)");
      save_link(view, label, null);
      expect(view.saved()).toBe(expected);
    },
  );

  test.each([
    ["https://example.test/a)b", "[label](<https://example.test/a)b>)"],
    ["https://example.test/a<b>", "[label](<https://example.test/a%3Cb%3E>)"],
  ])(
    "LINK-006 destination %s is written so it stays one link",
    (destination, expected) => {
      const view = editor("[la‸bel](https://old.test)");
      save_link(view, null, destination);
      expect(view.saved()).toBe(expected);
    },
  );

  test("LINK-007 editing one reference occurrence turns only that one inline", () => {
    const source =
      '[fi‸rst][ref] and [second][ref]\n\n[ref]: https://old.test "title"';
    const view = editor(source);
    save_link(view, null, "https://new.test");
    expect(view.saved()).toBe(
      '[first](https://new.test "title") and [second][ref]\n\n[ref]: https://old.test "title"',
    );
  });

  test.each([
    ["implicit", "[impl‸icit]"],
    ["visible", "[vis‸ible][]"],
  ])(
    "LINK-007 editing the text of shortcut reference %s keeps the resolved destination",
    (label, link) => {
      const definition = `[${label}]: https://destination.test "title"`;
      const view = editor(`${link}\n\n${definition}`);
      save_link(view, "changed", null);
      expect(view.saved()).toBe(
        `[changed](https://destination.test "title")\n\n${definition}`,
      );
    },
  );

  test("LINK-007 a bare URL disables the text field but its destination stays editable", () => {
    const view = editor("https://exa‸mple.test");
    const dialog = edit_dialog(view);
    expect(input(dialog, "Text").disabled).toBe(true);
    expect(input(dialog, "Link").disabled).toBe(false);
  });

  test("LINK-008 a wiki target keeps its alias and wiki form, and a no-op Save changes nothing", () => {
    const source = "[[pages/To‸pic#Section|Shown]]";
    const view = editor(source);
    const original = view.saved();
    save_link(view, null, null);
    expect(view.saved()).toBe(original);
    save_link(view, null, "pages/Other#Section");
    expect(view.saved()).toBe("[[pages/Other#Section|Shown]]");
  });

  test("LINK-008 a wiki target with spaces stays wiki text", () => {
    const view = editor("[[pages/To‸pic|Shown]]");
    save_link(view, null, "pages/New note");
    expect(view.saved()).toBe("[[pages/New note|Shown]]");
  });

  test("LINK-009 editing the outer destination of a linked image keeps the image source", () => {
    const view = editor("[![Alt](image.png)](tar‸get.md)");
    save_link(view, null, "new-target.md");
    expect(view.saved()).toBe("[![Alt](image.png)](new-target.md)");
  });

  test.each([
    ["a plain image", "![im‸age](https://example.test)"],
    ["inline code", "`[lab‸el](https://example.test)`"],
    ["fenced code", "```md\n[label](https://example.test)\n```\n‸"],
    ["frontmatter", "---\nurl: https://exam‸ple.test\n---\nbody"],
    ["a reference definition", "[ref]: https://exam‸ple.test"],
  ])("LINK-005 Mod-k does not open the editor on %s", (_where, source) => {
    const view = editor(source);
    view.press("Mod-k");
    expect(edit_tooltip(view)).toBeNull();
  });

  test("LINK-010 a read-only note offers no editor", () => {
    const source = "[la‸bel](https://example.test)";
    const view = editor(source, [read_only]);
    view.press("Mod-k");
    expect(edit_tooltip(view)).toBeNull();
    expect(view.saved()).toBe("[label](https://example.test)");
  });
});

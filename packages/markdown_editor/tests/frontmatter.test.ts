/** @vitest-environment jsdom */
import { afterEach, expect, test } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { commonmark } from "../src/plugins/commonmark/index";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { is_literal } from "../src/core/context";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const editor = (source: string) =>
  test_editor(source, [commonmark(), frontmatter()]);

function node_names(source: string) {
  const view = editor(source);
  const names: string[] = [];
  syntaxTree(view.view.state).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

test("SRC-011 closed frontmatter is one literal node, not a rule and a heading", () => {
  const names = node_names("---\ntitle: x\n---\n# Heading");
  expect(names).toContain("Frontmatter");
  expect(names).not.toContain("HorizontalRule");
  expect(names).not.toContain("SetextHeading2");
  expect(names).toContain("ATXHeading1");
});

test("SRC-011 an unclosed opening line stays ordinary Markdown", () => {
  const names = node_names("---\ntitle: x\n\n# Heading");
  expect(names).not.toContain("Frontmatter");
  expect(names).toContain("ATXHeading1");
});

test("SRC-011 a divider later in the note keeps divider behavior", () => {
  expect(node_names("text\n\n---\n\nmore")).toContain("HorizontalRule");
});

test("SRC-011 frontmatter is literal for menus, paste, and formatting", () => {
  const view = editor("---\ntitle: **x**\n---\nbody");
  expect(is_literal(view.view.state, 8)).toBe(true);
  expect(is_literal(view.view.state, "---\ntitle: **x**\n---\nbo".length)).toBe(
    false,
  );
});

test("SRC-011 typing the closing line turns the draft into frontmatter", () => {
  const view = editor("---\ntitle: x\n‸");
  expect(view.view.dom.querySelector(".md-frontmatter")).toBeNull();
  view.type("---");
  expect(view.view.dom.querySelector(".md-frontmatter")).not.toBeNull();
  expect(view.saved()).toBe("---\ntitle: x\n---");
});

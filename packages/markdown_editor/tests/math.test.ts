/** @vitest-environment jsdom */
import { syntaxTree } from "@codemirror/language";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { create_markdown_state } from "../src/core/editor";
import { get_registry } from "../src/core/plugin";
import { get_blocks, is_block_rendered } from "../src/core/block_field";
import { set_editor_mode } from "../src/core/editor_mode";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { math } from "../src/plugins/math/index";
import {
  inline_math_end,
  parse_math_source,
} from "../src/plugins/math/math_syntax";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

// jsdom has no layout, and CodeMirror measures ranges when it draws widgets.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
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
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});
afterEach(() => {
  destroy_test_editors();
  vi.restoreAllMocks();
});

type Request = { tex: string; display: boolean; signal: AbortSignal };

function math_plugin(
  render: (request: Request) => Promise<HTMLElement | null> = ({ tex }) => {
    const element = document.createElement("span");
    element.className = "rendered";
    element.textContent = `<${tex}>`;
    return Promise.resolve(element);
  },
) {
  const requests: Request[] = [];
  const plugin = math({
    render_math: (request) => {
      requests.push(request);
      return render(request);
    },
  });
  return { plugin, requests };
}

function node_names(source: string): string[] {
  const state = create_markdown_state(source, {
    plugins: [commonmark(), gfm(), math_plugin().plugin],
  });
  const names: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "MathBlock" || node.name === "InlineMath")
        names.push(`${node.name}:${source.slice(node.from, node.to)}`);
    },
  });
  return names;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("inline math syntax", () => {
  test.each([
    ["a $x^2$ b", ["InlineMath:$x^2$"]],
    ["$a$ and $b$", ["InlineMath:$a$", "InlineMath:$b$"]],
    ["$$x$$ inline", ["InlineMath:$$x$$"]],
    ["a $x \\$ y$ b", ["InlineMath:$x \\$ y$"]],
    ["price $a*b*c$ text", ["InlineMath:$a*b*c$"]],
  ])("%s", (source, expected) => {
    expect(node_names(source)).toEqual(expected);
  });

  test.each([
    "costs $5 and $10 today",
    "I paid $5, he paid $6.",
    "($5)-($6)",
    "a $ b $ c",
    "an unclosed $x",
    "empty $$ here",
    "escaped \\$x$ stays",
    "two lines $x\ny$",
    "`code $x$`",
  ])("%s is not math", (source) => {
    expect(node_names(source)).toEqual([]);
  });

  test("the closing delimiter must not be followed by a digit", () => {
    expect(inline_math_end("$a$1", 0)).toBe(-1);
    expect(inline_math_end("$a$.", 0)).toBe(3);
  });
});

describe("math block syntax", () => {
  test("a $$ line, its TeX and a closing $$ line are one block", () => {
    expect(node_names("before\n\n$$\na^2\n$$\n\nafter")).toEqual([
      "MathBlock:$$\na^2\n$$",
    ]);
  });

  test("a whole-line $$ formula $$ is a one line block", () => {
    expect(node_names("$$ a^2 $$")).toEqual(["MathBlock:$$ a^2 $$"]);
  });

  test("two formulas on one line stay a paragraph with inline math", () => {
    expect(node_names("$$a$$ and $$b$$")).toEqual([
      "InlineMath:$$a$$",
      "InlineMath:$$b$$",
    ]);
  });

  test("a $$ line right under a paragraph line starts a block", () => {
    expect(node_names("text\n$$\nx\n$$")).toEqual(["MathBlock:$$\nx\n$$"]);
  });

  test("a blank line ends an unclosed block, so the note below is not swallowed", () => {
    expect(node_names("$$\nx\n\n# Heading")).toEqual(["MathBlock:$$\nx"]);
    const state = create_markdown_state("$$\nx\n\n# Heading", {
      plugins: [commonmark(), math_plugin().plugin],
    });
    const names: string[] = [];
    syntaxTree(state).iterate({ enter: (node) => void names.push(node.name) });
    expect(names).toContain("ATXHeading1");
  });

  test("a block in a quote ends where the quote does", () => {
    expect(node_names("> $$\n> x\n> $$\n\nafter $y$")).toEqual([
      "MathBlock:$$\n> x\n> $$",
      "InlineMath:$y$",
    ]);
  });

  test("a block in a list item", () => {
    expect(node_names("- item\n\n  $$\n  x\n  $$\n- next")).toEqual([
      "MathBlock:$$\n  x\n  $$",
    ]);
  });

  test("parse_math_source drops the dollars and any container prefix", () => {
    const tex = (source: string) => parse_math_source(source).tex;
    expect(tex("$$\n> a\n> b\n> $$")).toBe("a\nb");
    expect(tex("> $$ a $$")).toBe("a");
    expect(tex("$x^2$")).toBe("x^2");
    expect(tex("$$x$$")).toBe("x");
    expect(tex("$$\nx")).toBe("x");
  });

  test("only $$ formulas use display style", () => {
    expect(parse_math_source("$x$").display).toBe(false);
    expect(parse_math_source("$$x$$").display).toBe(true);
    expect(parse_math_source("$$\nx\n$$").display).toBe(true);
  });

  test("a lone opening line is not closed", () => {
    const closed = (source: string) => parse_math_source(source).closed;
    expect(closed("$$")).toBe(false);
    expect(closed("$$\nx")).toBe(false);
    expect(closed("$$\nx\n$$")).toBe(true);
    expect(closed("$$ x $$")).toBe(true);
  });
});

describe("inline math rendering", () => {
  test("a formula draws as a widget and hides its source", async () => {
    const { plugin, requests } = math_plugin();
    const editor = test_editor("A $x^2$ b.\n\n‸end", [commonmark(), plugin]);
    await settle();
    const host = editor.view.contentDOM.querySelector(".md-math");
    expect(host?.textContent).toBe("<x^2>");
    expect(editor.view.contentDOM.textContent).not.toContain("$x^2$");
    expect(requests.at(-1)).toMatchObject({ tex: "x^2", display: false });
  });

  test("a caret touching the formula shows its source", async () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A $x^2‸$ b.", [commonmark(), plugin]);
    await settle();
    expect(editor.view.contentDOM.querySelector(".md-math")).toBeNull();
    expect(
      editor.view.contentDOM.querySelector(".md-math-source")?.textContent,
    ).toBe("$x^2$");
    editor.view.dispatch({ selection: { anchor: 0 } });
    expect(editor.view.contentDOM.querySelector(".md-math")).not.toBeNull();
  });

  test("a double dollar formula asks for display math", async () => {
    const { plugin, requests } = math_plugin();
    test_editor("A $$x$$ b.\n\n‸end", [commonmark(), plugin]);
    await settle();
    expect(requests.at(-1)).toMatchObject({ tex: "x", display: true });
  });

  test("a rejected render keeps the source and says why", async () => {
    const { plugin } = math_plugin(() => Promise.reject(new Error("bad tex")));
    const editor = test_editor("A $\\frac$ b.\n\n‸end", [commonmark(), plugin]);
    await settle();
    const host = editor.view.contentDOM.querySelector(".md-math");
    expect(host?.classList.contains("md-math-error")).toBe(true);
    expect(host?.textContent).toBe("\\frac");
    expect(host?.getAttribute("title")).toBe("bad tex");
  });

  test("a formula taken out of the document cancels its render", () => {
    let signal: AbortSignal | undefined;
    const { plugin } = math_plugin((request) => {
      signal = request.signal;
      return new Promise(() => undefined);
    });
    const editor = test_editor("A $x$ b.\n\n‸end", [commonmark(), plugin]);
    expect(signal?.aborted).toBe(false);
    editor.view.dispatch({ changes: { from: 2, to: 5, insert: "" } });
    expect(signal?.aborted).toBe(true);
  });

  test("source mode shows the dollars", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A $x$ b.\n\n‸end", [commonmark(), plugin]);
    set_editor_mode(editor.view, "source");
    expect(editor.view.contentDOM.querySelector(".md-math")).toBeNull();
    expect(editor.view.contentDOM.textContent).toContain("$x$");
  });

  test("a formula in a table cell draws without the cell being edited", async () => {
    const { plugin, requests } = math_plugin();
    const editor = test_editor("‸\n\n| a | b |\n| - | - |\n| $x$ | 2 |", [
      commonmark(),
      gfm(),
      plugin,
    ]);
    await settle();
    expect(requests.some((request) => request.tex === "x")).toBe(true);
    expect(
      editor.view.contentDOM.querySelector(".md-table-widget .md-math")
        ?.textContent,
    ).toBe("<x>");
  });

  test("text typed inside a formula is not saved differently", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A $x‸$ b.", [commonmark(), plugin]);
    editor.type("^2");
    expect(editor.saved()).toBe("A $x^2$ b.");
  });
});

describe("math block rendering", () => {
  const note = "before\n\n$$\na^2 + b^2\n$$\n\n‸after";

  test("a closed block draws as a widget", async () => {
    const { plugin, requests } = math_plugin();
    const editor = test_editor(note, [commonmark(), plugin]);
    await settle();
    const root = editor.view.contentDOM.querySelector(".md-math-block");
    expect(root?.textContent).toBe("<a^2 + b^2>");
    expect(requests.at(-1)).toMatchObject({
      tex: "a^2 + b^2",
      display: true,
    });
    expect(editor.view.contentDOM.textContent).not.toContain("$$");
  });

  test("a caret in the block shows its lines instead of the widget", () => {
    const { plugin } = math_plugin();
    const editor = test_editor(note, [commonmark(), plugin]);
    const at = editor.view.state.doc.toString().indexOf("a^2");
    editor.view.dispatch({ selection: { anchor: at } });
    expect(editor.view.contentDOM.querySelector(".md-math-block")).toBeNull();
    const lines = [
      ...editor.view.contentDOM.querySelectorAll(".md-math-source"),
    ].map((line) => line.textContent);
    expect(lines).toEqual(["$$", "a^2 + b^2", "$$"]);
  });

  test("clicking the widget moves the caret into it", async () => {
    const { plugin } = math_plugin();
    const editor = test_editor(note, [commonmark(), plugin]);
    const root = editor.view.contentDOM.querySelector(".md-math-block");
    root?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new MouseEvent("mouseup"));
    // Reveal holds still for a moment after the button is released.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const { head } = editor.view.state.selection.main;
    expect(head).toBe(editor.view.state.doc.toString().indexOf("a^2"));
    expect(editor.view.contentDOM.querySelector(".md-math-block")).toBeNull();
  });

  test("arrowing left onto the block from the line below shows its lines", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("$$\nx\n$$\n‸after", [commonmark(), plugin]);
    expect(
      editor.view.contentDOM.querySelector(".md-math-block"),
    ).not.toBeNull();
    editor.press("ArrowLeft");
    expect(editor.view.contentDOM.querySelector(".md-math-block")).toBeNull();
    expect(
      editor.view.contentDOM.querySelectorAll(".md-math-source"),
    ).toHaveLength(3);
  });

  test("the slash menu offers a math block with the caret on its middle line", () => {
    const { plugin } = math_plugin();
    const state = create_markdown_state("", {
      plugins: [commonmark(), plugin],
    });
    const item = get_registry(state).insert_items.find(
      (candidate) => candidate.id === "math",
    );
    expect(item).toMatchObject({ lines: ["$$", "", "$$"], caret: [1, 0] });
  });

  test("an opening $$ without a closing line stays source", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("‸\n\n$$\nx", [commonmark(), plugin]);
    const [block] = get_blocks(editor.view.state);
    expect(block).toBeDefined();
    if (block) expect(is_block_rendered(editor.view.state, block)).toBe(false);
    expect(editor.view.contentDOM.querySelector(".md-math-block")).toBeNull();
  });

  test("typing the closing line turns the block into a widget", async () => {
    const { plugin } = math_plugin();
    const editor = test_editor("$$\nx\n‸\n\nend", [commonmark(), plugin]);
    expect(editor.view.contentDOM.querySelector(".md-math-block")).toBeNull();
    editor.type("$$");
    editor.view.dispatch({
      selection: { anchor: editor.view.state.doc.length },
    });
    await settle();
    expect(
      editor.view.contentDOM.querySelector(".md-math-block"),
    ).not.toBeNull();
  });

  test("a block inside a list item keeps the item's indent layer", async () => {
    const { plugin } = math_plugin();
    const editor = test_editor("- item\n\n  $$\n  x\n  $$\n\n‸end", [
      commonmark(),
      plugin,
    ]);
    await settle();
    const root = editor.view.contentDOM.querySelector(".md-math-block");
    expect(root?.querySelector(".md-block-layer-list_item")).not.toBeNull();
  });

  test("editing the TeX re-renders and keeps the saved text", async () => {
    const { plugin, requests } = math_plugin();
    const editor = test_editor(note, [commonmark(), plugin]);
    const at = editor.view.state.doc.toString().indexOf("a^2");
    editor.view.dispatch({ selection: { anchor: at } });
    editor.type("c");
    editor.view.dispatch({ selection: { anchor: 0 } });
    await settle();
    expect(requests.at(-1)?.tex).toBe("ca^2 + b^2");
    expect(editor.saved()).toBe("before\n\n$$\nca^2 + b^2\n$$\n\nafter");
  });
});

describe("typing and caret around formulas", () => {
  const rendered = (editor: ReturnType<typeof test_editor>) =>
    editor.view.contentDOM.querySelectorAll(".md-math, .md-math-block").length;

  test("a formula typed in place shows its source until the caret leaves", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A ‸", [commonmark(), plugin]);
    editor.type("$x^2$");
    expect(editor.saved()).toBe("A $x^2$");
    expect(rendered(editor)).toBe(0);
    editor.type(" b");
    expect(rendered(editor)).toBe(1);
  });

  test("prices typed with a dollar sign never turn into a formula", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("‸", [commonmark(), plugin]);
    editor.type("It costs $5 and $10 today. ");
    expect(rendered(editor)).toBe(0);
  });

  test("arrowing left shows the source from the right edge to the left edge", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A $x$ b‸", [commonmark(), plugin]);
    const steps = Array.from({ length: 6 }, () => {
      editor.press("ArrowLeft");
      return [editor.source(), rendered(editor)];
    });
    expect(steps).toEqual([
      ["A $x$ ‸b", 1],
      ["A $x$‸ b", 0],
      ["A $x‸$ b", 0],
      ["A $‸x$ b", 0],
      ["A ‸$x$ b", 0],
      ["A‸ $x$ b", 1],
    ]);
  });

  test("Backspace on the closing dollar leaves plain text", () => {
    const { plugin } = math_plugin();
    const editor = test_editor("A $x$‸ b", [commonmark(), plugin]);
    editor.press("Backspace");
    expect(editor.source()).toBe("A $x‸ b");
    expect(rendered(editor)).toBe(0);
  });

  test("up from the line under a block enters it, and down from above does too", () => {
    const { plugin } = math_plugin();
    const below = test_editor("$$\nx\n$$\nafter‸", [commonmark(), plugin]);
    expect(
      below.view.contentDOM.querySelector(".md-math-block"),
    ).not.toBeNull();
    below.press("ArrowUp");
    expect(below.source()).toBe("$$\nx\n$$‸\nafter");
    expect(below.view.contentDOM.querySelector(".md-math-block")).toBeNull();

    const above = test_editor("before‸\n$$\nx\n$$", [commonmark(), plugin]);
    above.press("ArrowDown");
    expect(above.source()).toBe("before\n$$‸\nx\n$$");
    expect(above.view.contentDOM.querySelector(".md-math-block")).toBeNull();
  });

  test("a block typed with Enter keeps its TeX in one block and draws when the caret leaves", async () => {
    const { plugin } = math_plugin();
    const editor = test_editor("‸", [commonmark(), plugin]);
    editor
      .type("$$")
      .press("Enter")
      .type("a^2")
      .press("Enter")
      .type("$$")
      .press("Enter")
      .type("after");
    expect(editor.saved()).toBe("$$\na^2\n$$\nafter");
    await settle();
    expect(
      editor.view.contentDOM.querySelector(".md-math-block")?.textContent,
    ).toBe("<a^2>");
  });
});

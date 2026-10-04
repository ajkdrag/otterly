/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import type { MarkdownConfig } from "@lezer/markdown";
import { get_blocks } from "../src/core/block_field";
import { create_markdown_state } from "../src/core/editor";
import {
  PluginBuildError,
  get_registry,
  type InlineConstruct,
  type LineConstruct,
  type MarkdownPlugin,
} from "../src/core/plugin";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

afterEach(destroy_test_editors);

// ==text== highlight, as a plugin author would write it.
const highlight_syntax: MarkdownConfig = {
  defineNodes: [{ name: "Highlight" }, { name: "HighlightMark" }],
  parseInline: [
    {
      name: "Highlight",
      before: "Emphasis",
      parse(context, next, position) {
        if (next !== 61 || context.char(position + 1) !== 61) return -1;
        const match = /^==([^=]+)==/.exec(context.slice(position, context.end));
        if (!match) return -1;
        const end = position + match[0].length;
        return context.addElement(
          context.elt("Highlight", position, end, [
            context.elt("HighlightMark", position, position + 2),
            context.elt("HighlightMark", end - 2, end),
          ]),
        );
      },
    },
  ],
};

function highlight_construct(
  extra: Partial<InlineConstruct> = {},
): InlineConstruct {
  return {
    kind: "inline",
    name: "highlight",
    nodes: ["Highlight"],
    decorate(node, render) {
      render.mark(node.from, node.to, "md-highlight");
    },
    ...extra,
  };
}

function highlight(extra: Partial<InlineConstruct> = {}): MarkdownPlugin {
  return {
    name: "highlight",
    syntax: highlight_syntax,
    constructs: [highlight_construct(extra)],
  };
}

describe("plugin build errors", () => {
  test("a plugin whose required plugin is missing fails to build", () => {
    expect(() => create_markdown_state("text", { plugins: [gfm()] })).toThrow(
      PluginBuildError,
    );
  });

  test("the same plugin builds once its requirement is installed", () => {
    expect(() =>
      create_markdown_state("text", { plugins: [commonmark(), gfm()] }),
    ).not.toThrow();
  });

  test("two constructs with one name fail to build", () => {
    const duplicate: MarkdownPlugin = {
      name: "duplicate_heading",
      constructs: [{ kind: "line", name: "heading", nodes: ["ATXHeading1"] }],
    };
    expect(() =>
      create_markdown_state("# a", { plugins: [commonmark(), duplicate] }),
    ).toThrow(PluginBuildError);
  });

  test("replacing a construct that is not installed fails to build", () => {
    const orphan: MarkdownPlugin = {
      name: "orphan",
      constructs: [
        {
          kind: "line",
          name: "mine",
          nodes: ["ATXHeading1"],
          replaces: "nothing",
        },
      ],
    };
    expect(() =>
      create_markdown_state("# a", { plugins: [commonmark(), orphan] }),
    ).toThrow(PluginBuildError);
  });
});

describe("replacing a built-in construct", () => {
  const custom_heading: LineConstruct = {
    kind: "line",
    name: "fancy_heading",
    replaces: "heading",
    nodes: ["ATXHeading1"],
    decorate(node, render) {
      render.line(render.state.doc.lineAt(node.from).from, "fancy-heading");
    },
  };
  const swap_heading: MarkdownPlugin = {
    name: "swap_heading",
    constructs: [custom_heading],
  };

  test("the custom decoration shows up and the built-in one does not", () => {
    const test = test_editor("# Title\n\nbody‸", [commonmark(), swap_heading]);
    const line = test.view.dom.querySelector(".fancy-heading");
    expect(line?.textContent).toBe("# Title");
    expect(test.view.dom.querySelector(".md-heading")).toBeNull();
  });

  test("without the replacement the built-in heading class is used", () => {
    const test = test_editor("# Title\n\nbody‸", [commonmark()]);
    expect(test.view.dom.querySelector(".md-heading")).not.toBeNull();
    expect(test.view.dom.querySelector(".fancy-heading")).toBeNull();
  });
});

describe("custom constructs", () => {
  test("an inline construct from a plugin renders its decoration", () => {
    const test = test_editor("say ==this== now\n\n‸", [
      commonmark(),
      highlight(),
    ]);
    expect(test.view.dom.querySelector(".md-highlight")?.textContent).toBe(
      "==this==",
    );
    expect(test.saved()).toBe("say ==this== now\n\n");
  });

  test("a custom construct's Enter runs before the outer list item's Enter", () => {
    const handled = highlight({
      keys: {
        Enter: (context) => {
          context.dispatch({
            changes: { from: context.position, insert: "<custom>" },
          });
          return true;
        },
      },
    });
    const test = test_editor("- ==ab‸c==", [commonmark(), handled]);
    test.press("Enter");
    expect(test.view.state.doc.toString()).toBe("- ==ab<custom>c==");
  });

  test("when the custom Enter declines, the outer list item continues the list", () => {
    const declined = highlight({ keys: { Enter: () => false } });
    const test = test_editor("- ==abc==‸", [commonmark(), declined]);
    test.press("Enter");
    expect(test.view.state.doc.toString()).toBe("- ==abc==\n- ");
  });

  test("the custom Enter does not run outside its own syntax", () => {
    let calls = 0;
    const counting = highlight({
      keys: {
        Enter: () => {
          calls++;
          return true;
        },
      },
    });
    const test = test_editor("- ==abc== x‸", [commonmark(), counting]);
    test.press("Enter");
    expect(calls).toBe(0);
    expect(test.view.state.doc.toString()).toBe("- ==abc== x\n- ");
  });

  test("an insert item from a plugin shows up in the registry", () => {
    const callout_item = {
      id: "my_callout",
      label: "My Callout",
      lines: ["> [!note] ", "> "],
    };
    const plugin: MarkdownPlugin = {
      name: "my_callout",
      constructs: [
        {
          kind: "line",
          name: "my_callout",
          nodes: ["Blockquote"],
          insert: [callout_item],
        },
      ],
    };
    const state = create_markdown_state("", {
      plugins: [commonmark(), plugin],
    });
    const ids = get_registry(state).insert_items.map((item) => item.id);
    expect(ids).toContain("my_callout");
    expect(ids).toContain("h1");
  });

  test("a construct that throws while decorating leaves the rest of the note rendered", () => {
    const broken = highlight({
      decorate() {
        throw new Error("boom");
      },
    });
    const test = test_editor("# Title\n\nsay ==this== now\n\n‸", [
      commonmark(),
      broken,
    ]);
    expect(test.view.dom.querySelector(".md-heading")).not.toBeNull();
    expect(test.view.dom.querySelector(".cm-content")?.textContent).toContain(
      "==this==",
    );
  });
});

describe("large documents", () => {
  const paragraph =
    "A normal paragraph of plain words that repeats to fill the note. "
      .repeat(6)
      .trim();
  const table = "| a | b |\n| - | - |\n| 1 | 2 |";

  test("PERF-002 a 300 KB note has its table block as soon as the state is created", () => {
    const body = Array.from({ length: 800 }, () => paragraph).join("\n\n");
    const source = `${body}\n\n${table}\n`;
    expect(source.length).toBeGreaterThan(300_000);
    const state = create_markdown_state(source, {
      plugins: [commonmark(), gfm()],
    });
    const tables = get_blocks(state).filter(
      (block) => block.construct.name === "table",
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]?.source).toBe(table);
  });

  test("PERF-003 the table block survives typing at the top of a 300 KB note", () => {
    const body = Array.from({ length: 800 }, () => paragraph).join("\n\n");
    const test = test_editor(`‸${body}\n\n${table}\n`, [commonmark(), gfm()]);
    test.type("x");
    const tables = get_blocks(test.view.state).filter(
      (block) => block.construct.name === "table",
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]?.source).toBe(table);
  });
});

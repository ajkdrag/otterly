/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
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
import { callouts } from "../src/plugins/callouts/index";
import { commonmark } from "../src/plugins/commonmark/index";
import { find } from "../src/plugins/find";
import { frontmatter } from "../src/plugins/frontmatter/index";
import { gfm } from "../src/plugins/gfm/index";
import { images } from "../src/plugins/images/index";
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

describe("theme styles", () => {
  function style_rule_count(): number {
    return Array.from(document.styleSheets).reduce(
      (total, sheet) => total + sheet.cssRules.length,
      0,
    );
  }

  test("a second editor with the same plugins adds no style rules", () => {
    // Fresh plugin objects each time, like a host that builds them per note.
    const build_plugins = () => [
      commonmark(),
      gfm(),
      frontmatter(),
      callouts(),
      find(),
      images({ resolve_image: (source) => source }),
    ];
    test_editor("one", build_plugins());
    const rules_after_first = style_rule_count();
    expect(rules_after_first).toBeGreaterThan(0);
    test_editor("two", build_plugins());
    expect(style_rule_count()).toBe(rules_after_first);
  });
});

// CodeMirror gives up a parse when Date.now passes its deadline. Freezing the
// clock takes the machine's speed out of tests that check what the parse
// produces.
function with_frozen_clock<T>(run: () => T): T {
  const clock = vi.spyOn(Date, "now").mockReturnValue(0);
  try {
    return run();
  } finally {
    clock.mockRestore();
  }
}

describe("large documents", () => {
  const paragraph =
    "A normal paragraph of plain words that repeats to fill the note. "
      .repeat(6)
      .trim();
  const table = "| a | b |\n| - | - |\n| 1 | 2 |";
  const large_source = () =>
    `${Array.from({ length: 800 }, () => paragraph).join("\n\n")}\n\n${table}\n`;

  test("PERF-002 a 300 KB note has its table block as soon as the state is created", () => {
    const source = large_source();
    expect(source.length).toBeGreaterThan(300_000);
    const state = with_frozen_clock(() =>
      create_markdown_state(source, { plugins: [commonmark(), gfm()] }),
    );
    const tables = get_blocks(state).filter(
      (block) => block.construct.name === "table",
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]?.source).toBe(table);
  });

  test("PERF-003 the table block survives typing at the top of a 300 KB note", () => {
    const test = with_frozen_clock(() => {
      const editor = test_editor(`‸${large_source()}`, [commonmark(), gfm()]);
      editor.type("x");
      return editor;
    });
    const tables = get_blocks(test.view.state).filter(
      (block) => block.construct.name === "table",
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]?.source).toBe(table);
  });

  // Today a 300 KB state takes 35 to 75 ms here, and up to about 180 ms on an
  // oversubscribed machine. 400 ms still catches a 5x regression, and stays
  // above the 150 ms parse budget, which a loaded machine can hit. The fastest
  // of three runs. This is the only test in this file that reads the real
  // clock.
  test("creating the state for a 300 KB note stays under 400 ms", () => {
    const source = large_source();
    const plugins = [commonmark(), gfm()];
    const durations = Array.from({ length: 3 }, () => {
      const started = performance.now();
      create_markdown_state(source, { plugins });
      return performance.now() - started;
    });
    expect(Math.min(...durations)).toBeLessThan(400);
  });
});

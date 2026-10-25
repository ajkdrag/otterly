/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { links } from "../src/plugins/links/index";
import { focus_selection } from "../src/core/surface";
import { source_undo } from "../src/core/source_state";
import { create_markdown_state } from "../src/core/editor";
import { block_field } from "../src/core/block_field";
import { table_model } from "../src/plugins/gfm/table_widget";
import {
  destroy_test_editors,
  test_editor,
  type TestEditor,
} from "../src/testing/test_editor";

afterEach(destroy_test_editors);

const editor = (source: string) => test_editor(source, [commonmark(), gfm()]);

const table = "| a | b |\n| - | - |\n| 1 | 2 |";

function cell(test: TestEditor, row: number, column: number) {
  return test.view.dom.querySelector<HTMLElement>(
    `[data-row="${String(row)}"][data-col="${String(column)}"]`,
  );
}

// Activate a cell the way a click does, with the caret at a source position.
function focus_at(test: TestEditor, position: number) {
  test.view.dispatch({ selection: { anchor: position } });
  focus_selection(test.view);
}

function active_cell_editor(test: TestEditor): EditorView | null {
  const element = test.view.dom.querySelector<HTMLElement>(
    ".md-table-cell-active .cm-editor",
  );
  return element ? EditorView.findFromDOM(element) : null;
}

describe("tables", () => {
  test("TABLE-006 inactive cells render their Markdown", () => {
    const view = editor(
      "| **bold** | `code` |\n| - | - |\n| a | b |\n\nafter‸",
    );
    expect(cell(view, 0, 0)?.querySelector("strong")?.textContent).toBe("bold");
    expect(cell(view, 0, 1)?.querySelector("code")?.textContent).toBe("code");
  });

  test("TABLE-006 a table past the first parse chunk of a new note still has a model", () => {
    // A new state stores a tree for only the first few thousand characters.
    // The block field parses further, and the widget must find the same table
    // or it throws while drawing.
    const paragraphs = Array.from(
      { length: 80 },
      (_, index) => `Paragraph ${String(index)} with enough words to fill.`,
    ).join("\n\n");
    const state = create_markdown_state(`${paragraphs}\n\n${table}\n\nend`, {
      plugins: [commonmark(), gfm()],
    });
    const blocks = state.field(block_field).blocks;
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (!block) return;
    expect(table_model(state, block)?.rows).toHaveLength(2);
  });

  test("TABLE-006 deleting from above a table to the end of the note drops the table", () => {
    // The deleted table maps to a point at the end of the note. Drawing it
    // there threw.
    const view = editor(`‸before\n\n${table}\n\nafter\n`);
    const { state } = view.view;
    view.view.dispatch({
      changes: { from: state.doc.line(2).from, to: state.doc.length },
    });
    expect(view.view.state.doc.toString()).toBe("before\n");
    expect(view.view.state.field(block_field).blocks).toHaveLength(0);
  });

  test("NAV-009 a selection covering the whole table draws the table as selected", () => {
    const view = editor(`before\n\n${table}\n\n‸after`);
    const root = () => cell(view, 0, 0)?.closest("[data-md-block]");
    view.view.dispatch({
      selection: { anchor: 0, head: view.view.state.doc.length },
    });
    expect(root()?.classList).toContain("md-block-selected");

    // Partly covered is not selected.
    view.view.dispatch({ selection: { anchor: 0, head: 12 } });
    expect(root()?.classList).not.toContain("md-block-selected");

    view.view.dispatch({ selection: { anchor: 0 } });
    expect(root()?.classList).not.toContain("md-block-selected");
  });

  test("TABLE-007 alignment follows the delimiter row", () => {
    const view = editor("| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n\n‸");
    expect(cell(view, 1, 0)?.style.textAlign).toBe("left");
    expect(cell(view, 1, 1)?.style.textAlign).toBe("center");
    expect(cell(view, 1, 2)?.style.textAlign).toBe("right");
  });

  test("TABLE-004 typing in a cell reaches the source at once", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("1") + 1);
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    view.type("0");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 10 | 2 |\n\n");
  });

  test("TABLE-005 typed pipes are escaped and padding stays outside the cell", () => {
    const view = editor("|  a  | b |\n| - | - |\n|  x  | y |\n\n‸");
    focus_at(view, "|  a  | b |\n| - | - |\n|  x".length);
    view.type("|z");
    expect(view.saved()).toBe("|  a  | b |\n| - | - |\n|  x\\|z  | y |\n\n");
  });

  test("TABLE-005 a short row's missing cell accepts text", () => {
    const view = editor("| a | b |\n| - | - |\n| 1 |\n\n‸");
    focus_at(view, "| a | b |\n| - | - |\n| 1".length);
    view.press("Tab").type("2");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 |2\n\n");
  });

  test("TABLE-012 Add row keeps the cell focused without dispatching inside the outer update", async () => {
    // The links plugin's tooltip dispatches on focusin. Refocusing the cell
    // during the outer update used to throw "Calls to EditorView.update are
    // not allowed while an update is in progress".
    const view = test_editor(`${table}\n\n[link](https://example.com)‸`, [
      commonmark(),
      gfm(),
      links({ open_link: () => {} }),
    ]);
    focus_at(view, table.indexOf("1"));
    const errors: unknown[] = [];
    const on_error = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", on_error);
    const add_row = [
      ...view.view.dom.querySelectorAll<HTMLButtonElement>(".md-table-action"),
    ].find((button) => button.textContent === "Add row");
    add_row?.click();
    await Promise.resolve();
    window.removeEventListener("error", on_error);
    expect(errors).toEqual([]);
    expect(view.saved()).toContain("| 1 | 2 |\n|  |  |");
    // The new row's cell has focus, not the cell that was active before.
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    expect(
      view.view.dom
        .querySelector(".md-table-cell-active")
        ?.getAttribute("data-row"),
    ).toBe("2");
  });

  test("TABLE-012 Tab moves through cells and appends a row at the end", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("2"));
    view.press("Tab").type("3");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n| 3 |  |\n\n");
  });

  test("TABLE-013 Enter moves down the same column, and adds a row at the end", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("b"));
    view.press("Enter").type("!");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 | 2! |\n\n");
    view.press("Enter").type("x");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 | 2! |\n|  | x |\n\n");
  });

  test("TABLE-001 a table being typed stays source until Enter, then focuses the body", () => {
    const view = editor("‸");
    view.type("| a | b |");
    view.press("Enter");
    view.type("| - | - |");
    expect(view.view.dom.querySelector(".md-table-widget")).toBeNull();
    view.press("Enter").type("x");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| x |  |");
  });

  test("TABLE-011 Undo from a cell restores exact source and keeps the cell focused", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("1") + 1);
    view.type("23");
    view.press("Mod-z");
    expect(view.saved()).toBe(table + "\n\n");
  });

  test("TABLE-017 Delete column removes only this column", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("2"));
    const button = [
      ...view.view.dom.querySelectorAll<HTMLButtonElement>(".md-table-action"),
    ].find((element) => element.textContent === "Delete column");
    button?.click();
    expect(view.saved()).toBe("| a |\n| - |\n| 1 |\n\n");
  });

  test("TABLE-019 pipes in code stay literal", () => {
    const view = editor("```\n| a | b |\n| - | - |\n```\n\n‸");
    expect(view.view.dom.querySelector(".md-table-widget")).toBeNull();
  });

  test("a table inside a quote is a widget and keeps the quote prefix on edits", () => {
    const view = editor("> | a | b |\n> | - | - |\n> | 1 | 2 |\n\n‸");
    expect(view.view.dom.querySelector(".md-table-widget")).not.toBeNull();
    focus_at(view, "> | a | b |\n> | - | - |\n> | 1".length);
    view.type("1");
    expect(view.saved()).toBe("> | a | b |\n> | - | - |\n> | 11 | 2 |\n\n");
  });

  test("Undo after a table edit restores the source", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("1") + 1);
    view.type("9");
    source_undo(view.view);
    expect(view.saved()).toBe(table + "\n\n");
  });

  test("TABLE-005 a space typed at the end of a cell stays content, not padding", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("1") + 1);
    view.type(" more");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 more | 2 |\n\n");
  });
});

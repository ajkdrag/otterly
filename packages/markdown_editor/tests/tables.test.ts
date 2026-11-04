/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { links } from "../src/plugins/links/index";
import { find } from "../src/plugins/find";
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

// jsdom has no layout. A right-click places the caret with posAtCoords,
// which measures ranges.
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

// Right-click a cell the way the browser does, and return the table menu.
function open_cell_menu(test: TestEditor, row: number, column: number) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 10,
  });
  cell(test, row, column)?.dispatchEvent(event);
  return {
    event,
    menu: test.view.dom.querySelector<HTMLElement>(".md-table-menu"),
  };
}

function menu_item(test: TestEditor, label: string) {
  return [
    ...test.view.dom.querySelectorAll<HTMLButtonElement>(
      ".md-table-menu [role=menuitem]",
    ),
  ].find((button) => button.textContent === label);
}

function active_cell(test: TestEditor) {
  const element = test.view.dom.querySelector<HTMLElement>(
    ".md-table-cell-active",
  );
  return element
    ? [Number(element.dataset.row), Number(element.dataset.col)]
    : null;
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

  test("TABLE-012 Insert row below keeps the cell focused without dispatching inside the outer update", async () => {
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
    open_cell_menu(view, 1, 0);
    menu_item(view, "Insert row below")?.click();
    await Promise.resolve();
    window.removeEventListener("error", on_error);
    expect(errors).toEqual([]);
    expect(view.saved()).toContain("| 1 | 2 |\n|  |  |");
    // The new row's cell has focus, not the cell that was active before.
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    expect(active_cell(view)).toEqual([2, 0]);
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

  test("TABLE-006 cells keep their text after an edit above the table", () => {
    // Find redraws surface highlights on every edit. The table redrew its
    // cells from offsets taken before the edit, so "a" showed the space
    // before it and the last row started with the line break.
    const view = test_editor(`‸before\n\n${table}\nlazy row\n\nend`, [
      commonmark(),
      gfm(),
      find(),
    ]);
    view.view.dispatch({ changes: { from: 0, insert: "\n" } });
    const texts = [
      ...view.view.dom.querySelectorAll<HTMLElement>("[data-row][data-col]"),
    ].map((element) => element.textContent);
    expect(texts).toEqual(["a", "b", "1", "2", "lazy row", ""]);
  });

  test("TABLE-013 Enter in a lazy last row appends a row, also after an edit above", () => {
    // GFM takes "lazy row" as a one-cell row. Emptied, its spelling was a
    // blank line that ended the table. After an edit above the table, the
    // row went in at offsets from before the edit, in the middle of the text.
    const view = editor(`‸before\n\n${table}\nlazy row\n\nend`);
    view.view.dispatch({ changes: { from: 0, insert: "xx\n" } });
    focus_at(view, view.view.state.doc.toString().indexOf("lazy") + 2);
    view.press("Enter").type("x");
    view.press("Tab").type("y");
    expect(view.saved()).toBe(
      `xx\nbefore\n\n${table}\nlazy row\n| x | y |\n\nend`,
    );
    // Back over the lazy row's missing second cell to its own cell.
    view.press("Shift-Tab").press("Shift-Tab").press("Shift-Tab").type("!");
    expect(view.saved()).toBe(
      `xx\nbefore\n\n${table}\nlazy row!\n| x | y |\n\nend`,
    );
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

  test("SRC-006 Undo that removes the table gives focus back to the note", () => {
    const view = editor("‸");
    view.type("| a | b |");
    view.press("Enter").type("| - | - |");
    view.press("Enter").type("x");
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    for (let step = 0; step < 10 && cell(view, 0, 0); step++)
      view.press("Mod-z");
    expect(view.view.hasFocus).toBe(true);
  });

  test.each(["ArrowRight", "ArrowDown"])(
    "TABLE-020 %s in the last cell of the last table starts a row after a blank line",
    (key) => {
      const view = editor(table);
      focus_at(view, table.length - 2);
      view.press(key).type("after");
      expect(view.saved()).toBe(table + "\n\nafter");
      expect(view.view.hasFocus).toBe(true);
      view.press("Mod-z");
      expect(view.saved()).toBe(table);
    },
  );

  test("TABLE-020 the new row keeps the quote prefix", () => {
    const quoted = "> | a | b |\n> | - | - |\n> | 1 | 2 |";
    const view = editor(quoted);
    focus_at(view, quoted.length - 2);
    view.press("ArrowRight").type("after");
    expect(view.saved()).toBe(quoted + "\n> \n> after");
  });

  test.each([
    ["ArrowRight", "\n", "\n\nafter"],
    ["ArrowDown", "\n", "\n\nafter"],
    ["ArrowDown", "\n\n", "\n\nafter"],
    ["ArrowDown", "\n\n\n", "\n\nafter\n"],
  ])(
    "TABLE-020 %s past a table followed only by %j starts a row after a blank line",
    (key, tail, expected) => {
      // Most saved notes end with a line break. "after" right under the
      // table would be another table row.
      const view = editor(table + tail);
      focus_at(view, table.length - 2);
      view.press(key).type("after");
      expect(view.saved()).toBe(table + expected);
      expect(view.view.dom.querySelectorAll("tr")).toHaveLength(2);
    },
  );

  test.each([
    ["quote", "\n", "> | a | b |\n> | - | - |\n> | 1 | 2 |", "\n> \n> after"],
    [
      "list item",
      "\n",
      "- | a | b |\n  | - | - |\n  | 1 | 2 |",
      "\n  \n  after",
    ],
    [
      "list item",
      "\n\n",
      "- | a | b |\n  | - | - |\n  | 1 | 2 |",
      "\n  \n  after",
    ],
  ])(
    "TABLE-020 a table in a %s followed by %j keeps the prefix on the new row",
    (_container, tail, source, expected) => {
      const view = editor(source + tail);
      focus_at(view, source.length - 2);
      view.press("ArrowDown").type("after");
      expect(view.saved()).toBe(source + expected);
      expect(view.view.dom.querySelectorAll("tr")).toHaveLength(2);
    },
  );

  test.each(["ArrowRight", "ArrowDown"])(
    "TABLE-020 %s with a row after the table moves there without editing",
    (key) => {
      const view = editor(table + "\n\nnext");
      focus_at(view, table.length - 2);
      view.press(key);
      expect(view.saved()).toBe(table + "\n\nnext");
      expect(view.view.hasFocus).toBe(true);
    },
  );

  test("TABLE-015 Escape or arrows at a document edge keep the cell focused", () => {
    const view = editor(table);
    focus_at(view, table.length - 2);
    view.press("Escape");
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    view.type("x");
    expect(view.saved()).toBe("| a | b |\n| - | - |\n| 1 | 2x |");
    focus_at(view, 2);
    view.press("ArrowLeft");
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    view.type("y");
    expect(view.saved()).toBe("| ya | b |\n| - | - |\n| 1 | 2x |");
  });

  test("TABLE-017 right-click on a cell opens the table menu for that cell", () => {
    const view = editor(table + "\n\n‸");
    const { event, menu } = open_cell_menu(view, 1, 1);
    expect(event.defaultPrevented).toBe(true);
    expect(
      [...(menu?.querySelectorAll("[role=menuitem]") ?? [])].map(
        (item) => item.textContent,
      ),
    ).toEqual([
      "Insert row below",
      "Delete row",
      "Insert column left",
      "Insert column right",
      "Delete column",
      "Edit Markdown",
    ]);
    expect(active_cell(view)).toEqual([1, 1]);
    expect(menu?.contains(document.activeElement)).toBe(true);
    // Nothing under the table: no actions bar.
    expect(view.view.dom.querySelector(".md-table-actions")).toBeNull();
  });

  test("TABLE-017 a read-only table keeps the browser menu", () => {
    const view = test_editor(table + "\n\n‸", [
      commonmark(),
      { name: "read_only", extensions: EditorState.readOnly.of(true) },
      gfm(),
    ]);
    const { event, menu } = open_cell_menu(view, 1, 0);
    expect(event.defaultPrevented).toBe(false);
    expect(menu).toBeNull();
  });

  test.each([
    [
      "Insert row below",
      [1, 0],
      "| a | b |\n| - | - |\n| 1 | 2 |\n|  |  |\n| 3 | 4 |",
    ],
    [
      "Insert row below",
      [0, 0],
      "| a | b |\n| - | - |\n|  |  |\n| 1 | 2 |\n| 3 | 4 |",
    ],
    ["Delete row", [1, 0], "| a | b |\n| - | - |\n| 3 | 4 |"],
    [
      "Insert column left",
      [1, 1],
      "| a |  | b |\n| - | --- | - |\n| 1 |  | 2 |\n| 3 |  | 4 |",
    ],
    [
      "Insert column right",
      [1, 1],
      "| a | b |  |\n| - | - | --- |\n| 1 | 2 |  |\n| 3 | 4 |  |",
    ],
    ["Delete column", [1, 0], "| b |\n| - |\n| 2 |\n| 4 |"],
  ] as const)(
    "TABLE-017 %s on cell %j changes the table and one Undo restores it",
    (label, [row, column], expected) => {
      const source = "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |";
      const view = editor(source + "\n\n‸");
      open_cell_menu(view, row, column);
      menu_item(view, label)?.click();
      expect(view.saved()).toBe(expected + "\n\n");
      expect(view.view.dom.querySelector(".md-table-menu")).toBeNull();
      source_undo(view.view);
      expect(view.saved()).toBe(source + "\n\n");
    },
  );

  test("TABLE-017 Insert row below keeps a quoted table quoted", () => {
    const view = editor(
      "> | a | b |\n> | - | - |\n> | 1 | 2 |\n> | 3 | 4 |\n\n‸",
    );
    open_cell_menu(view, 1, 0);
    menu_item(view, "Insert row below")?.click();
    expect(view.saved()).toBe(
      "> | a | b |\n> | - | - |\n> | 1 | 2 |\n> |  |  |\n> | 3 | 4 |\n\n",
    );
  });

  test.each([
    ["- ", "  "],
    ["1. ", "   "],
    ["> - ", ">   "],
  ])(
    "TABLE-017 Insert row below keeps a table in a %j item one table",
    (marker, indent) => {
      // The header line starts with the item's marker, not its continuation
      // indent. A new row copying it started a new item and split the table.
      const lines = (...rows: string[]) =>
        rows.map((row, index) => (index ? indent : marker) + row).join("\n");
      const view = editor(
        lines("| a | b |", "| - | - |", "| 1 | 2 |") + "\n\n‸",
      );
      open_cell_menu(view, 0, 0);
      menu_item(view, "Insert row below")?.click();
      open_cell_menu(view, 2, 0);
      menu_item(view, "Insert row below")?.click();
      expect(view.saved()).toBe(
        lines("| a | b |", "| - | - |", "|  |  |", "| 1 | 2 |", "|  |  |") +
          "\n\n",
      );
    },
  );

  test("TABLE-017 Insert row below a lazy row in a list item stays in the item", () => {
    // A lazy row has no pipes, so the new row takes the header's spelling.
    const view = editor("- | a | b |\n  | - | - |\n  lazy\n\n‸");
    open_cell_menu(view, 1, 0);
    menu_item(view, "Insert row below")?.click();
    expect(view.saved()).toBe(
      "- | a | b |\n  | - | - |\n  lazy\n  |  |  |\n\n",
    );
  });

  test.each([
    ["- ", "  "],
    ["1. ", "   "],
    ["> - ", ">   "],
  ])(
    "TABLE-002 Enter after a delimiter typed in a %j item adds a body row in the item",
    (marker, indent) => {
      const view = editor(`${marker}| a | b |\n${indent}‸`);
      view.type("| - | - |").press("Enter").type("x");
      expect(view.saved()).toBe(
        `${marker}| a | b |\n${indent}| - | - |\n${indent}| x |  |`,
      );
    },
  );

  test("TABLE-017 header rows and single columns cannot be deleted", () => {
    const view = editor("| a |\n| - |\n| 1 |\n\n‸");
    open_cell_menu(view, 0, 0);
    expect(menu_item(view, "Delete row")?.disabled).toBe(true);
    expect(menu_item(view, "Delete column")?.disabled).toBe(true);
    open_cell_menu(view, 1, 0);
    expect(menu_item(view, "Delete row")?.disabled).toBe(false);
  });

  test("TABLE-003 Edit Markdown in the menu shows the table source", () => {
    const view = editor(table + "\n\n‸");
    open_cell_menu(view, 1, 0);
    menu_item(view, "Edit Markdown")?.click();
    expect(view.view.dom.querySelector(".md-table-widget")).toBeNull();
    expect(view.saved()).toBe(table + "\n\n");
  });

  test("TABLE-017 arrow keys skip disabled entries, Escape closes the menu and returns to the cell", () => {
    const view = editor(table + "\n\n‸");
    const { menu } = open_cell_menu(view, 0, 1);
    const key = (name: string) =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true }),
      );
    key("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Insert column left");
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement?.textContent).toBe("Edit Markdown");
    key("Escape");
    expect(menu?.isConnected).toBe(false);
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    expect(active_cell(view)).toEqual([0, 1]);
  });

  test.each(["Shift-F10", "ContextMenu"])(
    "TABLE-017 %s opens the table menu for the active cell, and its entries work",
    (key) => {
      const view = editor(table + "\n\n‸");
      focus_at(view, table.indexOf("2"));
      view.press(key);
      const menu = view.view.dom.querySelector(".md-table-menu");
      expect(document.activeElement?.textContent).toBe("Insert row below");
      expect(active_cell(view)).toEqual([1, 1]);
      // Some browsers send a contextmenu event after the menu key. It lands
      // on our menu and must not open the browser's menu over it.
      const follow_up = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(follow_up);
      expect(follow_up.defaultPrevented).toBe(true);
      expect(menu?.isConnected).toBe(true);
      (document.activeElement as HTMLElement).click();
      expect(menu?.isConnected).toBe(false);
      expect(view.saved()).toBe(table + "\n|  |  |\n\n");
      expect(active_cell(view)).toEqual([2, 1]);
    },
  );

  test("TABLE-017 Escape closes a menu opened from the keyboard and returns to the cell", () => {
    const view = editor(table + "\n\n‸");
    focus_at(view, table.indexOf("2"));
    view.press("Shift-F10");
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(view.view.dom.querySelector(".md-table-menu")).toBeNull();
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    expect(active_cell(view)).toEqual([1, 1]);
  });

  test("TABLE-017 Tab in the menu closes it and returns to the cell", () => {
    const view = editor(table + "\n\n‸");
    open_cell_menu(view, 1, 0);
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(view.view.dom.querySelector(".md-table-menu")).toBeNull();
    expect(active_cell_editor(view)?.hasFocus).toBe(true);
    expect(active_cell(view)).toEqual([1, 0]);
  });

  test("TABLE-017 focus moving out of the menu closes it", () => {
    const view = editor(table + "\n\n‸");
    const outside = document.createElement("button");
    document.body.append(outside);
    open_cell_menu(view, 1, 0);
    outside.focus();
    expect(view.view.dom.querySelector(".md-table-menu")).toBeNull();
    outside.remove();
  });

  test("TABLE-017 a mousedown outside the menu closes it", () => {
    const view = editor(table + "\n\n‸");
    const { menu } = open_cell_menu(view, 1, 0);
    menu?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu?.isConnected).toBe(true);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu?.isConnected).toBe(false);
    expect(view.view.dom.querySelector(".md-table-menu")).toBeNull();
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

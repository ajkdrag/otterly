/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { history } from "@codemirror/commands";
import { EditorState, type StateCommand } from "@codemirror/state";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { markdown_editor_extensions } from "../../../packages/markdown_editor/src/editor_extensions";
import {
  focus_table_selection,
  table_rendering,
} from "../../../packages/markdown_editor/src/table_rendering";
import {
  markdown_find_highlights,
  update_find_query,
} from "../../../packages/markdown_editor/src/find_highlights";
import { code_block_rendering } from "../../../packages/markdown_editor/src/code_block_rendering";
import { EditorView } from "@codemirror/view";
import { ensureSyntaxTree, forceParsing } from "@codemirror/language";
import {
  create_markdown_state,
  get_markdown_source,
  source_redo,
  source_undo,
} from "../../../packages/markdown_editor/src/source_state";

const views: EditorView[] = [];
beforeEach(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});

describe("Markdown table construction", () => {
  it("keeps a typed delimiter raw until Enter focuses a new editable row", () => {
    const prefix = "before\n\n";
    const source = "| Name | Value |\n| --- | --- |";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(prefix, markdown_editor_extensions()),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: prefix.length } });
    view.focus();
    for (const character of source) {
      const from = view.state.selection.main.head;
      view.dispatch({
        changes: { from, insert: character },
        selection: { anchor: from + 1 },
        userEvent: "input.type",
      });
      forceParsing(view, view.state.doc.length, 100);
      expect(view.dom.querySelector(".md-table-widget")).toBeNull();
    }
    expect(get_markdown_source(view.state)).toBe(prefix + source);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    const first = cell(view, 1, 0);
    expect(document.activeElement).toBe(first);
    type_into_focused_cell(first, "rapid body");
    expect(get_markdown_source(view.state)).toBe(
      prefix + source + "\n| rapid body |  |",
    );
    let undo_count = 0;
    while (source_undo(view)) undo_count++;
    expect(undo_count).toBeGreaterThan(0);
    expect(get_markdown_source(view.state)).toBe(prefix);
  });

  it("reveals an existing delimiter for source editing and Enter returns to its body", () => {
    const source = "| Name | Value |\n| --- | --- |\n| one | two |\n\nafter";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, markdown_editor_extensions()),
    });
    views.push(view);
    expect(view.dom.querySelector(".md-table-widget")).not.toBeNull();
    const delimiter_end = source.indexOf("\n| one");
    view.dispatch({ selection: { anchor: delimiter_end } });
    expect(view.dom.querySelector(".md-table-widget")).toBeNull();
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(cell(view, 1, 0));
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("renders again when source editing leaves the table", () => {
    const source = "| Name | Value |\n| --- | --- |\n\nafter";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, markdown_editor_extensions()),
    });
    views.push(view);
    view.dispatch({ selection: { anchor: source.indexOf("\n\nafter") } });
    expect(view.dom.querySelector(".md-table-widget")).toBeNull();
    view.dispatch({ selection: { anchor: source.length } });
    expect(view.dom.querySelector(".md-table-widget")).not.toBeNull();
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("keeps a second table's delimiter raw after editing a different table cell", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |\n\nafter\n\n";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, markdown_editor_extensions()),
    });
    views.push(view);
    activate(cell(view, 1, 0));
    view.dispatch({ selection: { anchor: source.length } });
    view.focus();
    for (const character of "| Name | Value |\n| --- | -") {
      const from = view.state.selection.main.head;
      view.dispatch({
        changes: { from, insert: character },
        selection: { anchor: from + 1 },
        userEvent: "input.type",
      });
      forceParsing(view, view.state.doc.length, 100);
      expect(view.dom.querySelectorAll(".md-table-widget")).toHaveLength(1);
    }
    expect(get_markdown_source(view.state)).toBe(
      source + "| Name | Value |\n| --- | -",
    );
  });
});

afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
});

function open_markdown(
  source: string,
  extensions = table_rendering(),
  read_only = false,
) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      extensions: [
        markdown_language(),
        extensions,
        history(),
        ...(read_only ? [EditorState.readOnly.of(true)] : []),
      ],
    }),
  });
  views.push(view);
  return view;
}

function open_source_markdown(source: string) {
  const view = new EditorView({
    parent: document.body,
    state: create_markdown_state(source, [
      markdown_language(),
      table_rendering({
        undo_command: source_undo,
        redo_command: source_redo,
      }),
    ]),
  });
  views.push(view);
  return view;
}

function cell(view: EditorView, row: number, col: number) {
  const element = view.dom.querySelector<HTMLElement>(
    `.md-table-widget [data-row="${String(row)}"][data-col="${String(col)}"]`,
  );
  if (!element)
    throw new Error(`Missing table cell ${String(row)}:${String(col)}`);
  return element;
}

function activate(element: HTMLElement) {
  element.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0 }),
  );
}

function type_into(element: HTMLElement, text: string) {
  element.textContent = text;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function type_into_focused_cell(element: HTMLElement, text: string) {
  element.focus();
  element.textContent = text;
  const node = element.firstChild;
  if (node) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function place_caret(element: HTMLElement, at_end: boolean) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!at_end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function caret_offset(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.focusNode || !element.contains(selection.focusNode))
    return null;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return range.toString().length;
}

function select_cell_text(element: HTMLElement) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function table_source(row_count: number) {
  return `| Name | Value |\n| --- | --- |\n${Array.from(
    { length: row_count },
    (_unused, index) => `| item ${String(index)} | value ${String(index)} |`,
  ).join("\n")}`;
}

function table_widget_heights(view: EditorView): number[] {
  const heights: number[] = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    const decorations = typeof source === "function" ? source(view) : source;
    decorations.between(0, view.state.doc.length, (_from, _to, decoration) => {
      const spec: unknown = decoration.spec;
      if (!spec || typeof spec !== "object" || !("widget" in spec)) return;
      const widget = spec.widget;
      if (
        widget &&
        typeof widget === "object" &&
        "estimatedHeight" in widget &&
        typeof widget.estimatedHeight === "number"
      )
        heights.push(widget.estimatedHeight);
    });
  }
  return heights;
}

describe("CM6 table rendering", () => {
  it("estimates ordinary and virtualized table heights from row metadata", () => {
    const small = open_markdown(table_source(2));
    const large = open_markdown(table_source(101));

    expect(table_widget_heights(small)).toContain(3 * 42);
    expect(table_widget_heights(large)).toContain(448);
  });

  it("renders a header and body grid with alignment while preserving source", () => {
    const source = "| Name | Count |\n| :--- | ---: |\n| Alpha | 2 |\n";
    const view = open_markdown(source);
    const table = view.dom.querySelector(".md-table-widget table");
    expect(table?.querySelectorAll("tr")).toHaveLength(2);
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("td")).toHaveLength(2);
    expect(
      table?.querySelectorAll("tr")[0]?.children[0]?.getAttribute("style"),
    ).toContain("left");
    expect(
      table?.querySelectorAll("tr")[0]?.children[1]?.getAttribute("style"),
    ).toContain("right");
    expect(table?.querySelector("th")?.getAttribute("style")).toContain(
      "--editor-table-border",
    );
    expect(table?.querySelector("th")?.getAttribute("style")).toContain(
      "--editor-table-cell-padding",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("left-aligns unspecified columns and retains explicit center/right alignment after editing", () => {
    const source =
      "| Plain | Center | Right |\n| --- | :---: | ---: |\n| one | two | three |";
    const view = open_markdown(source);
    expect([0, 1, 2].map((col) => cell(view, 0, col).style.textAlign)).toEqual([
      "left",
      "center",
      "right",
    ]);
    activate(cell(view, 1, 0));
    type_into_focused_cell(cell(view, 1, 0), "edited");
    expect([0, 1, 2].map((col) => cell(view, 0, col).style.textAlign)).toEqual([
      "left",
      "center",
      "right",
    ]);
    expect(view.state.doc.toString()).toBe(source.replace("one", "edited"));
  });

  it("keeps virtual column allocation stable across mounted rows and cell edits", () => {
    const source = table_source(300).replace(
      "value 299",
      "a much longer value near the end",
    );
    const view = open_markdown(source);
    const table = view.dom.querySelector<HTMLTableElement>(
      ".md-table-widget table",
    );
    if (!table) throw new Error("Expected the rendered table");
    const columns = Array.from(
      table.querySelectorAll("col"),
      (col) => col.style.width,
    );
    expect(columns[0]).not.toBe(columns[1]);
    expect(table.style.minWidth).not.toBe("");
    const viewport = view.dom.querySelector<HTMLElement>(".md-table-viewport");
    if (!viewport) throw new Error("Expected the table row viewport");
    viewport.scrollTop = 8000;
    viewport.dispatchEvent(new Event("scroll"));
    expect(
      Array.from(table.querySelectorAll("col"), (col) => col.style.width),
    ).toEqual(columns);
    view.dispatch({ selection: { anchor: source.indexOf("item 299") } });
    expect(focus_table_selection(view)).toBe(true);
    type_into_focused_cell(cell(view, 300, 0), "a newly widened value");
    expect(
      Array.from(table.querySelectorAll("col"), (col) => col.style.width),
    ).toEqual(columns);
    expect(view.state.doc.toString()).toBe(
      source.replace("item 299", "a newly widened value"),
    );
  });

  it("publishes one-cell edits synchronously and keeps all other source bytes", () => {
    const source =
      "prefix\n| Name | Count |\n| :--- | ---: |\n| Alpha | 2 |\n\nAfter";
    const view = open_markdown(source);
    const target = cell(view, 1, 0);
    activate(target);
    expect(target.getAttribute("contenteditable")).toBe("plaintext-only");
    view.dispatch({ changes: { from: 0, insert: "shifted above\n" } });
    expect(cell(view, 1, 0)).toBe(target);
    expect(document.activeElement).toBe(target);
    type_into(target, "Alpha edited");
    expect(view.state.doc.toString()).toBe(
      `shifted above\n${source.replace("Alpha", "Alpha edited")}`,
    );
    expect(document.activeElement).toBe(target);
  });

  it("does not serialize layout whitespace as cell content", () => {
    const source = "| A | B |\n| --- | --- |\n| x | second |";
    const view = open_markdown(source);
    const target = cell(view, 1, 1);
    activate(target);
    target.textContent = "second native";
    Object.defineProperty(target, "innerText", {
      configurable: true,
      value: "second native ",
    });
    target.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| x | second native |",
    );
  });

  it("keeps typed trailing whitespace separate from table cell padding", () => {
    const source = "| A | B |\n| --- | --- |\n| x | second |";
    const view = open_markdown(source);
    const target = cell(view, 1, 1);
    activate(target);
    type_into(target, "second ");
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| x | second  |",
    );
    type_into(target, "second native");
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| x | second native |",
    );
  });

  it("preserves original leading and trailing cell whitespace around an edit", () => {
    const source = "| A | B |\n| --- | --- |\n| x |  second   |";
    const view = open_markdown(source);
    const target = cell(view, 1, 1);
    activate(target);
    type_into(target, "changed");
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| x |  changed   |",
    );
  });

  it("supports empty cells and escaped pipes without changing delimiters", () => {
    const source = "| A | B |\n| --- | --- |\n|     | C \\| D |\n";
    const view = open_markdown(source);
    const empty = cell(view, 1, 0);
    activate(empty);
    type_into(empty, "new");
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n|     new| C \\| D |\n",
    );

    const escaped = cell(view, 1, 1);
    activate(escaped);
    type_into(escaped, "left | right");
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n|     new| left \\| right |\n",
    );
    expect(view.dom.querySelectorAll(".md-table-widget tr")).toHaveLength(2);
  });

  it("pads short body rows and writes into an empty virtual trailing cell", () => {
    const source = "| A | B | C |\n| --- | --- | --- |\n| x |";
    const view = open_markdown(source);
    expect(
      view.dom.querySelectorAll(".md-table-widget tr")[1]?.children,
    ).toHaveLength(3);
    const missing = cell(view, 1, 2);
    expect(missing.textContent).toBe("");
    activate(missing);
    type_into(missing, "z");
    expect(view.state.doc.toString()).toBe(
      "| A | B | C |\n| --- | --- | --- |\n| x ||z",
    );
    expect(
      view.dom.querySelectorAll(".md-table-widget tr")[1]?.children,
    ).toHaveLength(3);
  });

  it("keeps code-looking cell contents literal and skips frontmatter and fenced code", () => {
    const source =
      "---\n| key | value |\n| --- | --- |\n| note | body |\n---\n\n```md\n| key | value |\n| --- | --- |\n| a | b |\n```\n\n| Col | Col |\n| --- | --- |\n| `**literal**` | **rich source** |\n";
    const view = open_markdown(source);
    expect(view.dom.querySelectorAll(".md-table-widget")).toHaveLength(1);
    const cells = view.dom.querySelectorAll(".md-table-widget td");
    expect(cells[0]?.querySelector("code")?.textContent).toBe("**literal**");
    expect(cells[1]?.querySelector("strong")?.textContent).toBe("rich source");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("shows Markdown formatting while a cell is inactive and source while active", () => {
    const source = "| A | B |\n| --- | --- |\n| **bold** | `code` |";
    const view = open_markdown(source);
    const bold = cell(view, 1, 0);
    expect(bold.querySelector("strong")?.textContent).toBe("bold");
    expect(cell(view, 1, 1).querySelector("code")?.textContent).toBe("code");
    activate(bold);
    expect(bold.textContent).toBe("**bold**");
    expect(bold.hasAttribute("contenteditable")).toBe(true);
  });

  it("applies the documented Mod-Alt-X strikethrough shortcut in a cell", () => {
    const source = "| A | B |\n| --- | --- |\n| plain | other |";
    const view = open_markdown(source);
    const plain = cell(view, 1, 0);
    activate(plain);
    select_cell_text(plain);
    plain.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "x",
        metaKey: true,
        altKey: true,
      }),
    );
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| ~~plain~~ | other |",
    );
  });

  it("renders table links without changing source and delegates safe activation", () => {
    const source =
      "| Link | Wiki |\n| --- | --- |\n| [site](https://example.test) | [[notes/Topic#Part\\|Topic]] |";
    const opened: string[] = [];
    const view = open_markdown(
      source,
      table_rendering({ open_link: (target) => opened.push(target) }),
    );
    const site = view.dom.querySelector<HTMLAnchorElement>(
      '.md-table-widget a[aria-label^="site"]',
    );
    const wiki = view.dom.querySelector<HTMLAnchorElement>(
      '.md-table-widget a[aria-label^="Topic"]',
    );
    expect(site?.textContent).toBe("site");
    expect(wiki?.getAttribute("role")).toBe("link");
    site?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    wiki?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    expect(opened).toEqual(["https://example.test", "notes/Topic.md#Part"]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("projects find matches into inactive and active table cells", () => {
    const source = "| A | B |\n| --- | --- |\n| **needle** | needle |";
    const view = open_markdown(source, [
      table_rendering(),
      markdown_find_highlights(),
    ]);
    update_find_query(view, "needle", 1);
    expect(cell(view, 1, 0).querySelector(".find-match")).not.toBeNull();
    expect(
      cell(view, 1, 1).querySelector(".find-match--selected")?.textContent,
    ).toBe("needle");
    view.dispatch({
      selection: {
        anchor: source.indexOf("needle"),
        head: source.indexOf("needle") + "needle".length,
      },
    });
    expect(focus_table_selection(view)).toBe(true);
    expect(cell(view, 1, 0).textContent).toBe("**needle**");
    expect(cell(view, 1, 0).querySelector(".find-match")?.textContent).toBe(
      "needle",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("focuses tables only when the outer selection is inside a cell", () => {
    const source = "| A |\n| --- |\n| needle |";
    const view = open_markdown(source, [
      table_rendering(),
      markdown_find_highlights(),
    ]);
    update_find_query(view, "needle", 0);
    expect(focus_table_selection(view)).toBe(false);
    view.dispatch({ selection: { anchor: source.indexOf("needle") + 2 } });
    expect(focus_table_selection(view)).toBe(true);
    expect(document.activeElement).toBe(cell(view, 1, 0));
  });

  it("syncs an active cell selection for the host formatting command", () => {
    const source = "| A |\n| --- |\n| bold |";
    const view = open_markdown(source, table_rendering());
    const target = cell(view, 1, 0);
    activate(target);
    const text = target.firstChild;
    if (!text) throw new Error("Expected editable cell text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "b", ctrlKey: true }),
    );
    expect(view.state.doc.toString()).toBe("| A |\n| --- |\n| **bold** |");
    expect(document.activeElement).toBe(target);
    expect(view.state.selection.main.from).toBeLessThan(
      view.state.selection.main.to,
    );
  });

  it("refreshes a table revealed by background parsing", async () => {
    const source = `${Array.from({ length: 9000 }, (_, index) => `paragraph ${String(index)}`).join("\n\n")}\n\n| A | B |\n| --- | --- |\n| x | y |`;
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.length } });
    expect(
      ensureSyntaxTree(view.state, view.state.doc.length, 1000),
    ).not.toBeNull();
    const deadline = Date.now() + 1500;
    while (
      !view.dom.querySelector(".md-table-widget") &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(view.dom.querySelector(".md-table-widget")).not.toBeNull();
  });

  it("keeps an active cell DOM node and focus during composition source updates", () => {
    const source = "| A | B |\n| --- | --- |\n| before | other |";
    const view = open_markdown(source);
    const target = cell(view, 1, 0);
    activate(target);
    target.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    type_into(target, "composed");
    expect(view.state.doc.toString()).toBe(
      source.replace("before", "composed"),
    );
    expect(cell(view, 1, 0)).toBe(target);
    expect(document.activeElement).toBe(target);
    target.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );
    expect(view.state.doc.toString()).toBe(
      source.replace("before", "composed"),
    );
  });

  it("keeps the caret in place after deleting and typing inside a cell", () => {
    const source = "| A |\n| --- |\n| hello |";
    const view = open_markdown(source);
    const target = cell(view, 1, 0);
    activate(target);
    const text_node = target.firstChild;
    if (!text_node) throw new Error("Expected active cell source text");
    const place_at = (offset: number) => {
      const range = document.createRange();
      range.setStart(target.firstChild ?? target, offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };
    target.textContent = "helo";
    place_at(2);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace("hello", "helo"));
    expect(cell(view, 1, 0)).toBe(target);
    expect(document.activeElement).toBe(target);
    expect(view.state.selection.main.head).toBe(source.indexOf("hello") + 2);

    target.textContent = "heXlo";
    place_at(3);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace("hello", "heXlo"));
    expect(cell(view, 1, 0)).toBe(target);
    expect(document.activeElement).toBe(target);
    expect(view.state.selection.main.head).toBe(source.indexOf("hello") + 3);
  });

  it("refreshes inactive cells after source edits with the same table shape", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |";
    const view = open_markdown(source);
    const updated = source.replace("two", "updated");
    view.dispatch({
      changes: {
        from: source.indexOf("two"),
        to: source.indexOf("two") + "two".length,
        insert: "updated",
      },
    });

    expect(view.state.doc.toString()).toBe(updated);
    expect(cell(view, 1, 1).textContent).toBe("updated");
  });

  it("does not replace a native cell selection before browser arrow movement", () => {
    const source = "| A | B |\n| --- | --- |\n| Alpha beta gamma | two |";
    const view = open_markdown(source);
    const active_cell = cell(view, 1, 0);
    activate(active_cell);
    view.dispatch({ selection: { anchor: source.indexOf("gamma") + 5 } });
    place_caret(active_cell, false);

    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    active_cell.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(view.state.selection.main.head).toBe(source.indexOf("gamma") + 5);
  });

  it("leaves an active cell drag selection to the browser", () => {
    const view = open_markdown("| A |\n| --- |\n| select this text |\n");
    const active_cell = cell(view, 1, 0);
    activate(active_cell);
    const text = active_cell.firstChild;
    if (!text) throw new Error("Expected active cell source text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    active_cell.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(window.getSelection()?.toString()).toBe("select");
  });

  it("selects and replaces only the active cell for Mod-A", () => {
    const source = "| A |\n| --- |\n| Alpha beta gamma |";
    const view = open_source_markdown(source);
    const active_cell = cell(view, 1, 0);
    activate(active_cell);

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "a",
      metaKey: true,
    });
    active_cell.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe("Alpha beta gamma");
    expect(view.state.selection.main.from).toBe(source.indexOf("Alpha"));
    expect(view.state.selection.main.to).toBe(source.indexOf("gamma") + 5);

    active_cell.textContent = "whole cell";
    place_caret(active_cell, true);
    active_cell.dispatchEvent(new Event("input", { bubbles: true }));
    expect(get_markdown_source(view.state)).toBe(
      source.replace("Alpha beta gamma", "whole cell"),
    );
  });

  it("routes Tab, Shift-Tab, and Enter through the grid and adds a row at the end", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |";
    const view = open_markdown(source);
    activate(cell(view, 1, 1));
    cell(view, 1, 1).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
    );
    expect(document.activeElement?.getAttribute("data-row")).toBe("2");
    expect(document.activeElement?.getAttribute("data-col")).toBe("0");

    cell(view, 2, 0).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    expect(view.state.doc.toString()).toBe(`${source}\n|  |  |\n|  |  |`);
    expect(document.activeElement?.getAttribute("data-row")).toBe("3");
    expect(document.activeElement?.getAttribute("data-col")).toBe("0");

    cell(view, 3, 0).dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Tab",
        shiftKey: true,
      }),
    );
    expect(document.activeElement?.getAttribute("data-row")).toBe("2");
    expect(document.activeElement?.getAttribute("data-col")).toBe("1");
  });

  it("moves Enter down and Shift-Enter up through existing body rows", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |\n| three | four |";
    const view = open_markdown(source);
    activate(cell(view, 1, 0));
    cell(view, 1, 0).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    expect(document.activeElement?.getAttribute("data-row")).toBe("2");
    expect(document.activeElement?.getAttribute("data-col")).toBe("0");
    cell(view, 2, 0).dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Enter",
        shiftKey: true,
      }),
    );
    expect(document.activeElement?.getAttribute("data-row")).toBe("1");
    expect(document.activeElement?.getAttribute("data-col")).toBe("0");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("uses the outer CM6 history and isolates active state between editor buffers", () => {
    const extension = table_rendering();
    const source = "| A | B |\n| --- | --- |\n| old | same |";
    const first = open_markdown(source, extension);
    const second = open_markdown(source, extension);
    const first_cell = cell(first, 1, 0);
    activate(first_cell);
    type_into(first_cell, "new");
    expect(first.state.doc.toString()).toBe(source.replace("old", "new"));
    expect(second.state.doc.toString()).toBe(source);
    expect(cell(second, 1, 0).hasAttribute("contenteditable")).toBe(false);
    first_cell.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "z", ctrlKey: true }),
    );
    expect(first.state.doc.toString()).toBe(source);
    first_cell.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(first.state.doc.toString()).toBe(source.replace("old", "new"));
  });

  it("groups character input into one source-history undo", () => {
    const source = "| A |\n| --- |\n| old |";
    const view = open_source_markdown(source);
    const target = cell(view, 1, 0);
    activate(target);
    type_into(target, "n");
    type_into(target, "ne");
    type_into(target, "new");
    expect(get_markdown_source(view.state)).toBe(source.replace("old", "new"));
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "z", metaKey: true }),
    );
    expect(get_markdown_source(view.state)).toBe(source);
    expect(document.activeElement).toBe(target);
    expect(target.hasAttribute("contenteditable")).toBe(true);
    expect(target.textContent).toBe("old");
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "z",
        metaKey: true,
        shiftKey: true,
      }),
    );
    expect(get_markdown_source(view.state)).toBe(source.replace("old", "new"));
    expect(target.textContent).toBe("new");
  });

  it("delegates active-cell undo and redo to the supplied source commands", () => {
    const selections: number[] = [];
    const undo_command: StateCommand = ({ state, dispatch }) => {
      selections.push(state.selection.main.head);
      dispatch(state.update({ selection: { anchor: 0 } }));
      return true;
    };
    const redo_command: StateCommand = ({ state, dispatch }) => {
      selections.push(state.selection.main.head);
      dispatch(state.update({ selection: { anchor: state.doc.length } }));
      return true;
    };
    const source = "| A | B |\n| --- | --- |\n| one | two |";
    const view = open_markdown(
      source,
      table_rendering({ undo_command, redo_command }),
    );
    const target = cell(view, 1, 0);
    activate(target);
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "z", ctrlKey: true }),
    );
    expect(view.state.selection.main.head).toBe(0);
    expect(document.activeElement).toBe(target);
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(view.state.selection.main.head).toBe(source.length);
    expect(selections).toHaveLength(2);
  });

  it("shows a static accessible grid in read-only mode", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |";
    const view = open_markdown(source, table_rendering(), true);
    const first_cell = cell(view, 1, 0);
    expect(view.dom.querySelector('[role="grid"]')).not.toBeNull();
    activate(first_cell);
    expect(first_cell.hasAttribute("contenteditable")).toBe(false);
    type_into(first_cell, "changed");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps a large table window bounded and mounts rows requested by find and focus", () => {
    const source = table_source(300);
    const view = open_markdown(source, [
      table_rendering(),
      markdown_find_highlights(),
    ]);
    const viewport = view.dom.querySelector<HTMLElement>(".md-table-viewport");
    expect(viewport?.style.maxHeight).toBe("448px");
    if (!viewport) throw new Error("Expected a large-table viewport");
    expect(viewport.scrollTop).toBe(0);
    activate(cell(view, 5, 0));
    expect(viewport.scrollTop).toBe(0);
    expect(
      view.dom.querySelectorAll(".md-table-widget tbody > tr[data-row]").length,
    ).toBeLessThan(50);

    update_find_query(view, "item 250", 0);
    const target = cell(view, 251, 0);
    expect(target.querySelector(".find-match--selected")?.textContent).toBe(
      "item 250",
    );
    expect(Number(viewport?.scrollTop)).toBeGreaterThan(0);

    view.dispatch({ selection: { anchor: source.indexOf("value 275") + 2 } });
    expect(focus_table_selection(view)).toBe(true);
    expect(document.activeElement?.getAttribute("data-row")).toBe("276");

    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll"));
    expect(cell(view, 276, 1)).not.toBeNull();
    expect(
      view.dom.querySelectorAll(".md-table-widget tbody > tr[data-row]").length,
    ).toBeLessThan(50);

    cell(view, 276, 1).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
    );
    expect(document.activeElement?.getAttribute("data-row")).toBe("277");
    expect(document.activeElement?.getAttribute("data-col")).toBe("0");
  });

  it("appends and source-undoes a row at the end of a virtualized table", () => {
    const source = table_source(130);
    const view = open_source_markdown(source);
    view.dispatch({ selection: { anchor: source.indexOf("value 129") + 2 } });
    expect(focus_table_selection(view)).toBe(true);
    const last_cell = cell(view, 130, 1);
    expect(document.activeElement).toBe(last_cell);
    last_cell.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
    );
    expect(get_markdown_source(view.state)).toContain(
      "| item 129 | value 129 |\n|  |  |",
    );
    const appended_cell = cell(view, 131, 0);
    appended_cell.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "z", metaKey: true }),
    );
    expect(get_markdown_source(view.state)).toBe(source);
  });

  it("keeps an active virtual cell focused across repeated edits with a find result", () => {
    const source = table_source(130);
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, [
        markdown_language(),
        markdown_find_highlights(),
        table_rendering({
          undo_command: source_undo,
          redo_command: source_redo,
        }),
      ]),
    });
    views.push(view);
    update_find_query(view, "item 129", 0);
    const first = cell(view, 130, 1);
    activate(first);
    const body = first.closest("tbody");
    if (!body) throw new Error("Missing table body");
    const observer = new MutationObserver(() => {});
    observer.observe(body, { childList: true });
    type_into_focused_cell(first, "value 129X");
    expect(cell(view, 130, 1)).toBe(first);
    expect(document.activeElement).toBe(first);

    type_into_focused_cell(first, "value 129XYZ");
    const removed_active_cell = observer
      .takeRecords()
      .flatMap((record) => Array.from(record.removedNodes))
      .some((node) => node === first || node.contains(first));
    observer.disconnect();
    expect(removed_active_cell).toBe(false);
    expect(get_markdown_source(view.state)).toContain(
      "| item 129 | value 129XYZ |",
    );
    expect(document.activeElement).toBe(first);
  });

  it("moves table boundary arrows into an adjacent code block", () => {
    const source =
      "```ts\nconst before = true;\n```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```ts\nconst after = true;\n```";
    const view = new EditorView({
      parent: document.body,
      state: create_markdown_state(source, [
        markdown_language(),
        table_rendering({
          undo_command: source_undo,
          redo_command: source_redo,
        }),
        code_block_rendering({ undo: source_undo, redo: source_redo }),
      ]),
    });
    views.push(view);

    const first = cell(view, 0, 0);
    activate(first);
    place_caret(first, false);
    cell(view, 0, 0).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(view.state.selection.main.head).toBe(
      source.indexOf("const before") + "const before = true;".length,
    );

    const first_again = cell(view, 0, 0);
    activate(first_again);
    place_caret(first_again, false);
    first_again.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(view.state.selection.main.head).toBe(
      source.indexOf("const before") + "const before = true;".length,
    );

    const last = cell(view, 1, 1);
    activate(last);
    place_caret(last, true);
    cell(view, 1, 1).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(view.state.selection.main.head).toBe(source.indexOf("const after"));

    const last_again = cell(view, 1, 1);
    activate(last_again);
    place_caret(last_again, true);
    last_again.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(view.state.selection.main.head).toBe(source.indexOf("const after"));
  });

  it("enters a rendered table from the blank row immediately beside it", () => {
    const source =
      "before table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter table";
    const view = open_markdown(source);
    view.dispatch({
      selection: { anchor: source.indexOf("| A") - 1 },
    });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(cell(view, 0, 0));
    expect(view.state.doc.toString()).toBe(source);

    const below_view = open_markdown(source);
    below_view.dispatch({
      selection: { anchor: source.indexOf("after table") - 1 },
    });
    below_view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(cell(below_view, 1, 0));
    expect(below_view.state.doc.toString()).toBe(source);
  });

  it.each(["ArrowUp", "ArrowDown"])(
    "enters tables from a prose column through the composed %s bindings",
    (key) => {
      const source =
        "before table\n| A | B |\n| --- | --- |\n| one | two |\n# after table";
      const view = new EditorView({
        parent: document.body,
        state: create_markdown_state(source, markdown_editor_extensions()),
      });
      views.push(view);
      forceParsing(view, source.length, 100);
      view.dispatch({
        selection: {
          anchor: key === "ArrowUp" ? source.indexOf("after") + 4 : 4,
        },
      });
      view.focus();
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(
        cell(view, key === "ArrowUp" ? 1 : 0, 0),
      );
      expect(view.state.selection.main.head).toBe(
        key === "ArrowUp" ? source.indexOf("one") + 3 : source.indexOf("A"),
      );
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it("does not jump over a blank row from prose", () => {
    const source = "before table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const view = open_markdown(source);
    view.dispatch({ selection: { anchor: source.indexOf("before") + 3 } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).not.toBe(cell(view, 0, 0));
  });

  it.each([1, 2])(
    "keeps %s blank rows as stops on both sides of a table",
    (blank_rows) => {
      const gap = "\n".repeat(blank_rows + 1);
      const source =
        "before" +
        gap +
        "| A | B |\n| --- | --- |\n| one | two |" +
        gap +
        "after";
      const view = open_markdown(source);
      for (const direction of [-1, 1]) {
        const row = direction < 0 ? 0 : 1;
        const target = cell(view, row, 0);
        activate(target);
        place_caret(target, direction > 0);
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: direction < 0 ? "ArrowUp" : "ArrowDown",
            bubbles: true,
            cancelable: true,
          }),
        );
        const expected =
          direction < 0
            ? source.indexOf("| A") - 1
            : source.indexOf("\n", source.indexOf("| one")) + 1;
        expect(view.state.selection.main.head).toBe(expected);
        expect(document.activeElement).toBe(view.contentDOM);
        view.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: direction < 0 ? "ArrowDown" : "ArrowUp",
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(document.activeElement).toBe(cell(view, row, 0));
      }
      expect(view.state.doc.toString()).toBe(source);
    },
  );

  it("moves boundary arrows between cells without changing the source", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |\n| three | four |";
    const view = open_markdown(source);
    const first = cell(view, 1, 0);
    activate(first);
    place_caret(first, true);
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(cell(view, 1, 1));
    expect(caret_offset(cell(view, 1, 1))).toBe(0);
    expect(view.state.selection.main.head).toBe(source.indexOf("two"));

    const second = cell(view, 1, 1);
    place_caret(second, true);
    second.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(cell(view, 2, 1));
    expect(caret_offset(cell(view, 2, 1))).toBe(0);
    expect(view.state.selection.main.head).toBe(source.indexOf("four"));

    const last_row_first_cell = cell(view, 2, 0);
    activate(last_row_first_cell);
    place_caret(last_row_first_cell, false);
    last_row_first_cell.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement).toBe(cell(view, 1, 0));
    expect(caret_offset(cell(view, 1, 0))).toBe(
      cell(view, 1, 0).textContent?.length,
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("adds and deletes body rows from the active table controls", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |\n| three | four |";
    const view = open_markdown(source);
    activate(cell(view, 2, 1));
    const delete_row = view.dom.querySelector<HTMLButtonElement>(
      '.md-table-action[aria-label="Delete row"]',
    );
    if (!delete_row) throw new Error("Missing Delete row action");
    delete_row.click();
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| one | two |",
    );
    expect(document.activeElement).toBe(cell(view, 1, 1));

    view.dom
      .querySelector<HTMLButtonElement>(
        '.md-table-action[aria-label="Add row"]',
      )
      ?.click();
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n| --- | --- |\n| one | two |\n|  |  |",
    );
    expect(document.activeElement).toBe(cell(view, 2, 1));
  });

  it("adds and deletes a column while preserving the other cell source", () => {
    const source = "| A | B |\n| :--- | ---: |\n| one | two |";
    const view = open_markdown(source);
    activate(cell(view, 1, 0));
    view.dom
      .querySelector<HTMLButtonElement>(
        '.md-table-action[aria-label="Add column"]',
      )
      ?.click();
    expect(view.state.doc.toString()).toBe(
      "| A |  | B |\n| :--- | --- | ---: |\n| one |  | two |",
    );
    expect(document.activeElement).toBe(cell(view, 1, 1));
    view.dom
      .querySelector<HTMLButtonElement>(
        '.md-table-action[aria-label="Delete column"]',
      )
      ?.click();
    expect(view.state.doc.toString()).toBe(source);
    expect(document.activeElement).toBe(cell(view, 1, 1));
    expect(cell(view, 1, 1).textContent).toBe("two");
  });
});

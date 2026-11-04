/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import type { BlockWidget } from "../src/core/block_field";
import { block_field, block_theme_spec } from "../src/core/block_field";
import { commonmark } from "../src/plugins/commonmark/index";
import { gfm } from "../src/plugins/gfm/index";
import { destroy_test_editors, test_editor } from "../src/testing/test_editor";

afterEach(() => {
  destroy_test_editors();
  vi.unstubAllGlobals();
});

const table = "| a | b |\n| - | - |\n| 1 | 2 |";

describe("measured block heights", () => {
  // Records which elements each ResizeObserver watches. The table widget
  // also observes its rows, so only observers on a widget root count.
  function stub_resize_observer() {
    const watched_roots: Element[] = [];
    const callbacks = new Map<Element, ResizeObserverCallback>();
    class StubResizeObserver {
      constructor(readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (!(target instanceof HTMLElement) || !target.dataset.mdBlock) return;
        watched_roots.push(target);
        callbacks.set(target, this.callback);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    return { watched_roots, callbacks };
  }

  test("edits above a widget keep its one observer, and a source change records the new height", () => {
    const { watched_roots, callbacks } = stub_resize_observer();
    const editor = test_editor(`‸\n\n${table}`, [commonmark(), gfm()]);
    const root = editor.view.contentDOM.querySelector("[data-md-block]");
    expect(root).not.toBeNull();
    expect(watched_roots).toEqual([root]);

    // Each edit above updates the widget in place. Its source stays the same.
    for (let index = 0; index < 5; index++)
      editor.view.dispatch({ changes: { from: 0, insert: "x" } });
    for (const element of editor.view.contentDOM.querySelectorAll(
      "[data-md-block]",
    ))
      expect(element).toBe(root);
    expect(watched_roots).toEqual([root]);

    // A different source is a different height key, which gets measured.
    const cell = editor.view.state.doc.toString().indexOf("2 |");
    editor.view.dispatch({ changes: { from: cell, insert: "9" } });
    const new_root = editor.view.contentDOM.querySelector("[data-md-block]");
    const report_height = new_root && callbacks.get(new_root);
    expect(report_height).toBeTruthy();
    report_height?.(
      [{ borderBoxSize: [{ blockSize: 123 }] }] as never,
      {} as ResizeObserver,
    );
    const decorations = editor.view.state.field(block_field).decorations;
    const spec = decorations.iter().value?.spec as
      | { widget: BlockWidget }
      | undefined;
    expect(spec?.widget.estimatedHeight).toBe(123);
  });
});

describe("block selection", () => {
  test("a selected widget tints its card, not the margin or list indent around it", () => {
    const editor = test_editor(
      "‸- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |\n\nAfter.",
      [commonmark(), gfm()],
    );
    const { view } = editor;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    const root = view.contentDOM.querySelector("[data-md-block]");
    expect(root?.classList.contains("md-block-selected")).toBe(true);

    // The body holds the card. Its padding is the margin, and the list
    // layer with the marker sits outside it.
    const overlays = Object.keys(block_theme_spec).filter((selector) =>
      selector.includes("::after"),
    );
    expect(overlays).toHaveLength(1);
    const tinted = [
      ...view.contentDOM.querySelectorAll(
        overlays[0]?.replace("::after", "") ?? "",
      ),
    ];
    const card = root?.querySelector(".md-table-host");
    expect(tinted).toEqual([card?.parentElement]);
    expect(tinted[0]?.classList.contains("md-block-body")).toBe(true);
    expect(tinted[0]?.querySelector(".md-block-layer-marker")).toBeNull();
    expect(block_theme_spec[overlays[0] ?? ""]).toMatchObject({
      inset: "var(--editor-block-margin-y, 0.5rem) 0",
    });
  });
});

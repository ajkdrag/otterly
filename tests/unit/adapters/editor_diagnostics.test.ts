/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create_editor_diagnostics } from "$lib/features/editor/adapters/editor_diagnostics";
import type { EditorDiagnosticSnapshot } from "$lib/features/editor/types/editor_diagnostics";
const controllers: ReturnType<typeof create_editor_diagnostics>[] = [];
afterEach(() => {
  for (const controller of controllers) controller.destroy();
  controllers.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const read_source = vi.fn(() => "untouched source");
  const read_details = vi.fn(() => ({
    selection: { anchor: 3, head: 3, coordinates: "markdown" },
    parser: null,
  }));
  const on_change = vi.fn<(value: EditorDiagnosticSnapshot | null) => void>();
  const controller = create_editor_diagnostics({
    root,
    read_engine: () => "source",
    read_note_path: () => "a.md",
    read_source,
    read_details,
    on_change,
  });
  controllers.push(controller);
  return { root, read_source, read_details, on_change, controller };
}
describe("opt-in editor diagnostics", () => {
  it("does not collect events or read the editor while disabled", () => {
    const { root, read_source, read_details, on_change, controller } = setup();
    const listen = vi.spyOn(root, "addEventListener");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    controller.refresh();
    controller.schedule_refresh();
    expect(listen).not.toHaveBeenCalled();
    expect(read_source).not.toHaveBeenCalled();
    expect(read_details).not.toHaveBeenCalled();
    expect(on_change).not.toHaveBeenCalled();
  });
  it("captures bounded per-event positions and clears listeners when disabled", () => {
    const { root, read_source, on_change, controller } = setup();
    controller.set_enabled(true);
    read_source.mockClear();
    for (let index = 0; index < 110; index++)
      root.dispatchEvent(new KeyboardEvent("keydown", { key: String(index) }));
    expect(read_source).not.toHaveBeenCalled(); // Events record positions, never copy the whole note.
    controller.refresh();
    const snapshot = on_change.mock.lastCall?.[0];
    expect(snapshot?.trace).toHaveLength(100);
    expect(snapshot?.trace[0]?.detail).toBe("10");
    expect(snapshot?.trace[0]?.selection?.head).toBe(3);
    controller.clear();
    expect(on_change.mock.lastCall?.[0]?.trace).toEqual([]);
    controller.set_enabled(false);
    read_source.mockClear();
    on_change.mockClear();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    controller.refresh();
    expect(read_source).not.toHaveBeenCalled();
    expect(on_change).not.toHaveBeenCalled();
  });
  it("reports blocks intersecting the editor viewport, excluding hidden or offscreen blocks", () => {
    const { root, controller, on_change } = setup();
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 500, 400),
    );
    for (const top of [0, 150, 600]) {
      const row = document.createElement("div");
      row.className = "cm-line";
      root.append(row);
      const rect = new DOMRect(0, top, 500, 24);
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rect);
      vi.spyOn(row, "getClientRects").mockReturnValue({
        0: rect,
        length: 1,
        item: () => rect,
        [Symbol.iterator]: () => [rect].values(),
      });
    }
    controller.set_enabled(true);
    expect(
      on_change.mock.lastCall?.[0]?.blocks.map((block) => block.rect.y),
    ).toEqual([150]);
  });
});

it.each([0, 20])(
  "reports a caret of height %i honestly in snapshots and event traces",
  (height) => {
    const { root, controller, on_change } = setup();
    root.textContent = "text";
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(true);
    range.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 0, height));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    controller.set_enabled(true);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    controller.refresh();
    const expected = height === 0 ? null : { x: 0, y: 0, width: 0, height };
    expect(on_change.mock.lastCall?.[0]?.dom_selection?.caret).toEqual(
      expected,
    );
    expect(on_change.mock.lastCall?.[0]?.trace.at(-1)?.caret).toEqual(expected);
  },
);

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

import { EditorView } from "@milkdown/kit/prose/view";

const HOVER_DELAY_MS = 50;
const sessions: EditorSession[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await new Promise(requestAnimationFrame);
  for (const session of sessions) session.destroy();
  sessions.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function create_unfocused_editor_with_link() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const session = await create_milkdown_editor_port().start_session({
    root,
    initial_markdown: "See [docs](https://example.com) now\n",
    note_path: "first.md",
    vault_id: null,
    events: { on_markdown_change: vi.fn(), on_dirty_state_change: vi.fn() },
  });
  sessions.push(session);

  const editor_dom = root.querySelector<HTMLElement>(".ProseMirror");
  const preview = root.querySelector<HTMLElement>(".milkdown-link-preview");
  if (!editor_dom || !preview) throw new Error("expected editor and preview");
  // The adapter's setup already ran on real timers. Hover timing is ours to drive.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return { editor_dom, preview };
}

function focus_external_input() {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  expect(document.activeElement).toBe(input);
  return input;
}

function hover_at_doc_position(editor_dom: HTMLElement, pos: number) {
  vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue({
    pos,
    inside: pos,
  });
  editor_dom.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function wait_for_hover_delay() {
  vi.advanceTimersByTime(HOVER_DELAY_MS);
}

describe("link tooltip hover", () => {
  it("shows the preview when the editor does not have focus", async () => {
    const { editor_dom, preview } = await create_unfocused_editor_with_link();
    const external_input = focus_external_input();

    hover_at_doc_position(editor_dom, "See ".length + 2);
    expect(preview.dataset.show).toBe("false");
    wait_for_hover_delay();

    expect(preview.dataset.show).toBe("true");
    expect(preview.querySelector(".link-display")?.textContent).toBe(
      "https://example.com",
    );
    expect(document.activeElement).toBe(external_input);
  });

  it("closes the preview when the pointer leaves the tooltip for outside the editor", async () => {
    const { editor_dom, preview } = await create_unfocused_editor_with_link();
    vi.spyOn(EditorView.prototype, "hasFocus").mockReturnValue(true);
    hover_at_doc_position(editor_dom, "See ".length + 2);
    wait_for_hover_delay();
    editor_dom.dispatchEvent(new MouseEvent("mouseleave"));
    preview.dispatchEvent(new MouseEvent("mouseenter"));
    wait_for_hover_delay();
    expect(preview.dataset.show).toBe("true");

    preview.dispatchEvent(new MouseEvent("mouseleave"));
    wait_for_hover_delay();

    expect(preview.dataset.show).toBe("false");
  });
});

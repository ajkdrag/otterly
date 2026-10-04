/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorView as ProseView } from "@milkdown/kit/prose/view";
import { create_switchable_editor_port } from "$lib/features/editor/adapters/switchable_editor_adapter";
import { create_codemirror_editor_port } from "$lib/features/editor/adapters/codemirror_adapter";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import type { EditorSession } from "$lib/features/editor/ports";
let session: EditorSession | undefined;
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(ProseView.prototype, "coordsAtPos").mockReturnValue({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(async () => {
  await new Promise(requestAnimationFrame);
  session?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("preserves unedited raw bytes with both real engines and transfers intentional edits", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const raw = "#  Heading\r\n\r\n-   odd\u200b spacing\r\n";
  const port = create_switchable_editor_port({
    source: create_codemirror_editor_port({
      resolve_asset_url_for_vault: (_vault, path) => path,
      copy_text: async () => {},
    }),
    milkdown: () => Promise.resolve(create_milkdown_editor_port()),
  });
  session = await port.start_session({
    root,
    initial_markdown: raw,
    note_path: "a.md",
    vault_id: null,
    events: { on_markdown_change: vi.fn(), on_dirty_state_change: vi.fn() },
  });
  await session.switch_engine?.("milkdown");
  expect(session.get_markdown()).toBe(raw);
  expect(session.is_dirty()).toBe(false);
  session.open_buffer({
    note_path: "b.md",
    vault_id: null,
    initial_markdown: raw + "tail\u200b",
    restore_policy: "fresh",
  });
  expect(session.get_markdown()).toBe(raw + "tail\u200b");
  expect(session.is_dirty()).toBe(false);
  await session.switch_engine?.("source");
  expect(session.get_markdown()).toBe(raw + "tail\u200b");
  await session.switch_engine?.("milkdown");
  session.set_selection(1, 1);
  session.insert_text_at_cursor("typed ");
  const edited = session.get_markdown();
  expect(edited).toContain("typed");
  expect(session.is_dirty()).toBe(true);
  await session.switch_engine?.("source");
  expect(session.get_markdown()).toBe(edited);
  expect(session.is_dirty()).toBe(true);
});

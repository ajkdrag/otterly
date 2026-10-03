/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import type { EditorSession } from "$lib/features/editor/ports";
import { heading_filename_from_markdown } from "$lib/features/note/domain/heading_filename";

import { EditorView } from "@milkdown/kit/prose/view";

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
  vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
});

afterEach(async () => {
  await new Promise(requestAnimationFrame);
  for (const session of sessions) session.destroy();
  sessions.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function create_session(markdown = "Original") {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const on_markdown_change = vi.fn<(markdown: string) => void>();
  const on_dirty_state_change = vi.fn<(is_dirty: boolean) => void>();
  const session = await create_milkdown_editor_port().start_session({
    root,
    initial_markdown: markdown,
    note_path: "first.md",
    vault_id: null,
    events: { on_markdown_change, on_dirty_state_change },
  });
  sessions.push(session);
  return { session, on_markdown_change, on_dirty_state_change, root };
}

describe("Milkdown markdown synchronization", () => {
  it("keeps an untouched structured document clean after startup", async () => {
    const markdown =
      "# Heading\n\n- [x] Done\n  - [ ] Child\n\n```python\nx = 1\n```\n\nLast paragraph.\n";
    const { session, on_dirty_state_change } = await create_session(markdown);
    expect(session.is_dirty()).toBe(false);
    expect(on_dirty_state_change).not.toHaveBeenCalledWith(true);
    expect(session.get_markdown()).toBe(markdown);
    await new Promise(requestAnimationFrame);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(session.is_dirty()).toBe(false);
    expect(on_dirty_state_change).not.toHaveBeenCalledWith(true);
    expect(session.get_markdown()).toBe(markdown);
  });

  it("serializes heading edge spaces as character references that filename suggestion reads", async () => {
    const update_state = vi.spyOn(EditorView.prototype, "updateState");
    const { session } = await create_session("# Title");
    session.insert_text_at_cursor("x");
    const view = update_state.mock.contexts.at(-1) as EditorView | undefined;
    if (!view) throw new Error("expected the editor view");

    view.dispatch(
      view.state.tr.insertText(
        "        The short version.   ",
        1,
        view.state.doc.content.size - 1,
      ),
    );

    const markdown = session.get_markdown();
    expect(markdown).toBe("# &#x20;       The short version.   \n");
    expect(heading_filename_from_markdown(markdown, "hyphens")).toBe(
      "the-short-version",
    );
  });

  it("reads the live document immediately after an edit", async () => {
    const { session } = await create_session();
    session.insert_text_at_cursor("Latest ");
    expect(session.get_markdown()).toContain("Latest");
  });

  it("keeps recent edits when switching buffers before the listener fires", async () => {
    const { session, on_markdown_change } = await create_session();
    session.insert_text_at_cursor("Latest ");
    session.open_buffer({
      note_path: "second.md",
      vault_id: null,
      initial_markdown: "Second note",
      restore_policy: "reuse_cache",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(session.get_markdown()).toBe("Second note");
    expect(on_markdown_change.mock.lastCall?.[0]).toBe("Second note");
    session.open_buffer({
      note_path: "first.md",
      vault_id: null,
      initial_markdown: "Original",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toContain("Latest");
  });

  it("keeps unedited source formatting when reading a document", async () => {
    const markdown = "- one\n- two\n";
    const { session } = await create_session(markdown);
    expect(session.get_markdown()).toBe(markdown);
  });

  it("publishes an undo after an immediate read before the listener fires", async () => {
    const { session, root, on_markdown_change } = await create_session();
    session.insert_text_at_cursor("Latest ");
    expect(session.get_markdown()).toContain("Latest");
    root.querySelector(".ProseMirror")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(root.querySelector(".ProseMirror")?.textContent).toBe("Original");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(on_markdown_change.mock.lastCall?.[0].trim()).toBe("Original");
  });

  it.each([true, false])(
    "restores an inactive saved buffer without clearing later edits (matches: %s)",
    async (matches) => {
      const { session } = await create_session();
      session.insert_text_at_cursor("Saved ");
      const saved_markdown = session.get_markdown();
      if (!matches) session.insert_text_at_cursor("Later ");
      session.open_buffer({
        note_path: "second.md",
        vault_id: null,
        initial_markdown: "Second",
        restore_policy: "reuse_cache",
      });
      session.mark_clean("first.md", saved_markdown);
      expect(session.is_dirty()).toBe(false);
      session.open_buffer({
        note_path: "first.md",
        vault_id: null,
        initial_markdown: "Original",
        restore_policy: "reuse_cache",
      });
      expect(session.is_dirty()).toBe(!matches);
      expect(session.get_markdown()).toContain(matches ? "Saved" : "Later");
    },
  );

  it.each([false, true])(
    "compares undo against the completed save after later typing (inactive: %s)",
    async (inactive) => {
      const { session, root } = await create_session();
      session.insert_text_at_cursor("Saved ");
      const saved_markdown = session.get_markdown();
      session.insert_text_at_cursor("Later ");
      if (inactive) {
        session.open_buffer({
          note_path: "second.md",
          vault_id: null,
          initial_markdown: "Second",
          restore_policy: "reuse_cache",
        });
      }
      session.mark_clean("first.md", saved_markdown);
      if (inactive) {
        session.open_buffer({
          note_path: "first.md",
          vault_id: null,
          initial_markdown: "Original",
          restore_policy: "reuse_cache",
        });
      }
      expect(session.is_dirty()).toBe(true);
      root.querySelector(".ProseMirror")?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      expect(root.querySelector(".ProseMirror")?.textContent).toBe("Original");
      expect(session.is_dirty()).toBe(true);
      session.set_markdown(saved_markdown);
      expect(session.is_dirty()).toBe(false);
    },
  );

  it.each(["# Heading\n\nOriginal", "[link](target.md)", "[[target]]"])(
    "recognizes saved content after a pending save and normalization: %s",
    async (markdown) => {
      const { session, root } = await create_session(markdown);
      session.insert_text_at_cursor("Saved ");
      const saved_markdown = session.get_markdown();
      await new Promise((resolve) => setTimeout(resolve, 550));
      session.insert_text_at_cursor("Later ");
      session.mark_clean("first.md", saved_markdown);
      expect(session.is_dirty()).toBe(true);
      root.querySelector(".ProseMirror")?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      expect(session.get_markdown()).toBe(saved_markdown);
      expect(session.is_dirty()).toBe(false);
    },
  );

  it("opens a fresh large heading buffer clean and marks its first edit dirty", async () => {
    const { session } = await create_session();
    session.open_buffer({
      note_path: "large.md",
      vault_id: null,
      initial_markdown: "# Heading\n\n" + "a".repeat(400_001),
      restore_policy: "fresh",
    });
    expect(session.is_dirty()).toBe(false);
    session.insert_text_at_cursor("Latest ");
    expect(session.is_dirty()).toBe(true);
  });

  it("marks the first edit of a large note dirty", async () => {
    const { session } = await create_session("a".repeat(400_001));
    session.insert_text_at_cursor("Latest ");
    expect(session.is_dirty()).toBe(true);
  });
});

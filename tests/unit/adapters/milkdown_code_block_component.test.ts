/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { Editor, editorViewCtx } from "@milkdown/kit/core";
import { create_milkdown_editor_port } from "$lib/features/editor/adapters/milkdown_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  readonly observed = new Set<Element>();

  constructor(private callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  show(target: Element): void {
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

async function open_editor(markdown: string): Promise<{
  root: HTMLElement;
  session: EditorSession;
  block: HTMLElement;
}> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const session = await create_milkdown_editor_port().start_session({
    root,
    initial_markdown: markdown,
    note_path: "code.md",
    vault_id: null,
    events: {
      on_markdown_change() {},
      on_dirty_state_change() {},
    },
  });
  const block = root.querySelector<HTMLElement>(".milkdown-code-block");
  if (!block) throw new Error("Expected Milkdown code block");
  return { root, session, block };
}

async function show_code_mirror(block: HTMLElement): Promise<CodeMirrorView> {
  const observer = TestIntersectionObserver.instances.find((instance) =>
    instance.observed.has(block),
  );
  if (!observer) throw new Error("Expected code block to be observed");
  observer.show(block);
  await Promise.resolve();
  await Promise.resolve();
  const content = block.querySelector<HTMLElement>(".cm-content");
  if (!content) throw new Error("Expected CodeMirror content");
  const cm = CodeMirrorView.findFromDOM(content);
  if (!cm) throw new Error("Expected CodeMirror view");
  return cm;
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (Range.prototype as { getClientRects?: () => DOMRectList })
    .getClientRects;
  delete (Range.prototype as { getBoundingClientRect?: () => DOMRect })
    .getBoundingClientRect;
  document.body.replaceChildren();
});

describe("Milkdown CodeMirror code blocks", () => {
  it("initializes only near view and syncs a CodeMirror edit to Markdown", async () => {
    const { root, session, block } = await open_editor(
      "```js\nconst x = 1\n```",
    );
    expect(
      block.querySelector(".milkdown-code-block-placeholder code")?.textContent,
    ).toBe("const x = 1");
    expect(block.querySelector(".cm-editor")).toBeNull();

    const cm = await show_code_mirror(block);
    expect(block.querySelector(".code-block-resize-handle")).not.toBeNull();
    cm.focus();
    cm.dispatch({ changes: { from: cm.state.doc.length, insert: ";" } });

    expect(session.get_markdown()).toContain("const x = 1;");
    session.destroy();
    root.remove();
  });

  it("uses the note history for undo and redo inside code", async () => {
    const { root, session, block } = await open_editor(
      "```js\nconst x = 1\n```",
    );
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ changes: { from: cm.state.doc.length, insert: ";" } });
    expect(session.get_markdown()).toContain("const x = 1;");

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        [navigator.platform.includes("Mac") ? "metaKey" : "ctrlKey"]: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(session.get_markdown()).toContain("const x = 1\n");

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        [navigator.platform.includes("Mac") ? "metaKey" : "ctrlKey"]: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(session.get_markdown()).toContain("const x = 1;");
    session.destroy();
    root.remove();
  });

  it("returns focus to the note at the first code line boundary", async () => {
    const { root, session, block } = await open_editor(
      "Before\n\n```js\nconst x = 1\n```",
    );
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: 0 } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(document.activeElement).toBe(root.querySelector(".ProseMirror"));
    session.destroy();
    root.remove();
  });

  it.each(["ArrowUp", "ArrowLeft"])(
    "%s creates a paragraph before a leading code block",
    async (key) => {
      const original = "```text\nfirst line\nlast line\n```";
      const { root, session, block } = await open_editor(original);
      const cm = await show_code_mirror(block);
      cm.focus();
      cm.dispatch({ selection: { anchor: 0 } });

      cm.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(root.querySelector(".ProseMirror"));
      session.insert_text_at_cursor("BEFORECODE");
      expect(session.get_markdown().trimEnd()).toBe(
        `BEFORECODE\n\n${original}`,
      );

      session.destroy();
      root.remove();
    },
  );

  it.each(["ArrowDown", "ArrowRight"])(
    "%s creates a paragraph after a trailing code block",
    async (key) => {
      const original = "```text\nfirst line\nlast line\n```";
      const { root, session, block } = await open_editor(original);
      const cm = await show_code_mirror(block);
      cm.focus();
      cm.dispatch({ selection: { anchor: cm.state.doc.length } });

      cm.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(root.querySelector(".ProseMirror"));
      session.insert_text_at_cursor("AFTERCODE");
      expect(session.get_markdown().trimEnd()).toBe(`${original}\n\nAFTERCODE`);

      session.destroy();
      root.remove();
    },
  );

  it.each(["ArrowUp", "ArrowLeft"])(
    "%s creates a paragraph before code at the start of a quote",
    async (key) => {
      const original = "> ```text\n> first line\n> last line\n> ```";
      const { root, session, block } = await open_editor(original);
      const cm = await show_code_mirror(block);
      cm.focus();
      cm.dispatch({ selection: { anchor: 0 } });

      cm.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(root.querySelector(".ProseMirror"));
      session.insert_text_at_cursor("BEFORECODE");
      expect(session.get_markdown()).toContain("> BEFORECODE\n>\n> ```text");
      expect(session.get_markdown()).toContain("> last line\n> ```");

      session.destroy();
      root.remove();
    },
  );

  it.each(["ArrowDown", "ArrowRight"])(
    "%s creates a paragraph after code at the end of a quote",
    async (key) => {
      const original = "> ```text\n> first line\n> last line\n> ```";
      const { root, session, block } = await open_editor(original);
      const cm = await show_code_mirror(block);
      cm.focus();
      cm.dispatch({ selection: { anchor: cm.state.doc.length } });

      cm.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(root.querySelector(".ProseMirror"));
      session.insert_text_at_cursor("AFTERCODE");
      expect(session.get_markdown()).toContain("> ```\n>\n> AFTERCODE");

      session.destroy();
      root.remove();
    },
  );

  it("uses an existing paragraph beside nested code without adding one", async () => {
    const original = "> Before\n>\n> ```text\n> code\n> ```\n>\n> After";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    const paragraph_count = root.querySelectorAll("blockquote p").length;
    cm.focus();
    cm.dispatch({ selection: { anchor: cm.state.doc.length } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("blockquote p")).toHaveLength(paragraph_count);
    expect(session.get_markdown().trimEnd()).toBe(original);
    session.insert_text_at_cursor("NEXT");
    expect(session.get_markdown()).toContain("> NEXT");
    expect(session.get_markdown()).toContain("> code\n> ```");

    session.destroy();
    root.remove();
  });

  it("undoes a paragraph inserted beside nested code", async () => {
    const original = "> ```text\n> code\n> ```";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: cm.state.doc.length } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("blockquote p")).toHaveLength(1);
    root.querySelector(".ProseMirror")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        [navigator.platform.includes("Mac") ? "metaKey" : "ctrlKey"]: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("blockquote p")).toHaveLength(0);
    expect(session.get_markdown().trimEnd()).toBe(original);

    session.destroy();
    root.remove();
  });

  it("creates an editable paragraph after code inside a list item", async () => {
    const original = "- item\n\n  ```text\n  code\n  ```";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: cm.state.doc.length } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("li p")).toHaveLength(2);
    session.insert_text_at_cursor("AFTERLISTCODE");
    expect(session.get_markdown()).toContain("  AFTERLISTCODE");

    session.destroy();
    root.remove();
  });

  it("does not escape a nonempty CodeMirror selection", async () => {
    const original = "> ```text\n> code\n> ```";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: 0, head: 2 } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("blockquote p")).toHaveLength(0);
    expect(session.get_markdown().trimEnd()).toBe(original);

    session.destroy();
    root.remove();
  });

  it("does not insert a paragraph when the note is read-only", async () => {
    const original = "> ```text\n> code\n> ```";
    let editor: Editor | undefined;
    const make_editor = Editor.make.bind(Editor);
    const make_spy = vi.spyOn(Editor, "make").mockImplementation(() => {
      editor = make_editor();
      return editor;
    });
    const { root, session, block } = await open_editor(original);
    make_spy.mockRestore();
    if (!editor) throw new Error("Expected Milkdown editor");
    const view = editor.ctx.get(editorViewCtx);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: cm.state.doc.length } });
    view.setProps({ editable: () => false });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll("blockquote p")).toHaveLength(0);
    expect(session.get_markdown().trimEnd()).toBe(original);

    session.destroy();
    root.remove();
  });

  it("keeps arrow navigation inside middle code lines", async () => {
    const original = "```text\nfirst line\nmiddle line\nlast line\n```";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: cm.state.doc.line(2).from + 3 } });

    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(cm.contentDOM);
    expect(session.get_markdown()).toBe(original);

    session.destroy();
    root.remove();
  });

  it("undoes an edge paragraph with the note's history", async () => {
    const original = "```text\nfirst line\nlast line\n```";
    const { root, session, block } = await open_editor(original);
    const cm = await show_code_mirror(block);
    cm.focus();
    cm.dispatch({ selection: { anchor: 0 } });
    cm.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll(".ProseMirror > p")).toHaveLength(1);

    root.querySelector(".ProseMirror")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        [navigator.platform.includes("Mac") ? "metaKey" : "ctrlKey"]: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.querySelectorAll(".ProseMirror > p")).toHaveLength(0);
    expect(session.get_markdown().trimEnd()).toBe(original);

    session.destroy();
    root.remove();
  });

  it("filters then selects plain text with Down and Enter", async () => {
    const { root, session, block } = await open_editor(
      "```js\nconst x = 1\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const search = block.querySelector<HTMLInputElement>(".search-input");
    if (!search) throw new Error("Expected language search input");
    search.focus();
    search.value = "plain";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    const plain = block.querySelector<HTMLElement>(
      '.language-list-item[data-language=""]',
    );
    if (!plain) throw new Error("Expected plain language option");
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(plain);
    plain.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(session.get_markdown()).toContain("```\nconst x = 1\n```");
    await Promise.resolve();
    expect(trigger.dataset.expanded).toBe("false");
    expect(block.querySelector(".search-input")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    session.destroy();
    root.remove();
  });

  it("marks an alias language as current without duplicating its search result", async () => {
    const { root, session, block } = await open_editor(
      "```js\nconst x = 1\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    expect(trigger.textContent).toContain("JavaScript");
    expect(trigger.title).toBe("Markdown fence: js");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const search = block.querySelector<HTMLInputElement>(".search-input");
    const current = block.querySelector<HTMLElement>(
      '.language-list-item[data-language="JavaScript"]',
    );
    if (!search || !current) throw new Error("Expected JavaScript option");
    expect(current.getAttribute("aria-selected")).toBe("true");
    expect(current.getAttribute("role")).toBe("option");
    expect(
      current.querySelector(".language-list-aliases")?.textContent,
    ).toContain("js");

    search.value = "javascript";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    const results = block.querySelectorAll<HTMLElement>(
      ".language-list-item[data-language]",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.dataset.language).toBe("JavaScript");
    expect(results[0]?.getAttribute("aria-selected")).toBe("true");
    expect(session.get_markdown()).toContain("```js");
    session.destroy();
    root.remove();
  });

  it("shows the canonical grammar and the original fence without rewriting Markdown", async () => {
    const { root, session, block } = await open_editor(
      "```bash\necho hello\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    expect(trigger?.textContent).toContain("Shell");
    expect(trigger?.textContent).not.toContain("bash");
    expect(trigger?.title).toBe("Markdown fence: bash");
    trigger?.click();
    await Promise.resolve();
    await Promise.resolve();
    const shell_option = block.querySelector<HTMLElement>(
      '.language-list-item[data-language="Shell"]',
    );
    expect(shell_option?.getAttribute("role")).toBe("option");
    expect(
      shell_option?.querySelector(".language-list-aliases")?.textContent,
    ).toBe("bash, sh, zsh");
    expect(session.get_markdown()).toContain("```bash\necho hello\n```");
    session.destroy();
    root.remove();

    const unknown = await open_editor("```my-tool\nhello\n```");
    await show_code_mirror(unknown.block);
    const unknown_trigger =
      unknown.block.querySelector<HTMLButtonElement>(".language-button");
    expect(unknown_trigger?.textContent).toContain("my-tool");
    expect(unknown_trigger?.title).toBe("Markdown fence: my-tool");
    expect(unknown.session.get_markdown()).toContain("```my-tool");
    unknown.session.destroy();
    unknown.root.remove();

    const plain = await open_editor("```text\nhello\n```");
    await show_code_mirror(plain.block);
    const plain_trigger =
      plain.block.querySelector<HTMLButtonElement>(".language-button");
    expect(plain_trigger?.textContent).toContain("Plain");
    expect(plain_trigger?.title).toBe("Markdown fence: text");
    expect(plain.session.get_markdown()).toContain("```text");
    plain.session.destroy();
    plain.root.remove();
  });

  it("starts keyboard search at the matching language, not the current one", async () => {
    const { root, session, block } = await open_editor(
      "```python\nprint('hello')\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const search = block.querySelector<HTMLInputElement>(".search-input");
    if (!search) throw new Error("Expected language search input");
    search.focus();
    search.value = "javascript";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    const items = block.querySelectorAll<HTMLElement>(
      ".language-list-item[data-language]",
    );
    expect(Array.from(items, (item) => item.dataset.language)).toEqual([
      "JavaScript",
    ]);
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(session.get_markdown()).toContain("```JavaScript");
    await Promise.resolve();
    expect(trigger.dataset.expanded).toBe("false");
    expect(document.activeElement).toBe(trigger);
    session.destroy();
    root.remove();
  });

  it("returns focus to the language trigger after mouse selection", async () => {
    const { root, session, block } = await open_editor(
      "```python\nprint('hello')\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const option = block.querySelector<HTMLElement>(
      '.language-list-item[data-language="JavaScript"]',
    );
    if (!option) throw new Error("Expected JavaScript option");
    option.click();

    expect(session.get_markdown()).toContain("```JavaScript");
    await Promise.resolve();
    expect(trigger.dataset.expanded).toBe("false");
    expect(document.activeElement).toBe(trigger);
    session.destroy();
    root.remove();
  });

  it("moves among language results and closes on Escape", async () => {
    const { root, session, block } = await open_editor(
      "```js\nconst x = 1\n```",
    );
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const search = block.querySelector<HTMLInputElement>(".search-input");
    const items = block.querySelectorAll<HTMLElement>(
      ".language-list-item[data-language]",
    );
    if (!search || items.length < 2)
      throw new Error("Expected searchable language results");
    search.focus();
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(items[1]);
    items[1]?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(items[0]);
    items[0]?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
    expect(trigger.dataset.expanded).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(session.get_markdown()).toContain("```js");
    session.destroy();
    root.remove();
  });

  it("leaves the picker open while Enter confirms text composition", async () => {
    const original = "```js\nconst x = 1\n```";
    const { root, session, block } = await open_editor(original);
    await show_code_mirror(block);
    const trigger = block.querySelector<HTMLButtonElement>(".language-button");
    if (!trigger) throw new Error("Expected language picker trigger");
    trigger.click();
    await Promise.resolve();
    await Promise.resolve();

    const search = block.querySelector<HTMLInputElement>(".search-input");
    if (!search) throw new Error("Expected language search input");
    search.focus();
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(trigger.dataset.expanded).toBe("true");
    expect(document.activeElement).toBe(search);
    expect(session.get_markdown().trimEnd()).toBe(original);
    session.destroy();
    root.remove();
  });
});

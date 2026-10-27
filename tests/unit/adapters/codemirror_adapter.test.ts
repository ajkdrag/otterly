/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import {
  LanguageDescription,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import {
  apply_vimrc,
  read_code_block_view_states,
  source_undo,
  source_redo,
} from "@otterly/markdown-editor";
import { create_codemirror_editor_port } from "$lib/features/editor/adapters/codemirror_adapter";
import { code_languages } from "$lib/features/editor/adapters/code_editor_config";
import type {
  EditorSession,
  EditorEventHandlers,
} from "$lib/features/editor/ports";
import { as_vault_id } from "$lib/shared/types/ids";
import * as mermaid_preview from "$lib/features/editor/adapters/mermaid_preview";
import { use_keyboard_shortcuts } from "$lib/hooks/use_keyboard_shortcuts.svelte";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

const sessions: EditorSession[] = [];
beforeEach(() => {
  // These tests verify session state. Native acceptance covers actual layout.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(() => {
  for (const session of sessions) session.destroy();
  sessions.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  apply_vimrc("set clipboard=");
});

async function open_editor(
  markdown: string,
  resolve_asset_url_for_vault = (_vault: unknown, path: string) =>
    `asset://${path}`,
  note_path = "alpha.md",
) {
  const root = document.createElement("div");
  document.body.append(root);
  const events = {
    on_markdown_change: vi.fn(),
    on_dirty_state_change: vi.fn(),
    on_cursor_change:
      vi.fn<NonNullable<EditorEventHandlers["on_cursor_change"]>>(),
    on_code_block_view_states_change: vi.fn(),
    on_view_mode_change:
      vi.fn<NonNullable<EditorEventHandlers["on_view_mode_change"]>>(),
    on_vim_status_change:
      vi.fn<NonNullable<EditorEventHandlers["on_vim_status_change"]>>(),
    on_save_request: vi.fn(() => Promise.resolve()),
    on_close_request: vi.fn(),
  };
  const read_clipboard_text = vi.fn(() => Promise.resolve("from outside"));
  const port = create_codemirror_editor_port({
    resolve_asset_url_for_vault,
    copy_text: vi.fn(async () => {}),
    read_clipboard_text,
  });
  const session = await port.start_session({
    root,
    initial_markdown: markdown,
    note_path,
    vault_id: as_vault_id("test-vault"),
    vim_enabled: false,
    events,
  });
  sessions.push(session);
  const dom = root.querySelector<HTMLElement>(".cm-editor");
  if (!dom) throw new Error("Missing editor");
  const view = EditorView.findFromDOM(dom);
  if (!view) throw new Error("Missing view");
  return { root, session, view, events, read_clipboard_text };
}

function press_vim_keys(view: EditorView, ...keys: string[]) {
  for (const key of keys)
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
}

function run_ex_command(view: EditorView, command: string) {
  press_vim_keys(view, ":");
  const input = view.dom.querySelector<HTMLInputElement>(".cm-vim-panel input");
  if (!input) throw new Error("The : prompt did not open");
  input.value = command;
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("CodeMirror editor port", () => {
  it("reports the tag at the caret only while the note has focus", async () => {
    const { session, view } = await open_editor("see #idea now\n");
    session.set_selection(9, 9);
    expect(view.hasFocus).toBe(true);
    expect(session.tag_at_cursor()).toBe("idea");

    view.contentDOM.blur();
    expect(session.tag_at_cursor()).toBeNull();
  });

  it("draws tag chips that are not clickable when the host has no tag click handler", async () => {
    const plain = await open_editor("top\n\nsee #idea");
    expect(plain.view.dom.querySelector(".md-tag")?.textContent).toBe("#idea");
    expect(plain.view.dom.querySelector(".md-tag-clickable")).toBeNull();
  });

  it("passes malformed percent escapes through as a local asset path", async () => {
    const resolve_asset = vi.fn((_vault: unknown, path: string) => path);
    const source = "intro\n\n![broken path](assets/bad%ZZ.png)";
    const { session, view } = await open_editor(source, resolve_asset);
    await vi.waitFor(() => {
      expect(resolve_asset).toHaveBeenCalledWith(
        as_vault_id("test-vault"),
        "assets/bad%ZZ.png",
      );
    });
    expect(session.get_markdown()).toBe(source);
    expect(view.dom.querySelector(".md-image img")).not.toBeNull();
  });

  it.each([1, -1])(
    "moves from code into the adjacent table at its text boundary (%s)",
    async (direction) => {
      const code = "```\nhello\n```";
      const table = "| H | Other |\n| --- | --- |\n| first | last |";
      const source = direction > 0 ? code + "\n" + table : table + "\n" + code;
      const { session, root, view } = await open_editor(source);
      const position = source.indexOf("hello") + (direction > 0 ? 5 : 0);
      session.set_selection(position, position);
      const content = root.querySelector<HTMLElement>(
        ".md-code-source .cm-content",
      );
      if (!content) throw new Error("Missing code");
      content.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: direction > 0 ? "ArrowRight" : "ArrowLeft",
          bubbles: true,
          cancelable: true,
        }),
      );
      const cell = root.querySelector(".md-table-cell-active");
      expect(cell?.contains(document.activeElement)).toBe(true);
      expect(cell?.textContent).toBe(direction > 0 ? "H" : "last");
      expect(view.state.selection.main.head).toBe(
        direction > 0 ? source.indexOf("H") : source.indexOf("last") + 4,
      );
      expect(session.get_markdown()).toBe(source);
    },
  );
  it.each(["code", "table"])(
    "saves the latest %s input through the app shortcut before the debounce",
    async (kind) => {
      vi.useFakeTimers();
      const source =
        kind === "code" ? "```\nhello\n```" : "| H |\n| --- |\n| hello |";
      const { session, root, events } = await open_editor(source);
      const registry = new ActionRegistry();
      const save = vi.fn(() => session.get_markdown());
      registry.register({
        id: ACTION_IDS.note_request_save,
        label: "Save",
        execute: () => {
          save();
        },
      });
      const keyboard = use_keyboard_shortcuts({
        hotkeys_config: () => ({ bindings: DEFAULT_HOTKEYS }),
        is_enabled: () => true,
        is_blocked: () => false,
        is_omnibar_topmost: () => false,
        is_vault_switcher_open: () => false,
        is_hotkey_recorder_open: () => false,
        is_vim_enabled: () => false,
        has_tabs: () => true,
        action_registry: registry,
        on_close_vault_switcher: vi.fn(),
        on_select_pinned_vault: vi.fn(),
        on_switch_to_tab: vi.fn(),
      });
      root.addEventListener("keydown", keyboard.handle_keydown_capture, true);
      root.addEventListener("keydown", keyboard.handle_keydown);
      const position = source.indexOf("hello") + 5;
      session.set_selection(position, position);
      let content: HTMLElement;
      if (kind === "code") {
        const code = root.querySelector<HTMLElement>(
          ".md-code-source .cm-content",
        );
        if (!code) throw new Error("Missing code");
        content = code;
        const inner = EditorView.findFromDOM(code);
        if (!inner) throw new Error("Missing code editor");
        inner.dispatch({
          changes: { from: 5, insert: " typed" },
          selection: { anchor: 11 },
          userEvent: "input.type",
        });
      } else {
        const cell = root.querySelector<HTMLElement>(
          ".md-table-cell-active .cm-content",
        );
        if (!cell) throw new Error("Missing cell");
        content = cell;
        const inner = EditorView.findFromDOM(cell);
        if (!inner) throw new Error("Missing cell editor");
        inner.dispatch({
          changes: { from: 5, insert: " typed" },
          selection: { anchor: 11 },
          userEvent: "input.type",
        });
      }
      content.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.results[0]?.value).toBe(
        source.replace("hello", "hello typed"),
      );
      expect(events.on_markdown_change).not.toHaveBeenCalled();
    },
  );
  it("focuses a table cell from an outer source selection", async () => {
    const source = "| H | Other |\n| --- | --- |\n| alpha | beta |";
    const { session, view, root } = await open_editor(source);
    const start = source.indexOf("alpha");
    session.set_selection(start + 1, start + 4);
    const cell = root.querySelector(".md-table-cell-active");
    expect(cell?.contains(document.activeElement)).toBe(true);
    expect(view.state.selection.main.anchor).toBe(start + 1);
    expect(view.state.selection.main.head).toBe(start + 4);
  });
  it("refreshes diagrams after a theme change and disconnects the observer on destroy", async () => {
    const render = vi
      .spyOn(mermaid_preview, "render_mermaid_element")
      .mockImplementation(() => Promise.resolve(document.createElement("div")));
    const previous = document.documentElement.getAttribute("data-color-scheme");
    const source = "```mermaid\ngraph TD; A-->B\n```";
    const { session } = await open_editor(source);
    expect(render).toHaveBeenCalledTimes(1);
    document.documentElement.setAttribute(
      "data-color-scheme",
      previous === "dark" ? "light" : "dark",
    );
    await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
    expect(session.get_markdown()).toBe(source);
    expect(session.is_dirty()).toBe(false);
    session.destroy();
    if (previous === null)
      document.documentElement.removeAttribute("data-color-scheme");
    else document.documentElement.setAttribute("data-color-scheme", previous);
    await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("re-reads text metrics when zoom changes the root style", async () => {
    // A theme change is what makes CodeMirror re-read line heights. Each
    // theme adds its own class to the editor.
    const { view } = await open_editor("text");
    const classes_before = view.dom.className;
    document.documentElement.style.setProperty("--editor-zoom", "1.4");
    await Promise.resolve();
    expect(view.dom.className).not.toBe(classes_before);
    document.documentElement.style.removeProperty("--editor-zoom");
  });

  it("focuses embedded code after selecting and inserting at source offsets", async () => {
    const { session, root } = await open_editor("```\nhello\n```");
    session.set_selection(5, 8);
    const content = root.querySelector<HTMLElement>(
      ".md-code-source .cm-content",
    );
    if (!content) throw new Error("Missing code editor");
    const inner = EditorView.findFromDOM(content);
    if (!inner) throw new Error("Missing code view");
    expect(inner.hasFocus).toBe(true);
    expect(inner.state.selection.main.anchor).toBe(1);
    expect(inner.state.selection.main.head).toBe(4);
    session.insert_text_at_cursor("X");
    expect(session.get_markdown()).toBe("```\nhXo\n```");
    expect(inner.state.selection.main.head).toBe(2);
    expect(inner.hasFocus).toBe(true);
  });
  it("refreshes word counts when a changed buffer is reopened before its notification timer", async () => {
    vi.useFakeTimers();
    const { session, events } = await open_editor("alpha");
    session.insert_text_at_cursor("new ");
    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "beta",
      restore_policy: "reuse_cache",
    });
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "alpha",
      restore_policy: "reuse_cache",
    });
    expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(2);
  });

  it("counts visible text rather than Markdown syntax or destinations", async () => {
    const { events } = await open_editor(
      "# Heading\n\n- [x] A **bold** word\n\n[linked text](somewhere.md) ![image alt](image.png)\n\n~~~js\nconst value = 1\n~~~\n\n| Left | Right |\n| --- | --- |\n| one | two |\n\n---",
    );
    expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(14);
  });
  it("finishes the first parse before opening a medium note", async () => {
    const code_blocks = Array.from({ length: 22 }, (_, index) => {
      const lines = Array.from(
        { length: 30 },
        (_, line) => `const item_${String(index)}_${String(line)} = "value";`,
      );
      return `~~~\n${lines.join("\n")}\n~~~`;
    });
    const tables = Array.from(
      { length: 4 },
      (_, index) =>
        `| Left ${String(index)} | Right |\n| --- | --- |\n| first | second |`,
    );
    const source = [...code_blocks, ...tables].join("\n\n");
    expect(source.length).toBeLessThan(50_000);

    // Make each parser deadline expire between work steps without relying on
    // host CPU contention. The bounded small-note path must still publish its
    // completed tree before open_buffer returns.
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => {
      clock += 25;
      return clock;
    });
    const { session, view, events } = await open_editor("old note");
    session.open_buffer({
      note_path: "medium.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: source,
      restore_policy: "fresh",
    });

    expect(syntaxTreeAvailable(view.state, view.state.doc.length)).toBe(true);
    expect(syntaxTree(view.state).length).toBe(view.state.doc.length);
    // Block widgets consume the published tree in their existing microtask,
    // before the next browser paint.
    await Promise.resolve();
    expect(read_code_block_view_states(view.state)).toHaveLength(22);
    expect(events.on_cursor_change.mock.lastCall?.[0].word_count_pending).toBe(
      false,
    );
  });
  it("finishes a large note's exact word count after opening", async () => {
    const paragraphs = Array.from(
      { length: 3_000 },
      () => "some **visible** words",
    );
    const source = `# Heading\n\n${paragraphs.join("\n\n")}`;
    const { events } = await open_editor(source);

    expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(0);
    expect(events.on_cursor_change.mock.lastCall?.[0].word_count_pending).toBe(
      true,
    );
    await vi.waitFor(
      () => {
        expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(
          9_001,
        );
        expect(
          events.on_cursor_change.mock.lastCall?.[0].word_count_pending,
        ).toBe(false);
      },
      { timeout: 5_000 },
    );
  });
  it("counts a complete Markdown tree while a fenced code grammar is still loading", async () => {
    const pending_language = LanguageDescription.of({
      name: "pending-test-language",
      load: () => new Promise(() => {}),
    });
    code_languages.push(pending_language);
    try {
      const paragraphs = Array.from(
        { length: 3_000 },
        () => "some visible words in this paragraph",
      );
      const source = `${paragraphs.join("\n\n")}\n\n~~~pending-test-language\nconst hidden = true\n~~~`;
      const { events, view } = await open_editor(source);

      await vi.waitFor(() => {
        expect(syntaxTree(view.state).length).toBe(source.length);
        expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(
          18_004,
        );
        expect(
          events.on_cursor_change.mock.lastCall?.[0].word_count_pending,
        ).toBe(false);
      });
    } finally {
      const index = code_languages.indexOf(pending_language);
      if (index >= 0) code_languages.splice(index, 1);
    }
  });
  it("publishes a completed cached parse before counting", async () => {
    const paragraphs = Array.from(
      { length: 12_000 },
      () => "some visible words in this paragraph",
    );
    const source = paragraphs.join("\n\n");
    const { session, view, events } = await open_editor("original note");
    session.open_buffer({
      note_path: "large.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: source,
      restore_policy: "fresh",
    });

    expect(view.state.doc.length).toBeGreaterThan(50_000);

    session.open_buffer({
      note_path: "other.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "other note",
      restore_policy: "fresh",
    });
    session.open_buffer({
      note_path: "large.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "stale disk content",
      restore_policy: "reuse_cache",
    });

    await vi.waitFor(
      () => {
        expect(syntaxTree(view.state).length).toBe(view.state.doc.length);
        expect(events.on_cursor_change.mock.lastCall?.[0].total_words).toBe(
          72_000,
        );
        expect(
          events.on_cursor_change.mock.lastCall?.[0].word_count_pending,
        ).toBe(false);
      },
      { timeout: 5_000 },
    );
  });
  it("opens and flushes exact source, including BOM and mixed line endings", async () => {
    const source =
      '\uFEFF---\r\ntitle: "Keep" # comment\r\n---\n\n# Heading\r\n\n*  item\rLast';
    const { session } = await open_editor(source);
    expect(session.get_markdown()).toBe(source);
    expect(session.is_dirty()).toBe(false);
  });

  it("exposes edits immediately while debouncing application notifications", async () => {
    vi.useFakeTimers();
    const { session, view, events } = await open_editor("# Title\r\n\r\nBody");
    view.dispatch({
      changes: { from: view.state.doc.length, insert: " edited" },
      userEvent: "input.type",
    });
    expect(session.get_markdown()).toBe("# Title\r\n\r\nBody edited");
    expect(session.is_dirty()).toBe(true);
    expect(events.on_markdown_change).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(events.on_markdown_change).toHaveBeenLastCalledWith(
      session.get_markdown(),
    );
    source_undo(view);
    expect(session.get_markdown()).toBe("# Title\r\n\r\nBody");
    expect(session.is_dirty()).toBe(false);
  });

  it("keeps independent source, history and saved baselines when switching buffers", async () => {
    const { session, view } = await open_editor("alpha\r\n");
    session.set_selection(5, 5);
    session.insert_text_at_cursor(" changed");
    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "beta\n",
      restore_policy: "reuse_cache",
    });
    session.set_selection(4, 4);
    session.insert_text_at_cursor(" changed");
    session.mark_clean("alpha.md", "alpha changed\r\n");
    expect(session.is_dirty()).toBe(true);
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "stale disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("alpha changed\r\n");
    expect(session.is_dirty()).toBe(false);
    source_undo(view);
    expect(session.get_markdown()).toBe("alpha\r\n");
    expect(session.is_dirty()).toBe(true);
    source_redo(view);
    expect(session.is_dirty()).toBe(false);
    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "stale disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("beta changed\n");
  });

  it("fresh restoration discards a cached buffer's edits and history", async () => {
    const { session, view } = await open_editor("old");
    session.insert_text_at_cursor("edited ");
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "external\r\n",
      restore_policy: "fresh",
    });
    expect(session.get_markdown()).toBe("external\r\n");
    expect(session.is_dirty()).toBe(false);
    expect(source_undo(view)).toBe(false);
  });

  it("preserves cached history through rename and removes it on close", async () => {
    const { session, view } = await open_editor("alpha");
    session.insert_text_at_cursor("new ");
    session.rename_buffer("alpha.md", "renamed.md");
    session.open_buffer({
      note_path: "renamed.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("new alpha");
    source_undo(view);
    expect(session.get_markdown()).toBe("alpha");
    session.close_buffer("renamed.md");
    session.open_buffer({
      note_path: "renamed.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "new disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("new disk");
  });

  it("restores source offsets and uses line/column for old structural offsets", async () => {
    const { session, view } = await open_editor("first\r\nsecond");
    session.restore_cursor?.({
      line: 2,
      column: 3,
      total_lines: 2,
      total_words: 2,
      anchor: 999,
    });
    expect(view.state.selection.main.head).toBe(8);
    session.restore_cursor?.({
      line: 2,
      column: 3,
      total_lines: 2,
      total_words: 2,
      anchor: 2,
      head: 4,
      offset_kind: "markdown",
    });
    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(4);
  });

  it.each(["markdown", "legacy"])(
    "restores focused code typing after mount using %s cursor coordinates",
    async (coordinates) => {
      const source = "> - ```\n>   nested list code\n>   next";
      const { session, view } = await open_editor(source);
      session.focus();
      expect(document.activeElement).toBe(view.contentDOM);
      session.restore_cursor?.({
        line: 3,
        column: 9,
        total_lines: 3,
        total_words: 4,
        ...(coordinates === "markdown"
          ? {
              anchor: source.length,
              head: source.length,
              offset_kind: "markdown" as const,
            }
          : {}),
      });
      const content = document.activeElement;
      expect(content?.closest(".md-code-source")).not.toBeNull();
      const inner =
        content instanceof HTMLElement ? EditorView.findFromDOM(content) : null;
      if (!inner) throw new Error("Missing focused code editor");
      inner.dispatch({
        changes: { from: inner.state.selection.main.head, insert: "x" },
        userEvent: "input.type",
      });
      expect(session.get_markdown()).toBe(source + "x");
      expect(source_undo(view)).toBe(true);
      expect(session.get_markdown()).toBe(source);
    },
  );

  it("restores the focused table cell before its first input", async () => {
    const source = "| H |\n| --- |\n| hello |";
    const { session } = await open_editor(source);
    session.focus();
    session.restore_cursor?.({
      line: 3,
      column: 8,
      total_lines: 3,
      total_words: 2,
      anchor: source.indexOf("hello") + 5,
      offset_kind: "markdown",
    });
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) throw new Error("Missing focus");
    expect(focused.closest(".md-table-cell-active")).not.toBeNull();
    const inner = EditorView.findFromDOM(focused);
    if (!inner) throw new Error("Missing cell editor");
    expect(inner.state.selection.main.head).toBe(5);
    inner.dispatch(inner.state.replaceSelection("x"), {
      userEvent: "input.type",
    });
    expect(session.get_markdown()).toBe(source.replace("hello", "hellox"));
  });

  it("does not steal external input focus when restoring a code cursor", async () => {
    const { session, view } = await open_editor("```\nhello\n```");
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    session.restore_cursor?.({
      line: 2,
      column: 3,
      total_lines: 3,
      total_words: 1,
      anchor: 6,
      offset_kind: "markdown",
    });
    expect(view.state.selection.main.head).toBe(6);
    expect(document.activeElement).toBe(input);
  });

  it.each(["fresh", "reuse_cache"] as const)(
    "focuses the saved code caret after a %s buffer switch",
    async (restore_policy) => {
      const source = "> - ```\n>   nested list code\n>   next";
      const { session } = await open_editor(source);
      session.set_selection(source.length, source.length);
      session.open_buffer({
        note_path: "beta.md",
        vault_id: as_vault_id("test-vault"),
        initial_markdown: "other note",
        restore_policy: "fresh",
      });
      session.focus();
      session.open_buffer({
        note_path: "alpha.md",
        vault_id: as_vault_id("test-vault"),
        initial_markdown: source,
        restore_policy,
        view_state: {
          cursor: {
            line: 3,
            column: 9,
            total_lines: 3,
            total_words: 4,
            anchor: source.length,
            offset_kind: "markdown",
          },
          code_block_view_states: [],
        },
      });
      // EditorService focuses after switching either a fresh or cached buffer.
      session.focus();
      const content = document.activeElement;
      expect(content?.closest(".md-code-source")).not.toBeNull();
      const inner =
        content instanceof HTMLElement ? EditorView.findFromDOM(content) : null;
      if (!inner) throw new Error("Missing focused code editor");
      expect(inner.state.selection.main.head).toBe(inner.state.doc.length);
      expect(session.get_markdown()).toBe(source);
    },
  );

  it("persists code block layout with its buffer without changing source", async () => {
    const source = "~~~js\r\nconst x = 1;\r\n~~~\r\n";
    const { session } = await open_editor(source);
    const states = [
      {
        source_height: 220,
        diagram_height: null,
        source_hidden: false,
        diagram_zoom: 1,
      },
    ];
    session.set_code_block_view_states(states);
    expect(session.get_code_block_view_states()).toEqual(states);
    expect(session.get_markdown()).toBe(source);
    expect(session.is_dirty()).toBe(false);
    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "beta",
      restore_policy: "reuse_cache",
    });
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: source,
      restore_policy: "reuse_cache",
    });
    expect(session.get_code_block_view_states()).toEqual(states);
  });

  it("cancels delayed callbacks when the session is destroyed", async () => {
    vi.useFakeTimers();
    const { session, view, events, root } = await open_editor("alpha");
    view.dispatch({ changes: { from: 0, insert: "new " } });
    session.destroy();
    await vi.advanceTimersByTimeAsync(250);
    expect(events.on_markdown_change).not.toHaveBeenCalled();
    expect(root.querySelector(".cm-editor")).toBeNull();
    expect(root.style.height).toBe("");
  });

  it("toggles a note between rich and source views and keeps its history", async () => {
    const { session, view, events } = await open_editor("# Title\n\ntext");
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("rich");
    view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });

    session.toggle_source_mode();
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("source");
    expect(view.dom.classList).toContain("md-source-mode");
    source_undo(view);
    expect(session.get_markdown()).toBe("# Title\n\ntext");

    session.toggle_source_mode();
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("rich");
  });

  it("remembers the view of each note across buffer switches", async () => {
    const { session, events } = await open_editor("one");
    session.toggle_source_mode();
    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "two",
      restore_policy: "reuse_cache",
    });
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("rich");
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "one",
      restore_policy: "reuse_cache",
    });
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("source");
  });

  it("turns Vim on and off for the shown buffer and for cached ones it shows later", async () => {
    const { session, view, events } = await open_editor("one");
    expect(events.on_vim_status_change).toHaveBeenLastCalledWith(null);

    session.set_vim_enabled(true);
    expect(events.on_vim_status_change).toHaveBeenLastCalledWith({
      mode: "normal",
      showcmd: "",
      recording: null,
    });
    expect(view.dom.classList).toContain("md-vim");
    view.dispatch({ changes: { from: 3, insert: "!" } });

    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "two",
      restore_policy: "reuse_cache",
    });
    expect(view.dom.classList).toContain("md-vim");

    session.set_vim_enabled(false);
    expect(events.on_vim_status_change).toHaveBeenLastCalledWith(null);
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "one",
      restore_policy: "reuse_cache",
    });
    expect(view.dom.classList).not.toContain("md-vim");
    expect(events.on_vim_status_change).toHaveBeenLastCalledWith(null);
    source_undo(view);
    expect(session.get_markdown()).toBe("one");
  });

  it('sends :w, :q and :wq to the host, and reads the system clipboard for "+p', async () => {
    const { session, view, events, read_clipboard_text } =
      await open_editor("one");
    session.set_vim_enabled(true);

    run_ex_command(view, "w");
    expect(events.on_save_request).toHaveBeenCalledOnce();
    expect(events.on_close_request).not.toHaveBeenCalled();

    run_ex_command(view, "q");
    expect(events.on_close_request).toHaveBeenCalledOnce();

    run_ex_command(view, "wq");
    await vi.waitFor(() => {
      expect(events.on_close_request).toHaveBeenCalledTimes(2);
    });
    expect(events.on_save_request).toHaveBeenCalledTimes(2);

    press_vim_keys(view, '"', "+", "p");
    await vi.waitFor(() => {
      expect(session.get_markdown()).toBe("ofrom outsidene");
    });
    expect(read_clipboard_text).toHaveBeenCalledOnce();
  });

  it("puts text copied with the code block button into the register under clipboard=unnamed", async () => {
    const { session, view } = await open_editor(
      "intro\n\n```js\nconst a = 1\n```",
    );
    session.set_vim_enabled(true);
    expect(apply_vimrc("set clipboard=unnamed")).toEqual([]);

    const copy_button = view.dom.querySelector<HTMLElement>(".md-code-copy");
    if (!copy_button) throw new Error("Missing copy button");
    copy_button.click();
    await vi.waitFor(() => {
      expect(
        view.dom.querySelector(".md-code-toolbar [role=status]"),
      ).toHaveProperty("textContent", "Copied");
    });

    press_vim_keys(view, "p");
    expect(session.get_markdown()).toContain("ifrom outsidentro");
  });

  it("closes an open Vim / prompt before it shows another buffer", async () => {
    const { session, view } = await open_editor("one");
    session.set_vim_enabled(true);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.dom.querySelector(".cm-vim-panel input")).not.toBeNull();

    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "two",
      restore_policy: "reuse_cache",
    });
    session.open_buffer({
      note_path: "alpha.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "one",
      restore_policy: "reuse_cache",
    });
    expect(view.dom.querySelector(".cm-vim-panel")).toBeNull();
  });

  it("builds a new buffer with the current Vim setting", async () => {
    const { session, view, events } = await open_editor("one");
    session.set_vim_enabled(true);
    events.on_vim_status_change.mockClear();

    session.open_buffer({
      note_path: "beta.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "two",
      restore_policy: "reuse_cache",
    });
    expect(view.dom.classList).toContain("md-vim");
    expect(events.on_vim_status_change.mock.calls).toEqual([
      [{ mode: "normal", showcmd: "", recording: null }],
    ]);

    session.set_vim_enabled(false);
    events.on_vim_status_change.mockClear();
    session.open_buffer({
      note_path: "gamma.md",
      vault_id: as_vault_id("test-vault"),
      initial_markdown: "three",
      restore_policy: "reuse_cache",
    });
    expect(view.dom.classList).not.toContain("md-vim");
    expect(events.on_vim_status_change).not.toHaveBeenCalled();
  });

  it("opens a draft note, which has no file name yet, as Markdown", async () => {
    const { session, view, events } = await open_editor(
      "# Draft",
      undefined,
      "draft:1791147521383:Untitled-8",
    );
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("rich");
    expect(view.dom.querySelector(".md-heading")).not.toBeNull();
    session.toggle_source_mode();
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("source");
  });

  it("opens a non-Markdown file as text with exact line endings", async () => {
    const source = "# not a heading\r\nkey: value\r\n";
    const { session, view, events } = await open_editor(
      source,
      undefined,
      "config.yaml",
    );
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("text");
    expect(view.dom.querySelector(".md-heading")).toBeNull();
    session.toggle_source_mode();
    expect(events.on_view_mode_change).toHaveBeenLastCalledWith("text");
    view.dispatch({ changes: { from: view.state.doc.length, insert: "x: 1" } });
    expect(session.get_markdown()).toBe(`${source}x: 1`);
  });

  it("replaces find matches in one undo step and keeps line endings", async () => {
    const { session, view } = await open_editor("foo bar\r\nfoo baz foo\r\n");
    const spec = {
      text: "foo",
      regex: false,
      case_sensitive: false,
      whole_word: false,
    };
    session.update_find_state?.(spec, 0);

    expect(session.replace_find_match?.("qux")).toBe(0);
    expect(session.get_markdown()).toBe("qux bar\r\nfoo baz foo\r\n");
    expect(session.replace_all_find_matches?.("qux")).toBe(2);
    expect(session.get_markdown()).toBe("qux bar\r\nqux baz qux\r\n");

    source_undo(view);
    expect(session.get_markdown()).toBe("qux bar\r\nfoo baz foo\r\n");
    expect(session.replace_find_match?.("qux")).toBe(0);
  });

  it("wraps to the first match after replacing the last one, and reports nothing left to replace", async () => {
    const { session } = await open_editor("foo foo");
    const spec = {
      text: "foo",
      regex: false,
      case_sensitive: false,
      whole_word: false,
    };
    session.update_find_state?.(spec, 1);

    expect(session.replace_find_match?.("bar")).toBe(0);
    expect(session.replace_find_match?.("bar")).toBe(0);
    expect(session.get_markdown()).toBe("bar bar");
    expect(session.replace_find_match?.("bar")).toBeNull();
    expect(session.replace_all_find_matches?.("bar")).toBe(0);
  });

  it("replaces matches in a text file, not only in Markdown notes", async () => {
    const { session } = await open_editor(
      "port: 80\nother: 80\n",
      undefined,
      "config.yaml",
    );
    const spec = {
      text: "(\\w+): 80",
      regex: true,
      case_sensitive: false,
      whole_word: false,
    };
    session.update_find_state?.(spec, 0);

    expect(session.replace_all_find_matches?.("$1: 8080")).toBe(2);
    expect(session.get_markdown()).toBe("port: 8080\nother: 8080\n");
  });

  it("selects a vault find match by UTF-16 column after emoji", async () => {
    const { session, view } = await open_editor("# T\n\n😀 needle here");
    session.select_line_range?.(3, 3, 6);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("needle");
  });

  it("selects a vault find match on line 1 of a file that starts with a BOM", async () => {
    const { session, view } = await open_editor("\uFEFFneedle first");
    session.select_line_range?.(1, 0, 6);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("needle");
  });
});

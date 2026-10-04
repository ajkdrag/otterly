/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create_switchable_editor_port } from "$lib/features/editor/adapters/switchable_editor_adapter";
import type {
  BufferConfig,
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";

const sessions: EditorSession[] = [];
afterEach(() => {
  for (const session of sessions) session.destroy();
  sessions.length = 0;
  document.body.replaceChildren();
});

function fake_port() {
  const created: {
    session: EditorSession;
    config: EditorSessionConfig;
    edits: string[];
    undo: () => void;
  }[] = [];
  const port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) => {
      let path = config.note_path;
      let source = config.initial_markdown;
      let baseline = source;
      let scroll = 0;
      let caret = 0;
      const edits: string[] = [];
      const cache = new Map<
        string,
        { source: string; baseline: string; edits: string[]; caret: number }
      >();
      const notify = () => {
        config.events.on_markdown_change(source);
        config.events.on_dirty_state_change(source !== baseline);
      };
      const session: EditorSession = {
        destroy: vi.fn(),
        get_markdown: () => source,
        set_markdown: (value) => {
          edits.push(source);
          source = value;
          notify();
        },
        insert_text_at_cursor: (value) => {
          edits.push(source);
          source += value;
          notify();
        },
        set_selection: (anchor) => {
          caret = anchor;
        },
        focus: vi.fn(),
        restore_view_state: vi.fn(),
        get_scroll_top: () => scroll,
        set_scroll_top: (value) => {
          scroll = value;
        },
        get_code_block_view_states: () => [],
        set_code_block_view_states: vi.fn(),
        mark_clean: (_path, saved) => {
          baseline = saved ?? source;
        },
        is_dirty: () => source !== baseline,
        open_buffer: vi.fn((next: BufferConfig) => {
          cache.set(path, { source, baseline, edits: [...edits], caret });
          path = next.note_path;
          const cached =
            next.restore_policy === "reuse_cache" ? cache.get(path) : null;
          source = cached?.source ?? next.initial_markdown;
          baseline = cached?.baseline ?? next.initial_markdown;
          caret = cached?.caret ?? 0;
          edits.splice(0, edits.length, ...(cached?.edits ?? []));
          notify();
        }),
        rename_buffer: vi.fn(),
        close_buffer: vi.fn(),
        update_find_state: vi.fn(),
        read_diagnostics: () => ({
          selection: { anchor: caret, head: caret, coordinates: "fixture" },
          parser: null,
        }),
      };
      created.push({
        session,
        config,
        edits,
        undo: () => {
          source = edits.pop() ?? source;
          notify();
        },
      });
      return Promise.resolve(session);
    }),
  };
  return { port, created };
}

async function setup(
  source = "#  Heading\r\n\r\n-   odd spacing\r\n",
  load?: () => Promise<EditorPort>,
) {
  const source_engine = fake_port();
  const milkdown = fake_port();
  const events = {
    on_markdown_change: vi.fn(),
    on_dirty_state_change: vi.fn(),
    on_diagnostics_change: vi.fn(),
  };
  const root = document.createElement("div");
  document.body.append(root);
  const port = create_switchable_editor_port({
    source: source_engine.port,
    milkdown: load ?? (() => Promise.resolve(milkdown.port)),
  });
  const session = await port.start_session({
    root,
    initial_markdown: source,
    note_path: "a.md",
    vault_id: null,
    events,
  });
  sessions.push(session);
  return { session, source_engine, milkdown, events, root, port };
}

describe("switchable editor port", () => {
  it("switches without serializing or dirtying untouched raw source", async () => {
    const source = "#  Heading\r\n\r\n-   odd spacing\r\n";
    const { session, source_engine, milkdown, root } = await setup(source);
    await session.switch_engine?.("milkdown");
    expect(session.get_markdown()).toBe(source);
    expect(session.is_dirty()).toBe(false);
    expect(milkdown.created[0]?.config.initial_markdown).toBe(source);
    await session.switch_engine?.("source");
    expect(source_engine.port.start_session).toHaveBeenCalledOnce();
    expect(
      source_engine.created[0]?.session.open_buffer,
    ).not.toHaveBeenCalled();
    expect(session.get_markdown()).toBe(source);
    expect(
      [...root.children].filter((e) => !(e as HTMLElement).hidden),
    ).toHaveLength(1);
  });
  it("retains dirty source, selection, scroll and history when returning unchanged", async () => {
    const { session, source_engine } = await setup("raw");
    session.insert_text_at_cursor(" edited");
    session.set_selection(3, 3);
    session.set_scroll_top?.(180);
    await session.switch_engine?.("milkdown");
    expect(session.is_dirty()).toBe(true);
    await session.switch_engine?.("source");
    expect(session.is_dirty()).toBe(true);
    expect(session.get_scroll_top?.()).toBe(180);
    expect(
      source_engine.created[0]?.session.read_diagnostics?.().selection?.head,
    ).toBe(3);
    source_engine.created[0]?.undo();
    expect(session.get_markdown()).toBe("raw");
    expect(session.is_dirty()).toBe(false);
  });
  it("rebuilds a stale target after editing in the other engine, keeping the saved baseline", async () => {
    const { session, source_engine } = await setup("raw");
    await session.switch_engine?.("milkdown");
    session.insert_text_at_cursor(" other");
    await session.switch_engine?.("source");
    expect(
      source_engine.created[0]?.session.open_buffer,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initial_markdown: "raw other",
        restore_policy: "fresh",
      }),
    );
    expect(session.get_markdown()).toBe("raw other");
    expect(session.is_dirty()).toBe(true);
  });
  it("keeps dirty cached tabs across engines and honors fresh reload", async () => {
    const { session } = await setup("a");
    session.insert_text_at_cursor(" edited");
    session.open_buffer({
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "b",
      restore_policy: "reuse_cache",
    });
    session.insert_text_at_cursor(" edited");
    await session.switch_engine?.("milkdown");
    session.open_buffer({
      note_path: "a.md",
      vault_id: null,
      initial_markdown: "stale disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("a edited");
    expect(session.is_dirty()).toBe(true);
    session.open_buffer({
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "stale disk",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("b edited");
    session.open_buffer({
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "new disk",
      restore_policy: "fresh",
    });
    expect(session.get_markdown()).toBe("new disk");
    expect(session.is_dirty()).toBe(false);
  });
  it("ignores delayed callbacks from a hidden engine", async () => {
    const { session, source_engine, events } = await setup("raw");
    await session.switch_engine?.("milkdown");
    events.on_markdown_change.mockClear();
    events.on_dirty_state_change.mockClear();
    source_engine.created[0]?.config.events.on_markdown_change("stale");
    source_engine.created[0]?.config.events.on_dirty_state_change(true);
    expect(events.on_markdown_change).not.toHaveBeenCalled();
    expect(events.on_dirty_state_change).not.toHaveBeenCalled();
    expect(session.get_markdown()).toBe("raw");
  });
  it("keeps edits and note switches while the target engine loads", async () => {
    const target = fake_port();
    let resolve!: (port: EditorPort) => void;
    const loading = new Promise<EditorPort>((r) => {
      resolve = r;
    });
    const { session } = await setup("a", () => loading);
    const switching = session.switch_engine?.("milkdown");
    session.insert_text_at_cursor(" edited");
    session.open_buffer({
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "b",
      restore_policy: "fresh",
    });
    session.insert_text_at_cursor(" latest");
    resolve(target.port);
    await switching;
    expect(session.get_markdown()).toBe("b latest");
    expect(session.is_dirty()).toBe(true);
    session.open_buffer({
      note_path: "a.md",
      vault_id: null,
      initial_markdown: "old",
      restore_policy: "reuse_cache",
    });
    expect(session.get_markdown()).toBe("a edited");
  });
  it("leaves the active editor usable when lazy loading fails", async () => {
    const { session } = await setup("raw", () =>
      Promise.reject(new Error("load failed")),
    );
    await expect(session.switch_engine?.("milkdown")).rejects.toThrow(
      "load failed",
    );
    expect(session.get_engine?.()).toBe("source");
    session.insert_text_at_cursor(" edit");
    expect(session.get_markdown()).toBe("raw edit");
  });
  it("cleans up a target that finishes loading after destroy", async () => {
    const target = fake_port();
    let resolve!: (port: EditorPort) => void;
    const { session, root } = await setup(
      "raw",
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const switching = session.switch_engine?.("milkdown");
    session.destroy();
    resolve(target.port);
    await switching;
    expect(target.created[0]?.session.destroy).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });
  it("keeps engine preference within one port, independently of other windows", async () => {
    const { session, port } = await setup();
    await session.switch_engine?.("milkdown");
    const root = document.createElement("div");
    document.body.append(root);
    const next = await port.start_session({
      root,
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "b",
      events: { on_markdown_change: vi.fn(), on_dirty_state_change: vi.fn() },
    });
    sessions.push(next);
    expect(next.get_engine?.()).toBe("milkdown");
    const other = await setup();
    expect(other.session.get_engine?.()).toBe("source");
  });
});

it("replays find state and restores compatible structural cursors in Milkdown", async () => {
  const { session, milkdown } = await setup("hello");
  session.update_find_state?.("hello", 0);
  await session.switch_engine?.("milkdown");
  expect(
    milkdown.created[0]?.session.update_find_state,
  ).toHaveBeenLastCalledWith("hello", 0);
  const cursor = {
    line: 1,
    column: 3,
    total_lines: 1,
    total_words: 1,
    anchor: 3,
    head: 3,
  };
  session.restore_cursor?.(cursor);
  expect(
    milkdown.created[0]?.session.read_diagnostics?.().selection?.head,
  ).toBe(3);
  session.restore_cursor?.({
    ...cursor,
    anchor: 5,
    head: 5,
    offset_kind: "markdown",
  });
  expect(
    milkdown.created[0]?.session.read_diagnostics?.().selection?.head,
  ).toBe(3);
  session.open_buffer({
    note_path: "b.md",
    vault_id: null,
    initial_markdown: "**world**",
    restore_policy: "fresh",
    view_state: {
      cursor: { ...cursor, offset_kind: "markdown" },
      code_block_view_states: [],
    },
  });
  expect(milkdown.created[0]?.session.open_buffer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      view_state: { cursor: null, code_block_view_states: [] },
    }),
  );
});

it("restores an anchor-only legacy cursor as a collapsed selection", async () => {
  const { session, milkdown } = await setup("hello");
  await session.switch_engine?.("milkdown");
  const target = milkdown.created[0]?.session;
  if (!target) throw new Error("Missing Milkdown session");
  const set_selection = vi.spyOn(target, "set_selection");
  session.restore_cursor?.({
    line: 1,
    column: 4,
    total_lines: 1,
    total_words: 1,
    anchor: 3,
  });
  expect(set_selection).toHaveBeenCalledWith(3, 3);
  expect(session.get_markdown()).toBe("hello");
});

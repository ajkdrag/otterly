import { describe, expect, it, vi } from "vitest";
import type {
  BufferConfig,
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState, CursorInfo } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(note_path: string, markdown: string): OpenNoteState {
  const path = as_note_path(note_path);
  return {
    meta: {
      id: path,
      path,
      name: note_path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "",
      title: note_path.replace(/\.md$/i, ""),
      mtime_ms: 0,
      size_bytes: markdown.length,
    },
    markdown: as_markdown_text(markdown),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_session(initial_markdown: string): EditorSession {
  let current_markdown = initial_markdown;
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn((markdown: string) => {
      current_markdown = markdown;
    }),
    get_markdown: vi.fn(() => current_markdown),
    set_code_block_heights: vi.fn(),
    get_code_block_heights: vi.fn(() => []),
    restore_view_state: vi.fn(),
    insert_text_at_cursor: vi.fn(),
    set_selection: vi.fn(),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn((config: BufferConfig) => {
      current_markdown = config.initial_markdown;
    }),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
  };
}

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function create_setup(
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>,
) {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  const tab_store = new TabStore();
  vault_store.set_vault(create_test_vault());

  const session_configs: EditorSessionConfig[] = [];
  const start_session_mock = vi.fn((config: EditorSessionConfig) => {
    session_configs.push(config);
    return start_session(config);
  });

  const editor_port: EditorPort = {
    start_session: start_session_mock,
  };

  const callbacks: EditorServiceCallbacks = {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
  };

  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    tab_store,
    op_store,
    callbacks,
  );

  return {
    service,
    editor_store,
    tab_store,
    op_store,
    callbacks,
    start_session: start_session_mock,
    session_configs,
  };
}

function session_config_at(
  session_configs: EditorSessionConfig[],
  index: number,
): EditorSessionConfig {
  const config = session_configs[index];
  if (!config) {
    throw new Error(`Missing start_session config at index ${String(index)}`);
  }
  return config;
}

describe("EditorService", () => {
  it("mounts session and delegates open_buffer to session handle", async () => {
    const session = create_session("alpha");
    const { service, editor_store, start_session, session_configs } =
      create_setup(() => Promise.resolve(session));
    const root = {} as HTMLDivElement;
    const first_note = create_open_note("docs/alpha.md", "# Alpha");
    const second_note = create_open_note("docs/beta.md", "# Beta");

    editor_store.set_open_note(first_note);
    await service.mount({
      root,
      note: first_note,
    });

    expect(start_session).toHaveBeenCalledTimes(1);
    const mount_config = session_config_at(session_configs, 0);
    expect(mount_config.root).toBe(root);
    expect(mount_config.initial_markdown).toBe("# Alpha");
    expect(mount_config.note_path).toBe(as_note_path("docs/alpha.md"));
    expect(mount_config.vault_id).toBe(create_test_vault().id);
    expect(typeof mount_config.events.on_markdown_change).toBe("function");
    expect(typeof mount_config.events.on_dirty_state_change).toBe("function");
    expect(typeof mount_config.events.on_cursor_change).toBe("function");
    expect(typeof mount_config.events.on_code_block_heights_change).toBe(
      "function",
    );
    expect(typeof mount_config.events.on_internal_link_click).toBe("function");
    expect(typeof mount_config.events.on_image_paste_requested).toBe(
      "function",
    );

    editor_store.set_open_note(second_note);
    service.open_buffer(second_note);

    expect(start_session).toHaveBeenCalledTimes(1);
    expect(session.open_buffer).toHaveBeenCalledWith({
      note_path: as_note_path("docs/beta.md"),
      vault_id: create_test_vault().id,
      initial_markdown: "# Beta",
      restore_policy: "reuse_cache",
      view_state: null,
    });
  });

  it("stores active tab code block heights in the tab snapshot", async () => {
    const session = create_session("# Alpha");
    const { service, editor_store, session_configs, tab_store } = create_setup(
      () => Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    tab_store.open_tab(note.meta.path, note.meta.title);
    tab_store.patch_snapshot(note.meta.path, { scroll_top: 10 });
    const previous_revision = tab_store.session_metadata_revision;
    editor_store.set_open_note(note);
    await service.mount({ root, note });

    const events = session_config_at(session_configs, 0).events;
    events.on_code_block_heights_change?.([180, null, 320]);

    expect(tab_store.get_snapshot(note.meta.path)?.code_block_heights).toEqual([
      180,
      null,
      320,
    ]);
    expect(tab_store.get_snapshot(note.meta.path)?.scroll_top).toBe(10);
    expect(tab_store.session_metadata_revision).toBeGreaterThan(
      previous_revision,
    );
  });

  it("forwards explicit fresh restore policy to session buffer open", async () => {
    const session = create_session("alpha");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const first_note = create_open_note("docs/alpha.md", "# Alpha");
    const second_note = create_open_note("docs/beta.md", "# Beta");

    editor_store.set_open_note(first_note);
    await service.mount({
      root,
      note: first_note,
    });

    editor_store.set_open_note(second_note);
    service.open_buffer(second_note, "fresh");

    expect(session.open_buffer).toHaveBeenLastCalledWith({
      note_path: as_note_path("docs/beta.md"),
      vault_id: create_test_vault().id,
      initial_markdown: "# Beta",
      restore_policy: "fresh",
      view_state: null,
    });
  });

  it("forwards rename_buffer to session", async () => {
    const session = create_session("alpha");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({ root, note });

    service.rename_buffer(
      as_note_path("docs/alpha.md"),
      as_note_path("docs/beta.md"),
    );

    expect(session.rename_buffer).toHaveBeenCalledWith(
      as_note_path("docs/alpha.md"),
      as_note_path("docs/beta.md"),
    );
  });

  it("updates active note identity when renaming buffer", async () => {
    const session = create_session("# Alpha");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({ root, note });

    service.rename_buffer(
      as_note_path("docs/alpha.md"),
      as_note_path("docs/beta.md"),
    );

    const flushed = service.flush();
    expect(flushed).toEqual({
      note_id: as_note_path("docs/beta.md"),
      markdown: as_markdown_text("# Alpha"),
    });
  });

  it("routes markdown events to the current active note", async () => {
    const session = create_session("alpha");
    const { service, editor_store, session_configs } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const first_note = create_open_note("docs/alpha.md", "# Alpha");
    const second_note = create_open_note("docs/beta.md", "# Beta");

    editor_store.set_open_note(first_note);
    await service.mount({
      root,
      note: first_note,
    });

    const events = session_config_at(session_configs, 0).events;

    events.on_markdown_change("# Updated Alpha");
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# Updated Alpha"),
    );

    editor_store.set_open_note(second_note);
    service.open_buffer(second_note);

    events.on_markdown_change("# Updated Beta");
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# Updated Beta"),
    );
  });

  it("updates dirty state from session events", async () => {
    const session = create_session("alpha");
    const { service, editor_store, session_configs } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({
      root,
      note,
    });

    const events = session_config_at(session_configs, 0).events;
    events.on_dirty_state_change(true);

    expect(editor_store.open_note?.is_dirty).toBe(true);
  });

  it("updates cursor state from session events", async () => {
    const session = create_session("alpha");
    const { service, editor_store, session_configs } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");
    const cursor: CursorInfo = {
      line: 3,
      column: 8,
      total_lines: 12,
      total_words: 0,
    };

    editor_store.set_open_note(note);
    await service.mount({
      root,
      note,
    });

    const events = session_config_at(session_configs, 0).events;
    events.on_cursor_change?.(cursor);

    expect(editor_store.cursor).toEqual(cursor);
  });

  it("dispatches internal link click via callbacks", async () => {
    const session = create_session("alpha");
    const { service, editor_store, callbacks, session_configs } = create_setup(
      () => Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({
      root,
      note,
    });

    const events = session_config_at(session_configs, 0).events;
    events.on_internal_link_click?.("docs/next.md", "current.md");

    expect(callbacks.on_internal_link_click).toHaveBeenCalledWith(
      "docs/next.md",
      "current.md",
    );
  });

  it("dispatches image paste via callbacks", async () => {
    const session = create_session("alpha");
    const { service, editor_store, callbacks, session_configs } = create_setup(
      () => Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({
      root,
      note,
    });

    const image = {
      bytes: new Uint8Array([1, 2, 3]),
      mime_type: "image/png",
      file_name: "pasted.png",
    };
    const events = session_config_at(session_configs, 0).events;
    events.on_image_paste_requested?.(image);

    expect(callbacks.on_image_paste_requested).toHaveBeenCalledWith(
      as_note_path("docs/alpha.md"),
      as_note_path("docs/alpha.md"),
      image,
    );
  });

  it("routes dirty state events to the current active note via open_buffer", async () => {
    const session = create_session("alpha");
    const { service, editor_store, session_configs } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const first_note = create_open_note("docs/alpha.md", "# Alpha");
    const second_note = create_open_note("docs/beta.md", "# Beta");

    editor_store.set_open_note(first_note);
    await service.mount({
      root,
      note: first_note,
    });

    editor_store.set_open_note(second_note);
    service.open_buffer(second_note);

    const events = session_config_at(session_configs, 0).events;

    events.on_dirty_state_change(true);
    expect(editor_store.open_note?.is_dirty).toBe(true);
  });

  it("does not leak a late session when unmounted during startup", async () => {
    const deferred = create_deferred<EditorSession>();
    const late_session = create_session("alpha");
    const { service, editor_store } = create_setup(() => deferred.promise);
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    const mount_promise = service.mount({
      root,
      note,
    });

    service.unmount();
    deferred.resolve(late_session);
    await mount_promise;

    expect(late_session.destroy).toHaveBeenCalledTimes(1);
    expect(service.is_mounted()).toBe(false);
  });

  it("flushes session markdown and syncs editor store", async () => {
    const session = create_session("# Original");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({
      root,
      note,
    });

    session.set_markdown("# Flushed");
    const flushed = service.flush();

    expect(flushed).toEqual({
      note_id: as_note_path("docs/alpha.md"),
      markdown: as_markdown_text("# Flushed"),
    });
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# Flushed"),
    );
  });

  it("forwards mark_clean to session and keeps state coherent", async () => {
    const session = create_session("alpha");
    const { service, editor_store, session_configs } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    editor_store.set_dirty(note.meta.id, true);

    await service.mount({
      root,
      note,
    });

    service.mark_clean();
    expect(session.mark_clean).toHaveBeenCalledTimes(1);
    expect(editor_store.open_note?.is_dirty).toBe(true);

    const events = session_config_at(session_configs, 0).events;
    events.on_dirty_state_change(false);
    expect(editor_store.open_note?.is_dirty).toBe(false);
  });

  it("tracks op_store status for mount", async () => {
    const session = create_session("alpha");
    const { service, editor_store, op_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({ root, note });
    expect(op_store.get("editor.mount").status).toBe("success");
  });

  it("records op_store failure when mount throws", async () => {
    const { service, editor_store, op_store } = create_setup(() =>
      Promise.reject(new Error("boom")),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/alpha.md", "# Alpha");

    editor_store.set_open_note(note);
    await service.mount({ root, note });

    expect(op_store.get("editor.mount").status).toBe("error");
    expect(op_store.get("editor.mount").error).toBe("boom");
  });
});

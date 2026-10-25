import { describe, expect, it, vi } from "vitest";
import { DocumentService, DocumentStore } from "$lib/features/document";
import type { DocumentFile, DocumentPort } from "$lib/features/document";
import type { EditorPort, EditorSession } from "$lib/features/editor";
import type {
  EditorEventHandlers,
  EditorSessionConfig,
} from "$lib/features/editor/ports";

const file: DocumentFile = {
  path: "/Users/me/Downloads/readme.md",
  name: "readme.md",
  text: "# Hello",
  mtime_ms: 100,
};

function setup(
  read: DocumentFile | Error = file,
  session_start_gate: Promise<void> = Promise.resolve(),
) {
  const store = new DocumentStore();
  let events: EditorEventHandlers | null = null;
  let markdown = file.text;
  const session = {
    destroy: vi.fn(),
    focus: vi.fn(),
    get_markdown: () => markdown,
    mark_clean: vi.fn(),
    open_buffer: vi.fn(),
    update_find_state: vi.fn(),
    toggle_source_mode: vi.fn(),
    set_vim_enabled: vi.fn(),
  } as unknown as EditorSession;
  const session_configs: EditorSessionConfig[] = [];
  const editor_port: EditorPort = {
    start_session: vi.fn(async (config: EditorSessionConfig) => {
      events = config.events;
      session_configs.push(config);
      await session_start_gate;
      return session;
    }),
  };
  const document_port: DocumentPort = {
    read_document: vi.fn(() =>
      read instanceof Error ? Promise.reject(read) : Promise.resolve(read),
    ),
    write_document: vi.fn(() => Promise.resolve(200)),
    reveal_document: vi.fn(() => Promise.resolve()),
  };
  const callbacks = {
    on_external_link_click: vi.fn(),
    on_unsupported_link_click: vi.fn(),
    on_save_request: vi.fn(),
    on_close_request: vi.fn(),
  };
  const service = new DocumentService(
    document_port,
    editor_port,
    store,
    () => 5,
    callbacks,
  );
  return {
    store,
    service,
    session,
    session_configs,
    document_port,
    callbacks,
    events: () => {
      if (!events) throw new Error("The editor has not started");
      return events;
    },
    type: (text: string) => {
      markdown = text;
      events?.on_markdown_change(text);
      events?.on_dirty_state_change(true);
    },
  };
}

async function open(read?: DocumentFile | Error) {
  const test = setup(read);
  await test.service.load();
  // The editor port is a fake, so the root is never touched.
  await test.service.mount_editor({} as HTMLElement);
  return test;
}

describe("DocumentService", () => {
  it("starts the editor with the current Vim setting", async () => {
    const { service, session_configs } = setup();
    await service.load();

    service.set_vim_enabled(true);
    await service.mount_editor({} as HTMLElement);

    expect(session_configs[0]?.vim_enabled).toBe(true);
  });

  it("passes on a Vim setting that arrives while the editor starts", async () => {
    let finish_start: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      finish_start = resolve;
    });
    const { service, session, session_configs } = setup(file, gate);
    await service.load();

    const mounting = service.mount_editor({} as HTMLElement);
    service.set_vim_enabled(true);
    finish_start();
    await mounting;

    expect(session_configs[0]?.vim_enabled).toBe(false);
    expect(session.set_vim_enabled).toHaveBeenLastCalledWith(true);
  });

  it("shows the Vim status of the editor and passes :w and :q on", async () => {
    const { store, callbacks, events } = await open();

    events().on_vim_status_change?.({
      mode: "insert_normal",
      showcmd: "2d",
      recording: "q",
    });
    expect(store.vim_status).toEqual({
      mode: "insert_normal",
      showcmd: "2d",
      recording: "q",
    });
    events().on_vim_status_change?.(null);
    expect(store.vim_status).toBeNull();

    void events().on_save_request?.();
    events().on_close_request?.();
    expect(callbacks.on_save_request).toHaveBeenCalledOnce();
    expect(callbacks.on_close_request).toHaveBeenCalledOnce();
  });

  it("takes the file's mtime as its last save when it opens", async () => {
    const { store } = await open();
    expect(store.last_saved_at).toBe(100);
  });

  it("saves the edited text against the mtime it read", async () => {
    const { service, store, session, document_port, type } = await open();
    type("# Hello there");

    expect(await service.save()).toEqual({ status: "saved" });
    expect(document_port.write_document).toHaveBeenCalledWith(
      "# Hello there",
      100,
    );
    expect(session.mark_clean).toHaveBeenCalledWith(file.path, "# Hello there");
    expect(store.file?.mtime_ms).toBe(200);
    expect(store.last_saved_at).toBe(5);
  });

  it("reports a conflict when the file changed on disk, and can overwrite it", async () => {
    const { service, store, document_port } = await open();
    vi.mocked(document_port.write_document).mockRejectedValueOnce(
      new Error("tauri invoke failed: write_document: conflict:mtime_mismatch"),
    );

    expect(await service.save()).toEqual({ status: "conflict" });
    expect(store.has_conflict).toBe(true);

    expect(await service.save(true)).toEqual({ status: "saved" });
    expect(document_port.write_document).toHaveBeenLastCalledWith(
      file.text,
      null,
    );
    expect(store.has_conflict).toBe(false);
  });

  it("reloads a clean document that changed on disk when the window gains focus", async () => {
    const { service, session, document_port } = await open();
    vi.mocked(document_port.read_document).mockResolvedValue({
      ...file,
      text: "# Changed",
      mtime_ms: 300,
    });

    await service.check_disk_changes();

    expect(session.open_buffer).toHaveBeenCalledWith(
      expect.objectContaining({
        initial_markdown: "# Changed",
        restore_policy: "fresh",
      }),
    );
  });

  it("keeps unsaved edits and flags a conflict instead of reloading", async () => {
    const { service, store, session, document_port, type } = await open();
    type("# Mine");
    vi.mocked(document_port.read_document).mockResolvedValue({
      ...file,
      mtime_ms: 300,
    });

    await service.check_disk_changes();

    expect(session.open_buffer).not.toHaveBeenCalled();
    expect(store.has_conflict).toBe(true);
  });

  it("explains a file that is not text", async () => {
    const { store } = await open(
      new Error("tauri invoke failed: read_document: file_not_text"),
    );
    expect(store.load_state).toBe("error");
    expect(store.load_error).toMatch(/not text/);
  });

  it("keeps the store's markdown current for find", async () => {
    const { store, type } = await open();
    expect(store.markdown).toBe("# Hello");

    type("# Hello there");

    expect(store.markdown).toBe("# Hello there");
  });

  it("passes find state to the editor session", async () => {
    const { service, session } = await open();

    const spec = {
      text: "hello",
      regex: true,
      case_sensitive: false,
      whole_word: false,
    };
    service.update_find_state(spec, 1);

    expect(session.update_find_state).toHaveBeenCalledWith(spec, 1);
  });

  it("replaces find matches through the editor session", async () => {
    const { service, session } = await open();
    session.replace_find_match = vi.fn(() => 2);
    session.replace_all_find_matches = vi.fn(() => 5);

    expect(service.replace_find_match("bar")).toBe(2);
    expect(service.replace_all_find_matches("bar")).toBe(5);
    expect(session.replace_find_match).toHaveBeenCalledWith("bar");
    expect(session.replace_all_find_matches).toHaveBeenCalledWith("bar");
  });

  it("reveals its file and reports whether that worked", async () => {
    const { service, document_port } = await open();
    expect(await service.reveal_in_file_manager()).toBe(true);

    vi.mocked(document_port.reveal_document).mockRejectedValueOnce(
      new Error("tauri invoke failed: reveal_document"),
    );
    expect(await service.reveal_in_file_manager()).toBe(false);
  });
});

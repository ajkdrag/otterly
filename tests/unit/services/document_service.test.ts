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

function setup(read: DocumentFile | Error = file) {
  const store = new DocumentStore();
  let events: EditorEventHandlers | null = null;
  let markdown = file.text;
  const session = {
    destroy: vi.fn(),
    focus: vi.fn(),
    get_markdown: () => markdown,
    mark_clean: vi.fn(),
    open_buffer: vi.fn(),
    toggle_source_mode: vi.fn(),
  } as unknown as EditorSession;
  const editor_port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) => {
      events = config.events;
      return Promise.resolve(session);
    }),
  };
  const document_port: DocumentPort = {
    read_document: vi.fn(() =>
      read instanceof Error ? Promise.reject(read) : Promise.resolve(read),
    ),
    write_document: vi.fn(() => Promise.resolve(200)),
  };
  const service = new DocumentService(
    document_port,
    editor_port,
    store,
    () => 5,
    {
      on_external_link_click: vi.fn(),
      on_unsupported_link_click: vi.fn(),
    },
  );
  return {
    store,
    service,
    session,
    document_port,
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
});

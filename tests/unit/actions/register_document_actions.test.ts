import { describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { ClipboardService } from "$lib/features/clipboard";
import {
  DocumentStore,
  register_document_actions,
  type DocumentService,
} from "$lib/features/document";
import type { ShellService } from "$lib/features/shell";

vi.mock("svelte-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

function create_harness(options: { reveal_ok?: boolean } = {}) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    document: new DocumentStore(),
  };
  stores.document.set_loaded({
    path: "/notes/readme.md",
    name: "readme.md",
    text: "# Hello",
    mtime_ms: 1,
  });
  const write_text = vi.fn(() => Promise.resolve());
  const document = {
    get_markdown: vi.fn(() => "# Hello"),
    reveal_in_file_manager: vi.fn(() =>
      Promise.resolve(options.reveal_ok ?? true),
    ),
  };
  register_document_actions({
    registry,
    stores,
    services: {
      document: document as unknown as DocumentService,
      shell: {} as ShellService,
      clipboard: new ClipboardService({ write_text }, stores.op, () => 0),
    },
  });
  return { registry, stores, document, write_text };
}

describe("register_document_actions", () => {
  it("copies the editor's markdown through the clipboard operation", async () => {
    const { registry, stores, write_text } = create_harness();

    await registry.execute(ACTION_IDS.note_copy_markdown);

    expect(write_text).toHaveBeenCalledWith("# Hello");
    expect(stores.op.get("clipboard.write").status).toBe("success");
  });

  it("copies the file path", async () => {
    const { registry, write_text } = create_harness();

    await registry.execute(ACTION_IDS.document_copy_path);

    expect(write_text).toHaveBeenCalledWith("/notes/readme.md");
    expect(toast.success).toHaveBeenCalledWith("Path copied");
  });

  it("reveals the file without taking a path argument", async () => {
    const { registry, document } = create_harness();

    await registry.execute(ACTION_IDS.document_reveal_in_file_manager);

    expect(document.reveal_in_file_manager).toHaveBeenCalledWith();
  });

  it("tells the user when the file manager could not open", async () => {
    const { registry } = create_harness({ reveal_ok: false });

    await registry.execute(ACTION_IDS.document_reveal_in_file_manager);

    expect(toast.error).toHaveBeenCalled();
  });
});

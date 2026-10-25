import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_vault_find_actions } from "$lib/features/search/application/vault_find_actions";
import { vault_find_request_key } from "$lib/features/search/domain/vault_find_request";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import type {
  VaultFindFile,
  VaultReplaceRequest,
} from "$lib/features/search/types/vault_find";
import { as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

function file(path: string, match_count = 1): VaultFindFile {
  return {
    path,
    content_hash: `hash:${path}`,
    matches: Array.from({ length: match_count }, (_, index) => ({
      index,
      line: index + 1,
      column: 0,
      length: 3,
      before: "",
      text: "foo",
      after: "",
      groups: [],
    })),
  };
}

function find_request(text: string) {
  return {
    text,
    regex: false,
    case_sensitive: false,
    whole_word: false,
    include: "",
    exclude: "",
    tags: [],
  };
}

function create_harness(files: VaultFindFile[]) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
  };
  const services = {
    vault_find: {
      search: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      clear: vi.fn(),
      replace: vi.fn((request: VaultReplaceRequest) =>
        Promise.resolve({
          status: "replaced" as const,
          response: {
            replaced: request.files.map((target) => ({
              path: target.path,
              count: target.match_indexes.length,
              remaining: null as VaultFindFile | null,
            })),
            skipped: [],
          },
        }),
      ),
    },
    editor: {
      flush: vi.fn(),
      is_dirty: vi.fn().mockReturnValue(false),
      close_buffer: vi.fn(),
      select_line_range: vi.fn(),
    },
    tab: { mark_conflict: vi.fn() },
    links: { load_note_links: vi.fn() },
    note: { open_note: vi.fn().mockResolvedValue({ status: "opened" }) },
    git: {
      create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
    },
  };

  register_vault_find_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
    },
  });

  stores.ui.vault_find.query = "foo";
  stores.ui.vault_find.replacement = "bar";
  const results = stores.search.vault_find;
  results.start(find_request("foo"));
  results.add_files(files, []);
  results.finish({
    match_count: files.length,
    truncated: false,
    elapsed_ms: 1,
  });

  return { registry, stores, services };
}

function replaced_paths(replace: { mock: { calls: unknown[][] } }) {
  const request = replace.mock.calls[0]?.[0] as VaultReplaceRequest;
  return request.files.map((target) => target.path);
}

async function replace_all(registry: ActionRegistry) {
  await registry.execute(ACTION_IDS.vault_find_request_replace_all);
  await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);
}

function open_note(stores: { editor: EditorStore }, path: string) {
  const note = create_test_note(path.replace(/\.md$/, ""), path);
  stores.editor.set_open_note(create_open_note_state(note));
}

describe("register_vault_find_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replace all skips files with unsaved edits", async () => {
    const { registry, stores, services } = create_harness([
      file("active.md"),
      file("dirty.md"),
      file("clean.md"),
    ]);
    const dirty_tab = stores.tab.open_tab(as_note_path("dirty.md"), "dirty");
    stores.tab.set_dirty(dirty_tab.id, true);
    open_note(stores, "active.md");
    services.editor.is_dirty.mockReturnValue(true);

    await registry.execute(ACTION_IDS.vault_find_request_replace_all);
    expect(stores.ui.vault_replace_dialog.unsaved_paths).toEqual([
      "active.md",
      "dirty.md",
    ]);
    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    expect(services.editor.flush).toHaveBeenCalled();
    expect(replaced_paths(services.vault_find.replace)).toEqual(["clean.md"]);
    expect(vi.mocked(toast.warning).mock.calls[0]).toEqual([
      "Replaced 1 match in 1 file",
      {
        description:
          "2 files skipped: unsaved, open in a document window, or changed on disk",
      },
    ]);
  });

  it("replace all writes nothing when the git checkpoint fails", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    stores.git.set_enabled(true);
    services.git.create_checkpoint.mockResolvedValue({
      status: "failed",
      error: "index locked",
    });

    await replace_all(registry);

    expect(services.vault_find.replace).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("replace all makes a checkpoint first and runs the search again with the chips", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    stores.git.set_enabled(true);
    stores.ui.omnibar = {
      ...stores.ui.omnibar,
      open: true,
      mode: "find",
      tags: ["project"],
    };

    await replace_all(registry);

    expect(services.git.create_checkpoint).toHaveBeenCalledWith(
      'replace "foo"',
    );
    expect(services.vault_find.replace).toHaveBeenCalled();
    expect(services.vault_find.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "foo", tags: ["project"] }),
    );
  });

  it("replace all does not search again once Text mode is gone", async () => {
    const { registry, services } = create_harness([file("a.md")]);

    await replace_all(registry);

    expect(services.vault_find.replace).toHaveBeenCalled();
    expect(services.vault_find.search).not.toHaveBeenCalled();
  });

  it("replacing a match selects the next one, past the inserted text", async () => {
    const { registry, stores, services } = create_harness([
      file("a.md", 2),
      file("b.md"),
    ]);
    // foo -> foobar on line 1 leaves a fresh foo at column 0 and the old
    // line 2 match.
    services.vault_find.replace.mockImplementationOnce(() => {
      stores.search.vault_find.patch_file("a.md", file("a.md", 2));
      return Promise.resolve({
        status: "replaced" as const,
        response: {
          replaced: [{ path: "a.md", count: 1, remaining: file("a.md", 2) }],
          skipped: [],
        },
      });
    });
    stores.ui.vault_find.replacement = "foobar";

    await registry.execute(ACTION_IDS.vault_find_replace_match, {
      path: "a.md",
      match_index: 0,
    });

    expect(stores.ui.vault_find.selected_match).toMatchObject({
      path: "a.md",
      index: 1,
    });
  });

  it("replacing in a file selects the first match of the next file", async () => {
    const { registry, stores, services } = create_harness([
      file("a.md", 2),
      file("b.md"),
    ]);
    // foo -> foobar: the fresh scan of a.md still holds foo at the same spots.
    services.vault_find.replace.mockImplementationOnce(() => {
      stores.search.vault_find.patch_file("a.md", file("a.md", 2));
      return Promise.resolve({
        status: "replaced" as const,
        response: {
          replaced: [{ path: "a.md", count: 2, remaining: file("a.md", 2) }],
          skipped: [],
        },
      });
    });
    stores.ui.vault_find.replacement = "foobar";

    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");

    expect(stores.ui.vault_find.selected_match).toEqual({
      request_key: vault_find_request_key(find_request("foo")),
      path: "b.md",
      index: 0,
    });
  });

  it("replacing in a file that leaves the results selects the next file too", async () => {
    const { registry, stores } = create_harness([file("a.md"), file("b.md")]);

    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");

    expect(stores.ui.vault_find.selected_match).toMatchObject({
      path: "b.md",
      index: 0,
    });
  });

  it("ignores a second replace while the first one is running", async () => {
    const { registry, stores, services } = create_harness([file("a.md", 2)]);
    let finish_replace: () => void = () => {};
    services.vault_find.replace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish_replace = () => {
            resolve({
              status: "replaced" as const,
              response: {
                replaced: [{ path: "a.md", count: 1, remaining: null }],
                skipped: [],
              },
            });
          };
        }),
    );
    const replace_first_match = () =>
      registry.execute(ACTION_IDS.vault_find_replace_match, {
        path: "a.md",
        match_index: 0,
      });

    const first = replace_first_match();
    await vi.waitFor(() => {
      expect(services.vault_find.replace).toHaveBeenCalledOnce();
    });
    await replace_first_match();
    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");
    await registry.execute(ACTION_IDS.vault_find_request_replace_all);

    expect(services.vault_find.replace).toHaveBeenCalledOnce();
    expect(stores.ui.vault_replace_dialog.open).toBe(false);

    finish_replace();
    await first;
    await replace_first_match();
    expect(services.vault_find.replace).toHaveBeenCalledTimes(2);
  });

  it("leaves the selection alone when nothing was written", async () => {
    const { registry, stores, services } = create_harness([file("a.md", 2)]);
    services.editor.is_dirty.mockReturnValue(true);
    open_note(stores, "a.md");
    const selection = { request_key: "k", path: "a.md", index: 0 };
    stores.ui.vault_find.selected_match = selection;

    await registry.execute(ACTION_IDS.vault_find_replace_match, {
      path: "a.md",
      match_index: 0,
    });

    expect(services.vault_find.replace).not.toHaveBeenCalled();
    expect(stores.ui.vault_find.selected_match).toEqual(selection);
  });

  it("opening a match closes the omnibar and records the match as the selection", async () => {
    const { registry, stores, services } = create_harness([file("a.md", 2)]);
    stores.ui.omnibar = { ...stores.ui.omnibar, open: true, mode: "find" };
    const close_omnibar = vi.fn(() => {
      stores.ui.omnibar = { ...stores.ui.omnibar, open: false, mode: "notes" };
    });
    registry.register({
      id: ACTION_IDS.omnibar_close,
      label: "Close Omnibar",
      execute: close_omnibar,
    });
    registry.register({
      id: ACTION_IDS.note_open,
      label: "Open Note",
      execute: () => {
        open_note(stores, "a.md");
      },
    });

    await registry.execute(ACTION_IDS.vault_find_open_match, {
      path: "a.md",
      index: 1,
      line: 2,
      column: 0,
      length: 3,
    });

    expect(close_omnibar).toHaveBeenCalledOnce();
    expect(stores.ui.vault_find.selected_match).toEqual({
      request_key: vault_find_request_key(find_request("foo")),
      path: "a.md",
      index: 1,
    });
    expect(services.editor.select_line_range).toHaveBeenCalledWith(2, 0, 3);
  });

  it("reloads the active note and closes background buffers after a write", async () => {
    const { registry, stores, services } = create_harness([
      file("active.md"),
      file("other.md"),
    ]);
    open_note(stores, "active.md");
    const invalidate = vi.spyOn(stores.tab, "invalidate_cache_by_path");

    await replace_all(registry);

    expect(services.note.open_note).toHaveBeenCalledWith("active.md", false, {
      force_reload: true,
    });
    expect(services.editor.close_buffer).toHaveBeenCalledWith("other.md");
    expect(services.editor.close_buffer).not.toHaveBeenCalledWith("active.md");
    expect(invalidate).toHaveBeenCalledWith("other.md");
  });

  it("replace in file sends every match ordinal of that file only", async () => {
    const { registry, services } = create_harness([
      file("a.md", 3),
      file("b.md", 2),
    ]);

    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");

    const request = services.vault_find.replace.mock.calls[0]?.[0];
    expect(request?.files).toEqual([
      { path: "a.md", content_hash: "hash:a.md", match_indexes: [0, 1, 2] },
    ]);
    expect(request?.replacement).toBe("bar");
  });

  it("flags a conflict instead of reloading an active note you typed in during the write", async () => {
    const { registry, stores, services } = create_harness([
      file("active.md"),
      file("other.md"),
    ]);
    open_note(stores, "active.md");
    // Clean when the dialog opened and when the replace started, dirty by the
    // time the write is done.
    services.editor.is_dirty
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    await replace_all(registry);

    expect(services.tab.mark_conflict).toHaveBeenCalledWith("active.md");
    expect(services.note.open_note).not.toHaveBeenCalled();
    expect(services.editor.close_buffer).toHaveBeenCalledWith("other.md");
  });

  it("keeps the confirm dialog open until the write is done and ignores a second confirm", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    await registry.execute(ACTION_IDS.vault_find_request_replace_all);
    let finish_replace: () => void = () => {};
    services.vault_find.replace.mockImplementationOnce(
      (request: VaultReplaceRequest) =>
        new Promise((resolve) => {
          finish_replace = () => {
            resolve({
              status: "replaced" as const,
              response: {
                replaced: request.files.map((target) => ({
                  path: target.path,
                  count: 1,
                  remaining: null,
                })),
                skipped: [],
              },
            });
          };
        }),
    );

    const first = registry.execute(ACTION_IDS.vault_find_confirm_replace_all);
    await vi.waitFor(() => {
      expect(services.vault_find.replace).toHaveBeenCalledOnce();
    });
    expect(stores.ui.vault_replace_dialog).toMatchObject({
      open: true,
      is_replacing: true,
    });

    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);
    await registry.execute(ACTION_IDS.vault_find_cancel_replace_all);
    await registry.execute(ACTION_IDS.vault_find_request_replace_all);
    expect(services.vault_find.replace).toHaveBeenCalledOnce();
    expect(stores.ui.vault_replace_dialog.is_replacing).toBe(true);

    finish_replace();
    await first;
    expect(stores.ui.vault_replace_dialog).toMatchObject({
      open: false,
      is_replacing: false,
    });
  });

  it("replace all writes what the dialog showed, not what the results show by then", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    await registry.execute(ACTION_IDS.vault_find_request_replace_all);

    stores.ui.vault_find.replacement = "other";
    stores.search.vault_find.start(find_request("newer"));
    stores.search.vault_find.add_files([file("b.md")], []);
    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    const request = services.vault_find.replace.mock.calls[0]?.[0];
    expect(request?.text).toBe("foo");
    expect(request?.replacement).toBe("bar");
    expect(replaced_paths(services.vault_find.replace)).toEqual(["a.md"]);
  });

  it("makes a checkpoint for replace in file but not for a single match", async () => {
    const { registry, stores, services } = create_harness([file("a.md", 2)]);
    stores.git.set_enabled(true);

    await registry.execute(ACTION_IDS.vault_find_replace_match, {
      path: "a.md",
      match_index: 0,
    });
    expect(services.git.create_checkpoint).not.toHaveBeenCalled();
    expect(services.vault_find.replace).toHaveBeenCalledOnce();

    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");
    expect(services.git.create_checkpoint).toHaveBeenCalledOnce();
    expect(services.vault_find.replace).toHaveBeenCalledTimes(2);
  });

  it("closes the dialog when the checkpoint fails", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    stores.git.set_enabled(true);
    services.git.create_checkpoint.mockResolvedValue({
      status: "failed",
      error: "index locked",
    });
    await registry.execute(ACTION_IDS.vault_find_request_replace_all);

    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    expect(stores.ui.vault_replace_dialog.open).toBe(false);
    expect(stores.ui.vault_replace_dialog.is_replacing).toBe(false);
  });
});

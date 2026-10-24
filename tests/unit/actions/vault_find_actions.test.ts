import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_vault_find_actions } from "$lib/features/search/application/vault_find_actions";
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
      replacement: null,
    })),
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
              count: target.match_indexes?.length ?? 1,
              remaining: null,
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
      bootstrap_default_vault_path: null,
    },
  });

  stores.ui.vault_find.replacement = "bar";
  const results = stores.search.vault_find;
  results.start({
    text: "foo",
    regex: false,
    case_sensitive: false,
    whole_word: false,
    include: "",
    exclude: "",
    replacement: "bar",
  });
  results.add_files(files);
  results.finish({
    searched_files: files.length,
    skipped_files: 0,
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
      { description: "2 files skipped: unsaved or changed on disk" },
    ]);
  });

  it("replace all writes nothing when the git checkpoint fails", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    stores.git.set_enabled(true);
    services.git.create_checkpoint.mockResolvedValue({
      status: "failed",
      error: "index locked",
    });

    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    expect(services.vault_find.replace).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("replace all makes a checkpoint first and runs the search again", async () => {
    const { registry, stores, services } = create_harness([file("a.md")]);
    stores.git.set_enabled(true);

    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    expect(services.git.create_checkpoint).toHaveBeenCalledWith(
      'replace "foo"',
    );
    expect(services.vault_find.replace).toHaveBeenCalled();
    expect(services.vault_find.search).toHaveBeenCalledWith(
      expect.objectContaining({ text: "foo" }),
    );
  });

  it("reloads the active note and closes background buffers after a write", async () => {
    const { registry, stores, services } = create_harness([
      file("active.md"),
      file("other.md"),
    ]);
    open_note(stores, "active.md");
    const invalidate = vi.spyOn(stores.tab, "invalidate_cache_by_path");

    await registry.execute(ACTION_IDS.vault_find_confirm_replace_all);

    expect(services.note.open_note).toHaveBeenCalledWith("active.md", false, {
      force_reload: true,
    });
    expect(services.editor.close_buffer).toHaveBeenCalledWith("other.md");
    expect(services.editor.close_buffer).not.toHaveBeenCalledWith("active.md");
    expect(invalidate).toHaveBeenCalledWith("other.md");
  });

  it("replace in file leaves dismissed matches alone", async () => {
    const { registry, services } = create_harness([file("a.md", 3)]);

    await registry.execute(ACTION_IDS.vault_find_dismiss, {
      path: "a.md",
      match_index: 1,
    });
    await registry.execute(ACTION_IDS.vault_find_replace_file, "a.md");

    const request = services.vault_find.replace.mock.calls[0]?.[0];
    expect(request?.files).toEqual([
      { path: "a.md", content_hash: "hash:a.md", match_indexes: [0, 2] },
    ]);
    expect(request?.replacement).toBe("bar");
  });
});

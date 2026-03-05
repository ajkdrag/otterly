import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_git_actions } from "$lib/features/git/application/git_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
  },
}));

function create_harness() {
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
    outline: new OutlineStore(),
  };

  const services = {
    note: {
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "notes",
      }),
    },
    editor: {
      close_buffer: vi.fn(),
    },
    git: {
      check_repo: vi.fn().mockResolvedValue(undefined),
      init_repo: vi.fn().mockResolvedValue({ status: "initialized" }),
      refresh_status: vi.fn().mockResolvedValue(undefined),
      commit_all: vi.fn().mockResolvedValue(undefined),
      load_history: vi.fn().mockResolvedValue(undefined),
      get_diff: vi
        .fn()
        .mockResolvedValue({ additions: 1, deletions: 0, hunks: [] }),
      get_file_at_commit: vi.fn().mockResolvedValue("# at commit"),
      restore_version: vi.fn().mockResolvedValue(undefined),
      create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
    },
  };

  register_git_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services };
}

describe("register_git_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("git_init shows already-repo toast for no-op init", async () => {
    const { registry, services } = create_harness();
    services.git.init_repo.mockResolvedValue({ status: "already_repo" });

    await registry.execute(ACTION_IDS.git_init);

    expect(toast.info).toHaveBeenCalledWith(
      "Git repository is already initialized",
    );
  });

  it("git_commit_all delegates to service commit_all", async () => {
    const { registry, stores, services } = create_harness();
    stores.git.set_status("main", true, 1);

    await registry.execute(ACTION_IDS.git_commit_all);

    expect(services.git.commit_all).toHaveBeenCalledTimes(1);
  });

  it("git_open_history opens dialog and loads history for current note", async () => {
    const { registry, stores, services } = create_harness();
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text(""),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    await registry.execute(ACTION_IDS.git_open_history);

    expect(stores.ui.version_history_dialog.open).toBe(true);
    expect(stores.ui.version_history_dialog.note_path).toBe("notes/a.md");
    expect(services.git.load_history).toHaveBeenCalledWith("notes/a.md", 50);
  });

  it("git_select_commit stores diff when commit has changes", async () => {
    const { registry, stores } = create_harness();
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.set_history(
      [
        {
          hash: "abc123",
          short_hash: "abc123",
          author: "me",
          timestamp_ms: 1,
          message: "update",
        },
      ],
      "notes/a.md",
    );

    await registry.execute(ACTION_IDS.git_select_commit, {
      hash: "abc123",
      short_hash: "abc123",
    });

    expect(stores.git.selected_commit?.hash).toBe("abc123");
    expect(stores.git.selected_diff).not.toBeNull();
    expect(stores.git.selected_file_content).toBeNull();
  });

  it("git_select_commit falls back to file content when diff is empty", async () => {
    const { registry, stores, services } = create_harness();
    services.git.get_diff.mockResolvedValue({
      additions: 0,
      deletions: 0,
      hunks: [],
    });
    services.git.get_file_at_commit.mockResolvedValue("# restored body");
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.set_history(
      [
        {
          hash: "def456",
          short_hash: "def456",
          author: "me",
          timestamp_ms: 1,
          message: "update",
        },
      ],
      "notes/a.md",
    );

    await registry.execute(ACTION_IDS.git_select_commit, {
      hash: "def456",
      short_hash: "def456",
    });

    expect(stores.git.selected_diff).toBeNull();
    expect(stores.git.selected_file_content).toBe("# restored body");
  });

  it("git_confirm_checkpoint trims description and closes dialog", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.checkpoint_dialog = {
      open: true,
      description: "  milestone  ",
    };

    await registry.execute(ACTION_IDS.git_confirm_checkpoint);

    expect(toast.loading).toHaveBeenCalledWith("Creating checkpoint commit...");
    expect(toast.success).toHaveBeenCalledWith("Checkpoint created", {
      id: "toast-id",
    });
    expect(services.git.create_checkpoint).toHaveBeenCalledWith("milestone");
    expect(stores.ui.checkpoint_dialog.open).toBe(false);
    expect(stores.ui.checkpoint_dialog.description).toBe("");
  });

  it("git_confirm_checkpoint shows init action when no repo", async () => {
    const { registry, stores, services } = create_harness();
    services.git.create_checkpoint.mockResolvedValue({ status: "no_repo" });
    stores.ui.checkpoint_dialog = {
      open: true,
      description: "milestone",
    };

    await registry.execute(ACTION_IDS.git_confirm_checkpoint);

    expect(toast.error).toHaveBeenCalledWith(
      "No git repository found",
      expect.objectContaining({
        id: "toast-id",
      }),
    );
    const call_args = vi.mocked(toast.error).mock.calls[0] as unknown[];
    const opts = call_args[1] as { action: { label: string } };
    expect(opts.action.label).toBe("Initialize");
  });

  it("git_restore_version force-reloads restored note and closes history", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.tab.open_tab(as_note_path("notes/a.md"), "a");
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        mtime_ms: 0,
        size_bytes: 0,
      },
      markdown: as_markdown_text("# old"),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    await registry.execute(ACTION_IDS.git_restore_version, { hash: "abc123" });

    expect(services.git.restore_version).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      "abc123",
    );
    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      false,
      {
        force_reload: true,
      },
    );
    expect(stores.ui.version_history_dialog.open).toBe(false);
    expect(stores.ui.version_history_dialog.note_path).toBeNull();
  });
});

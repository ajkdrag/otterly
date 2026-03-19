import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { apply_opened_vault_session } from "$lib/features/vault";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { VaultSession } from "$lib/features/session";

function create_open_note(path: string) {
  const note_path = as_note_path(path);
  return {
    meta: {
      id: note_path,
      path: note_path,
      name: "a",
      title: "A",
      mtime_ms: 0,
      size_bytes: 0,
    },
    markdown: as_markdown_text("```\\nalpha\\n```"),
    buffer_id: note_path,
    is_dirty: false,
  };
}

describe("apply_opened_vault_session", () => {
  it("syncs a mounted editor to the restored active tab snapshot", async () => {
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
    const open_note = create_open_note("docs/a.md");
    const cursor = {
      line: 2,
      column: 1,
      total_lines: 4,
      total_words: 1,
      anchor: 8,
      head: 8,
    };
    const session: VaultSession = {
      tabs: [
        {
          note_path: open_note.meta.path,
          title: open_note.meta.title,
          is_pinned: false,
          is_dirty: false,
          scroll_top: 48,
          cursor,
          code_block_heights: [245],
          cached_note: open_note,
        },
      ],
      active_tab_path: open_note.meta.path,
    };

    const services = {
      session: {
        load_latest_session: vi.fn().mockResolvedValue(session),
        restore_latest_session: vi
          .fn()
          .mockImplementation((value: VaultSession) => {
            stores.tab.restore_tabs(
              value.tabs.map((entry) => ({
                id: entry.note_path,
                note_path: entry.note_path,
                title: entry.title,
                is_pinned: entry.is_pinned,
                is_dirty: entry.is_dirty,
              })),
              value.active_tab_path,
            );
            stores.tab.set_snapshot(open_note.meta.path, {
              scroll_top: 48,
              cursor,
              code_block_heights: [245],
            });
            stores.tab.set_cached_note(open_note.meta.path, open_note);
          }),
      },
      editor: {
        is_mounted: vi.fn().mockReturnValue(true),
        open_buffer: vi.fn(),
        set_scroll_top: vi.fn(),
        restore_view_state: vi.fn(),
        set_code_block_heights: vi.fn(),
        restore_cursor: vi.fn(),
      },
      note: {
        create_new_note: vi.fn(),
        open_note: vi.fn(),
      },
    };

    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh Folder Tree",
      execute: async () => {},
    });
    registry.register({
      id: ACTION_IDS.git_check_repo,
      label: "Check Git Repo",
      execute: async () => {},
    });

    await apply_opened_vault_session(
      {
        registry,
        stores,
        services: services as never,
        default_mount_config: {
          reset_app_state: false,
          bootstrap_default_vault_path: null,
        },
      },
      stores.ui.editor_settings,
    );

    expect(stores.editor.open_note).toEqual(open_note);
    expect(services.editor.open_buffer).toHaveBeenCalledWith(
      open_note,
      "reuse_cache",
      {
        cursor,
        code_block_heights: [245],
      },
    );
    expect(services.editor.set_scroll_top).toHaveBeenCalledWith(48);
  });
});

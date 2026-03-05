import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import {
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";
import { create_test_note, create_test_vault } from "../helpers/test_fixtures";

function create_omnibar_actions_harness() {
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
  const execute_vault_select = vi.fn((vault_id: unknown) => {
    stores.vault.set_vault(
      create_test_vault({ id: vault_id as ReturnType<typeof as_vault_id> }),
    );
    return Promise.resolve();
  });
  const execute_note_open = vi.fn().mockResolvedValue(undefined);

  const services = {
    vault: {
      choose_vault_path: vi.fn(),
      change_vault_by_path: vi.fn(),
      change_vault_by_id: vi.fn().mockResolvedValue({
        status: "opened",
        editor_settings: stores.ui.editor_settings,
      }),
      select_pinned_vault_by_slot: vi.fn(),
      remove_vault_from_registry: vi.fn(),
      toggle_vault_pin: vi.fn(),
      rebuild_index: vi.fn(),
      reset_change_operation: vi.fn(),
    },
    note: {
      open_note: vi.fn(),
    },
    folder: {},
    settings: {},
    search: {
      search_omnibar: vi.fn().mockResolvedValue({ domain: "notes", items: [] }),
      search_notes_all_vaults: vi.fn().mockResolvedValue({
        status: "success",
        groups: [],
      }),
      reset_search_notes_operation: vi.fn(),
    },
    editor: {},
    clipboard: {},
    shell: {},
    tab: {
      load_tabs: vi.fn().mockResolvedValue(null),
      restore_tabs: vi.fn().mockResolvedValue(undefined),
      save_tabs: vi.fn().mockResolvedValue(undefined),
    },
  };

  register_omnibar_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  registry.register({
    id: ACTION_IDS.vault_select,
    label: "Select Vault",
    execute: execute_vault_select,
  });

  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: execute_note_open,
  });

  return {
    registry,
    stores,
    services,
    execute_vault_select,
    execute_note_open,
  };
}

describe("register_omnibar_actions", () => {
  it("opens note after selecting cross-vault hit", async () => {
    const { registry, stores, execute_vault_select, execute_note_open } =
      create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault({ id: as_vault_id("vault-a") }));
    const note = create_test_note("docs/alpha", "Alpha");

    await registry.execute(ACTION_IDS.omnibar_confirm_item, {
      kind: "cross_vault_note",
      note,
      vault_id: as_vault_id("vault-b"),
      vault_name: "Vault B",
      score: 1,
      snippet: "alpha",
    });

    expect(execute_vault_select).not.toHaveBeenCalled();
    expect(execute_note_open).not.toHaveBeenCalled();
    expect(stores.ui.cross_vault_open_confirm).toEqual({
      open: true,
      target_vault_id: as_vault_id("vault-b"),
      target_vault_name: "Vault B",
      note_path: note.id,
    });

    await registry.execute(ACTION_IDS.omnibar_confirm_cross_vault_open);

    expect(execute_vault_select).toHaveBeenCalledWith(as_vault_id("vault-b"));
    expect(execute_note_open).toHaveBeenCalledWith({
      note_path: note.id,
      cleanup_if_missing: true,
    });
    expect(stores.ui.cross_vault_open_confirm.open).toBe(false);
  });

  it("switches scope and searches across all vaults", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();

    stores.ui.omnibar = {
      ...stores.ui.omnibar,
      open: true,
      query: "machine learning",
      scope: "current_vault",
    };

    await registry.execute(ACTION_IDS.omnibar_set_scope, "all_vaults");

    expect(stores.ui.omnibar.scope).toBe("all_vaults");
    expect(services.search.search_notes_all_vaults).toHaveBeenCalledWith(
      "machine learning",
    );
  });

  it("maps grouped all-vault results into omnibar cross-vault items", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();

    services.search.search_notes_all_vaults = vi.fn().mockResolvedValue({
      status: "success",
      groups: [
        {
          vault_id: as_vault_id("vault-b"),
          vault_name: "Vault B",
          vault_path: "/vault/b",
          results: [
            {
              note: {
                id: as_note_path("ml.md"),
                path: as_note_path("ml.md"),
                name: "ml",
                title: "ML",
                mtime_ms: 0,
                size_bytes: 0,
              },
              score: 0.9,
              snippet: "machine learning",
            },
          ],
        },
      ],
    });

    stores.ui.omnibar = {
      ...stores.ui.omnibar,
      open: true,
      query: "machine learning",
      scope: "all_vaults",
    };

    await registry.execute(ACTION_IDS.omnibar_set_query, "machine learning");

    expect(stores.search.omnibar_items).toHaveLength(1);
    expect(stores.search.omnibar_items[0]).toMatchObject({
      kind: "cross_vault_note",
      vault_name: "Vault B",
    });
  });

  it("uses local omnibar search for #planned even in all_vaults scope", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.search.search_omnibar = vi.fn().mockResolvedValue({
      domain: "planned",
      items: [
        {
          kind: "planned_note",
          target_path: "docs/planned/a.md",
          ref_count: 4,
          score: 4,
        },
      ],
    });

    stores.ui.omnibar = {
      ...stores.ui.omnibar,
      open: true,
      query: "#planned docs",
      scope: "all_vaults",
    };

    await registry.execute(ACTION_IDS.omnibar_set_query, "#planned docs");

    expect(services.search.search_notes_all_vaults).not.toHaveBeenCalled();
    expect(services.search.search_omnibar).toHaveBeenCalledWith(
      "#planned docs",
    );
    expect(stores.search.omnibar_items).toEqual([
      {
        kind: "planned_note",
        target_path: "docs/planned/a.md",
        ref_count: 4,
        score: 4,
      },
    ]);
  });

  it("opens planned-note omnibar hit via wiki-link action", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    const open_wiki_link = vi.fn().mockResolvedValue(undefined);
    registry.register({
      id: ACTION_IDS.note_open_wiki_link,
      label: "Open Wiki Link",
      execute: open_wiki_link,
    });

    stores.ui.omnibar = { ...stores.ui.omnibar, open: true };

    await registry.execute(ACTION_IDS.omnibar_confirm_item, {
      kind: "planned_note",
      target_path: "docs/planned/a.md",
      ref_count: 3,
      score: 3,
    });

    expect(open_wiki_link).toHaveBeenCalledWith(
      as_note_path("docs/planned/a.md"),
    );
    expect(stores.ui.omnibar.open).toBe(false);
  });

  it("cancels cross-vault open confirmation", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.ui.cross_vault_open_confirm = {
      open: true,
      target_vault_id: as_vault_id("vault-b"),
      target_vault_name: "Vault B",
      note_path: as_note_path("docs/alpha.md"),
    };

    await registry.execute(ACTION_IDS.omnibar_cancel_cross_vault_open);

    expect(stores.ui.cross_vault_open_confirm).toEqual({
      open: false,
      target_vault_id: null,
      target_vault_name: "",
      note_path: null,
    });
  });

  it("omnibar_open opens in current_vault scope", async () => {
    const { registry, stores } = create_omnibar_actions_harness();

    await registry.execute(ACTION_IDS.omnibar_open);

    expect(stores.ui.omnibar.open).toBe(true);
    expect(stores.ui.omnibar.scope).toBe("current_vault");
    expect(stores.ui.omnibar.query).toBe("");
  });

  it("omnibar_open_all_vaults opens in all_vaults scope", async () => {
    const { registry, stores } = create_omnibar_actions_harness();

    await registry.execute(ACTION_IDS.omnibar_open_all_vaults);

    expect(stores.ui.omnibar.open).toBe(true);
    expect(stores.ui.omnibar.scope).toBe("all_vaults");
    expect(stores.ui.omnibar.query).toBe("");
  });

  it("omnibar_open and omnibar_open_all_vaults are independent actions", async () => {
    const { registry, stores } = create_omnibar_actions_harness();

    await registry.execute(ACTION_IDS.omnibar_open);
    expect(stores.ui.omnibar.scope).toBe("current_vault");

    stores.ui.omnibar = { ...stores.ui.omnibar, open: false };

    await registry.execute(ACTION_IDS.omnibar_open_all_vaults);
    expect(stores.ui.omnibar.scope).toBe("all_vaults");
  });

  it("does not prompt switch for vault already marked unavailable", async () => {
    const { registry, stores, execute_vault_select, execute_note_open } =
      create_omnibar_actions_harness();
    const target_vault_id = as_vault_id("vault-b");
    stores.vault.set_recent_vaults([
      {
        id: target_vault_id,
        name: "Vault B",
        path: as_vault_path("/vault/b"),
        created_at: 1,
        is_available: false,
      },
    ]);

    await registry.execute(ACTION_IDS.omnibar_confirm_item, {
      kind: "cross_vault_note",
      note: create_test_note("docs/alpha", "Alpha"),
      vault_id: target_vault_id,
      vault_name: "Vault B",
      vault_is_available: false,
      score: 1,
      snippet: "alpha",
    });

    expect(stores.ui.cross_vault_open_confirm.open).toBe(false);
    expect(execute_vault_select).not.toHaveBeenCalled();
    expect(execute_note_open).not.toHaveBeenCalled();
  });
});

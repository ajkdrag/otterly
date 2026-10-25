import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import type { CommandId } from "$lib/features/search/types/command_palette";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { ProfileStore } from "$lib/features/profile/state/profile_store.svelte";
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
    profile: new ProfileStore(),
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
    editor: {
      tag_at_cursor: vi.fn((): string | null => null),
    },
    tags: {
      suggest_tags: vi.fn().mockResolvedValue([]),
      search_tagged_notes: vi.fn().mockResolvedValue({
        status: "ok",
        page: { notes: [], total: 0, truncated: false },
      }),
    },
    clipboard: {},
    shell: {},
    session: {
      load_latest_session: vi.fn().mockResolvedValue(null),
      restore_latest_session: vi.fn().mockResolvedValue(undefined),
      save_latest_session: vi.fn().mockResolvedValue(undefined),
    },
    tab: {
      mark_conflict: vi.fn(),
      sync_dirty_state: vi.fn(),
      clear_conflict: vi.fn(),
      has_conflict: vi.fn().mockReturnValue(false),
      invalidate_cache: vi.fn(),
      remove_tab: vi.fn(),
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

function tagged_page(paths: string[], truncated = false) {
  return {
    status: "ok" as const,
    page: {
      notes: paths.map((path) => ({
        note: create_test_note(path, path),
        snippet: `about ${path}`,
        match_detail: path === "body" ? ("content" as const) : null,
      })),
      total: paths.length,
      truncated,
    },
  };
}

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function command_item(command_id: CommandId) {
  const command = COMMANDS_REGISTRY.find((entry) => entry.id === command_id);
  if (!command) throw new Error(`Command "${command_id}" is not registered`);
  return { kind: "command" as const, command, score: 100 };
}

describe("register_omnibar_actions", () => {
  it("dispatches save, find, and theme commands to existing actions", async () => {
    const { registry } = create_omnibar_actions_harness();
    const save_note = vi.fn();
    const open_find = vi.fn();
    const open_settings = vi.fn();
    registry.register({
      id: ACTION_IDS.note_request_save,
      label: "Save Note",
      execute: save_note,
    });
    registry.register({
      id: ACTION_IDS.find_in_file_open,
      label: "Open Find in File",
      execute: open_find,
    });
    registry.register({
      id: ACTION_IDS.settings_open,
      label: "Open Settings",
      execute: open_settings,
    });

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      command_item("save_note"),
    );
    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      command_item("find_in_note"),
    );
    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      command_item("open_theme_settings"),
    );

    expect(save_note).toHaveBeenCalledOnce();
    expect(open_find).toHaveBeenCalledOnce();
    expect(open_settings).toHaveBeenCalledWith("theme");
  });

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

  it("omnibar_open switches to current_vault when already open in all_vaults", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();

    await registry.execute(ACTION_IDS.omnibar_open_all_vaults);
    await registry.execute(ACTION_IDS.omnibar_set_query, "machine learning");
    expect(services.search.search_notes_all_vaults).toHaveBeenCalledWith(
      "machine learning",
    );

    await registry.execute(ACTION_IDS.omnibar_open);
    expect(stores.ui.omnibar.open).toBe(true);
    expect(stores.ui.omnibar.scope).toBe("current_vault");
    expect(stores.ui.omnibar.query).toBe("machine learning");
    expect(services.search.search_omnibar).toHaveBeenCalledWith(
      "machine learning",
    );
  });

  it("omnibar_open_all_vaults switches to all_vaults when already open in current_vault", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();

    await registry.execute(ACTION_IDS.omnibar_open);
    await registry.execute(ACTION_IDS.omnibar_set_query, "machine learning");
    expect(services.search.search_omnibar).toHaveBeenCalledWith(
      "machine learning",
    );

    await registry.execute(ACTION_IDS.omnibar_open_all_vaults);
    expect(stores.ui.omnibar.open).toBe(true);
    expect(stores.ui.omnibar.scope).toBe("all_vaults");
    expect(stores.ui.omnibar.query).toBe("machine learning");
    expect(services.search.search_notes_all_vaults).toHaveBeenCalledWith(
      "machine learning",
    );
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

describe("omnibar tag search", () => {
  it("opens with the given tags as chips, deduped, and lists their notes", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.tags.search_tagged_notes.mockResolvedValue(
      tagged_page(["a", "body"], true),
    );

    await registry.execute(ACTION_IDS.omnibar_open_tags, {
      tags: ["Work", "work", "home"],
    });

    expect(stores.ui.omnibar).toMatchObject({
      open: true,
      query: "",
      scope: "current_vault",
      tags: ["Work", "home"],
      tag_match: "all",
    });
    expect(services.tags.search_tagged_notes).toHaveBeenCalledWith({
      tags: ["Work", "home"],
      match: "all",
      text: "",
      limit: 50,
    });
    expect(stores.search.omnibar_items).toMatchObject([
      { kind: "note", snippet: "about a", match_kind: undefined },
      { kind: "note", match_kind: "content", match_detail: "content" },
    ]);
    expect(stores.search.omnibar_truncated).toBe(true);
  });

  it("opens on the tag at the caret, or on the top tags when there is none", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.editor.tag_at_cursor.mockReturnValueOnce("idea");

    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar.tags).toEqual(["idea"]);

    await registry.execute(ACTION_IDS.omnibar_close);
    services.tags.suggest_tags.mockResolvedValue([{ tag: "work", count: 3 }]);
    await registry.execute(ACTION_IDS.omnibar_open_tags);

    expect(stores.ui.omnibar).toMatchObject({ query: "#", tags: [] });
    expect(services.tags.suggest_tags).toHaveBeenLastCalledWith("", [], 50);
    expect(stores.search.omnibar_items).toEqual([
      { kind: "tag", tag: "work", count: 3 },
    ]);
  });

  it("toggles the # token when it is already open, and leaves all vaults", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.ui.omnibar = {
      ...stores.ui.omnibar,
      open: true,
      query: "meeting",
      scope: "all_vaults",
    };

    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar.query).toBe("meeting #");
    expect(stores.ui.omnibar.scope).toBe("current_vault");

    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar.query).toBe("meeting");

    await registry.execute(ACTION_IDS.omnibar_set_query, ">theme");
    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar.query).toBe("#");
  });

  it("turns the typed # token into a chip and keeps the text before it", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.ui.omnibar = { ...stores.ui.omnibar, open: true };
    await registry.execute(ACTION_IDS.omnibar_set_query, "kickoff #pro");
    expect(services.tags.suggest_tags).toHaveBeenLastCalledWith("pro", [], 50);

    await registry.execute(ACTION_IDS.omnibar_confirm_item, {
      kind: "tag",
      tag: "Project",
      count: 4,
    });
    expect(stores.ui.omnibar.tags).toEqual(["Project"]);
    expect(stores.ui.omnibar.query).toBe("kickoff ");
    expect(services.tags.search_tagged_notes).toHaveBeenLastCalledWith({
      tags: ["Project"],
      match: "all",
      text: "kickoff",
      limit: 50,
    });

    await registry.execute(ACTION_IDS.omnibar_set_query, "kickoff #proj");
    expect(services.tags.suggest_tags).toHaveBeenLastCalledWith(
      "proj",
      ["Project"],
      50,
    );
  });

  it("adds the tag for the typed text when Enter comes before the new suggestions", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.tags.suggest_tags.mockImplementation((partial: string) =>
      Promise.resolve(
        partial === ""
          ? [{ tag: "topic434", count: 9 }]
          : [{ tag: "todo", count: 2 }],
      ),
    );
    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.search.omnibar_items).toMatchObject([{ tag: "topic434" }]);

    const slow = create_deferred<{ tag: string; count: number }[]>();
    services.tags.suggest_tags.mockReturnValueOnce(slow.promise);
    const typing = registry.execute(ACTION_IDS.omnibar_set_query, "#todo");
    await registry.execute(ACTION_IDS.omnibar_confirm_tag_suggestion);
    expect(stores.ui.omnibar.tags).toEqual(["todo"]);

    slow.resolve([{ tag: "todo", count: 2 }]);
    await typing;
    expect(stores.search.omnibar_items).toEqual([]);
  });

  it("removes a chip and switches between all and any tags", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    await registry.execute(ACTION_IDS.omnibar_open_tags, {
      tags: ["a", "b"],
    });

    await registry.execute(ACTION_IDS.omnibar_set_tag_match, "any");
    expect(services.tags.search_tagged_notes).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["a", "b"], match: "any" }),
    );

    await registry.execute(ACTION_IDS.omnibar_remove_tag, "A");
    expect(stores.ui.omnibar.tags).toEqual(["b"]);
    expect(services.tags.search_tagged_notes).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["b"] }),
    );
  });

  it("makes a chip when Space follows an existing tag, and plain text otherwise", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.ui.omnibar = { ...stores.ui.omnibar, open: true };
    services.tags.suggest_tags.mockResolvedValue([
      { tag: "Project", count: 2 },
    ]);

    await registry.execute(ACTION_IDS.omnibar_set_query, "#project");
    await registry.execute(ACTION_IDS.omnibar_set_query, "#project ");
    expect(stores.ui.omnibar).toMatchObject({ tags: ["Project"], query: "" });

    await registry.execute(ACTION_IDS.omnibar_set_query, "#proj");
    await registry.execute(ACTION_IDS.omnibar_set_query, "#proj ");
    expect(stores.ui.omnibar).toMatchObject({
      tags: ["Project"],
      query: "#proj ",
    });
  });

  it("keeps #planned followed by a space as the planned notes search", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.ui.omnibar = { ...stores.ui.omnibar, open: true };
    services.tags.suggest_tags.mockResolvedValue([
      { tag: "planned", count: 1 },
    ]);

    await registry.execute(ACTION_IDS.omnibar_set_query, "#planned");
    await registry.execute(ACTION_IDS.omnibar_set_query, "#planned ");

    expect(stores.ui.omnibar.tags).toEqual([]);
    expect(services.search.search_omnibar).toHaveBeenLastCalledWith(
      "#planned ",
    );
  });

  it("drops a tagged search answer once the chips changed", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    const slow = create_deferred<ReturnType<typeof tagged_page>>();
    services.tags.search_tagged_notes
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(tagged_page(["fresh"]));

    const first = registry.execute(ACTION_IDS.omnibar_open_tags, {
      tags: ["old"],
    });
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["new"] });
    slow.resolve(tagged_page(["stale"]));
    await first;

    expect(stores.search.omnibar_items).toMatchObject([
      { kind: "note", snippet: "about fresh" },
    ]);
  });

  it("flags a failed tagged search instead of showing it as no notes", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.tags.search_tagged_notes
      .mockResolvedValueOnce({ status: "failed", error: "ipc down" })
      .mockResolvedValueOnce(tagged_page(["a"]));

    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a"] });
    expect(stores.search.omnibar_items).toEqual([]);
    expect(stores.search.omnibar_failed).toBe(true);

    await registry.execute(ACTION_IDS.omnibar_set_tag_match, "any");
    expect(stores.search.omnibar_items).toHaveLength(1);
    expect(stores.search.omnibar_failed).toBe(false);
  });

  it("clears the chips for all vaults and on close", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a"] });
    await registry.execute(ACTION_IDS.omnibar_set_scope, "all_vaults");
    expect(stores.ui.omnibar.tags).toEqual([]);

    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a", "b"] });
    await registry.execute(ACTION_IDS.omnibar_set_tag_match, "any");
    await registry.execute(ACTION_IDS.omnibar_close);
    expect(stores.ui.omnibar).toMatchObject({ tags: [], tag_match: "all" });
  });
});

describe("omnibar Text mode", () => {
  function open_in_notes(
    stores: ReturnType<typeof create_omnibar_actions_harness>["stores"],
    query: string,
  ) {
    stores.ui.omnibar = { ...stores.ui.omnibar, open: true, query };
  }

  it("opens in Text mode on the last pattern", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";

    await registry.execute(ACTION_IDS.omnibar_open_find);

    expect(stores.ui.omnibar).toMatchObject({
      open: true,
      mode: "find",
      query: "",
      scope: "current_vault",
    });
    expect(stores.ui.vault_find.query).toBe("kickoff");
  });

  it("opens Text mode from the Find in Vault command", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";
    open_in_notes(stores, ">find in");

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      command_item("find_in_vault"),
    );

    expect(stores.ui.omnibar).toMatchObject({
      open: true,
      mode: "find",
      query: "",
    });
    expect(stores.ui.vault_find.query).toBe("kickoff");
  });

  it("brings a plain notes query into Text mode without its prefix", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "old";
    open_in_notes(stores, "@file kickoff notes");

    await registry.execute(ACTION_IDS.omnibar_open_find);

    expect(stores.ui.omnibar.mode).toBe("find");
    expect(stores.ui.vault_find.query).toBe("kickoff notes");
  });

  it("leaves commands and tag tokens behind and brings the last pattern back", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "old";

    for (const query of [">theme", "meeting #pro", ""]) {
      open_in_notes(stores, query);
      await registry.execute(ACTION_IDS.omnibar_open_find);
      expect(stores.ui.omnibar.mode).toBe("find");
      expect(stores.ui.vault_find.query).toBe("old");
      await registry.execute(ACTION_IDS.omnibar_close);
    }
  });

  it("asks for focus on the pattern when Find in Vault runs again in Text mode", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    await registry.execute(ACTION_IDS.omnibar_open_find);
    const nonce = stores.ui.vault_find.focus_nonce;

    await registry.execute(ACTION_IDS.omnibar_open_find);

    expect(stores.ui.omnibar.mode).toBe("find");
    expect(stores.ui.vault_find.focus_nonce).toBe(nonce + 1);
  });

  it("takes typing as a raw pattern: no notes search and no tag chips", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    services.tags.suggest_tags.mockResolvedValue([{ tag: "todo", count: 1 }]);
    await registry.execute(ACTION_IDS.omnibar_open_find);

    await registry.execute(ACTION_IDS.omnibar_set_query, "#todo");
    await registry.execute(ACTION_IDS.omnibar_set_query, "#todo ");

    expect(stores.ui.vault_find.query).toBe("#todo ");
    expect(stores.ui.omnibar).toMatchObject({ mode: "find", tags: [] });
    expect(services.search.search_omnibar).not.toHaveBeenCalled();
    expect(services.tags.suggest_tags).not.toHaveBeenCalled();
  });

  it("goes back to Notes with the pattern as the query, after @file for Files", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";
    await registry.execute(ACTION_IDS.omnibar_open_find);

    await registry.execute(ACTION_IDS.omnibar_set_target, "files");
    expect(stores.ui.omnibar).toMatchObject({
      mode: "notes",
      query: "@file kickoff",
    });
    expect(services.search.search_omnibar).toHaveBeenLastCalledWith(
      "@file kickoff",
    );

    await registry.execute(ACTION_IDS.omnibar_set_target, "all");
    expect(stores.ui.omnibar.query).toBe("kickoff");

    await registry.execute(ACTION_IDS.omnibar_set_target, "text");
    expect(stores.ui.omnibar.mode).toBe("find");
    await registry.execute(ACTION_IDS.omnibar_open);
    expect(stores.ui.omnibar).toMatchObject({
      mode: "notes",
      query: "kickoff",
    });
  });

  it("keeps the chips across both switches", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a"] });

    await registry.execute(ACTION_IDS.omnibar_set_target, "text");
    expect(stores.ui.omnibar).toMatchObject({ mode: "find", tags: ["a"] });

    await registry.execute(ACTION_IDS.omnibar_set_target, "all");
    expect(stores.ui.omnibar).toMatchObject({ mode: "notes", tags: ["a"] });
  });

  it("Cmd+T in Text mode picks a tag and comes back to Text with the chip", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";
    services.tags.suggest_tags.mockResolvedValue([{ tag: "work", count: 3 }]);
    await registry.execute(ACTION_IDS.omnibar_open_find);

    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar).toMatchObject({
      mode: "notes",
      query: "#",
      return_to_find: true,
    });
    expect(services.tags.suggest_tags).toHaveBeenLastCalledWith("", [], 50);

    await registry.execute(ACTION_IDS.omnibar_set_query, "#wo");
    expect(stores.ui.omnibar.mode).toBe("notes");

    await registry.execute(ACTION_IDS.omnibar_confirm_item, {
      kind: "tag",
      tag: "work",
      count: 3,
    });
    expect(stores.ui.omnibar).toMatchObject({
      mode: "find",
      tags: ["work"],
      return_to_find: false,
    });
    expect(stores.ui.vault_find.query).toBe("kickoff");
  });

  it("goes back to Text when the tag picker is dropped", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    await registry.execute(ACTION_IDS.omnibar_open_find);

    // Esc and Backspace over the `#` both leave an empty query.
    await registry.execute(ACTION_IDS.omnibar_open_tags);
    await registry.execute(ACTION_IDS.omnibar_set_query, "");
    expect(stores.ui.omnibar).toMatchObject({
      mode: "find",
      return_to_find: false,
    });

    await registry.execute(ACTION_IDS.omnibar_open_tags);
    await registry.execute(ACTION_IDS.omnibar_open_tags);
    expect(stores.ui.omnibar.mode).toBe("find");
  });

  it.each([
    [ACTION_IDS.omnibar_open_all_vaults, "all_vaults"],
    [ACTION_IDS.omnibar_open, "current_vault"],
  ])(
    "%s from the tag picker keeps the scope and does not go back to Text",
    async (action_id, scope) => {
      const { registry, stores } = create_omnibar_actions_harness();
      stores.vault.set_vault(create_test_vault());
      await registry.execute(ACTION_IDS.omnibar_open_find);
      await registry.execute(ACTION_IDS.omnibar_open_tags);

      await registry.execute(action_id);
      await registry.execute(ACTION_IDS.omnibar_set_query, "");

      expect(stores.ui.omnibar).toMatchObject({
        mode: "notes",
        scope,
        return_to_find: false,
      });
    },
  );

  it("goes back to Text on Space after a tag that does not exist, without the partial tag", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";
    await registry.execute(ACTION_IDS.omnibar_open_find);
    await registry.execute(ACTION_IDS.omnibar_open_tags);
    await registry.execute(ACTION_IDS.omnibar_set_query, "#xyz");

    await registry.execute(ACTION_IDS.omnibar_set_query, "#xyz ");

    expect(stores.ui.omnibar).toMatchObject({
      mode: "find",
      tags: [],
      return_to_find: false,
    });
    expect(stores.ui.vault_find.query).toBe("kickoff");
  });

  it("leaves Text mode for all vaults and drops the chips", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    stores.ui.vault_find.query = "kickoff";
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a"] });
    await registry.execute(ACTION_IDS.omnibar_open_find);

    await registry.execute(ACTION_IDS.omnibar_open_all_vaults);

    expect(stores.ui.omnibar).toMatchObject({
      mode: "notes",
      scope: "all_vaults",
      query: "kickoff",
      tags: [],
    });
    expect(services.search.search_notes_all_vaults).toHaveBeenCalledWith(
      "kickoff",
    );
  });

  it("runs no notes search for chip changes in Text mode", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a", "b"] });
    await registry.execute(ACTION_IDS.omnibar_open_find);
    services.tags.search_tagged_notes.mockClear();

    await registry.execute(ACTION_IDS.omnibar_set_tag_match, "any");
    await registry.execute(ACTION_IDS.omnibar_remove_tag, "a");

    expect(stores.ui.omnibar).toMatchObject({ tags: ["b"], tag_match: "any" });
    expect(services.tags.search_tagged_notes).not.toHaveBeenCalled();
  });

  it("close resets the mode and keeps the pattern for next time", async () => {
    const { registry, stores } = create_omnibar_actions_harness();
    stores.vault.set_vault(create_test_vault());
    await registry.execute(ACTION_IDS.omnibar_open_find);
    await registry.execute(ACTION_IDS.omnibar_set_query, "kickoff");

    await registry.execute(ACTION_IDS.omnibar_close);

    expect(stores.ui.omnibar).toMatchObject({ open: false, mode: "notes" });
    expect(stores.ui.vault_find.query).toBe("kickoff");
  });

  it("drops content hits for the Files button in tag mode", async () => {
    const { registry, stores, services } = create_omnibar_actions_harness();
    services.tags.search_tagged_notes.mockResolvedValue(
      tagged_page(["name", "body"], true),
    );
    await registry.execute(ACTION_IDS.omnibar_open_tags, { tags: ["a"] });

    await registry.execute(ACTION_IDS.omnibar_set_target, "files");

    expect(stores.ui.omnibar.query).toBe("@file ");
    expect(stores.search.omnibar_items).toMatchObject([
      { kind: "note", snippet: "about name" },
    ]);
    expect(stores.search.omnibar_truncated).toBe(false);
  });
});

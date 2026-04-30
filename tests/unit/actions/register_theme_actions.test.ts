import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { UserStore } from "$lib/features/user";
import { register_theme_actions } from "$lib/features/theme";
import { BUILTIN_NORDIC_DARK, type Theme } from "$lib/shared/types/theme";

function create_theme(
  id: string,
  name: string,
  overrides: Partial<Theme> = {},
): Theme {
  return {
    ...BUILTIN_NORDIC_DARK,
    id,
    name,
    is_builtin: false,
    token_overrides: {},
    ...overrides,
  };
}

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
    user: new UserStore(),
  };

  const services = {
    theme: {
      load_themes: vi.fn().mockResolvedValue({
        user_themes: [],
        active_theme_id: BUILTIN_NORDIC_DARK.id,
      }),
      save_user_themes: vi.fn().mockResolvedValue(undefined),
      save_active_theme_id: vi.fn().mockResolvedValue(undefined),
      duplicate_theme: vi.fn((name: string, base: Theme) => ({
        ...base,
        id: `${name.toLowerCase().replace(/\s+/g, "-")}-id`,
        name,
        is_builtin: false,
        token_overrides: { ...base.token_overrides },
      })),
    },
  };

  register_theme_actions({
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

describe("register_theme_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats rename as a draft and defers persistence", async () => {
    const { registry, stores, services } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    stores.ui.set_user_themes([theme]);
    stores.ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_rename, {
      id: theme.id,
      name: "Renamed Theme",
    });

    expect(stores.ui.user_themes[0]?.name).toBe("Renamed Theme");
    expect(stores.ui.theme_has_draft).toBe(true);
    expect(services.theme.save_user_themes).not.toHaveBeenCalled();
    expect(services.theme.save_active_theme_id).not.toHaveBeenCalled();
  });

  it("does not create a draft when switching to the active theme", async () => {
    const { registry, stores, services } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    stores.ui.set_user_themes([theme]);
    stores.ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_switch, theme.id);

    expect(stores.ui.active_theme_id).toBe(theme.id);
    expect(stores.ui.theme_has_draft).toBe(false);
    expect(services.theme.save_user_themes).not.toHaveBeenCalled();
    expect(services.theme.save_active_theme_id).not.toHaveBeenCalled();
  });

  it("reverts created themes on cancel", async () => {
    const { registry, stores, services } = create_harness();
    const base = create_theme("custom-a", "Custom A");
    stores.ui.set_user_themes([base]);
    stores.ui.set_active_theme_id(base.id);

    await registry.execute(ACTION_IDS.theme_create, {
      name: "Created Theme",
      base,
    });

    expect(stores.ui.user_themes).toHaveLength(2);
    expect(stores.ui.active_theme_id).toBe("created-theme-id");
    expect(services.theme.save_user_themes).not.toHaveBeenCalled();

    await registry.execute(ACTION_IDS.theme_revert);

    expect(stores.ui.user_themes).toEqual([base]);
    expect(stores.ui.active_theme_id).toBe(base.id);
    expect(stores.ui.theme_has_draft).toBe(false);
  });

  it("reverts multiple edited themes and the active theme switch", async () => {
    const { registry, stores } = create_harness();
    const theme_a = create_theme("custom-a", "Custom A", {
      editor_padding_x: 2,
    });
    const theme_b = create_theme("custom-b", "Custom B", {
      editor_padding_x: 3,
    });
    stores.ui.set_user_themes([theme_a, theme_b]);
    stores.ui.set_active_theme_id(theme_a.id);

    await registry.execute(ACTION_IDS.theme_update, {
      ...theme_a,
      editor_padding_x: 4,
    });
    await registry.execute(ACTION_IDS.theme_switch, theme_b.id);
    await registry.execute(ACTION_IDS.theme_update, {
      ...theme_b,
      editor_padding_x: 5,
    });
    await registry.execute(ACTION_IDS.theme_revert);

    expect(stores.ui.user_themes).toEqual([theme_a, theme_b]);
    expect(stores.ui.active_theme_id).toBe(theme_a.id);
    expect(stores.ui.theme_has_draft).toBe(false);
  });

  it("persists draft changes only on explicit save", async () => {
    const { registry, stores, services } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    stores.ui.set_user_themes([theme]);
    stores.ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_update, {
      ...theme,
      editor_padding_x: 4,
    });
    await registry.execute(ACTION_IDS.theme_save);

    expect(services.theme.save_user_themes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: theme.id,
        editor_padding_x: 4,
      }),
    ]);
    expect(services.theme.save_active_theme_id).toHaveBeenCalledWith(theme.id);
    expect(stores.ui.theme_has_draft).toBe(false);
  });
});

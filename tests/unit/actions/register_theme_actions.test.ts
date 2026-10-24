import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { register_theme_actions } from "$lib/features/theme";
import {
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_DARK,
  BUILTIN_NORDIC_LIGHT,
  FILE_THEME_ID,
  type Theme,
  type ThemeFileState,
} from "$lib/shared/types/theme";

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

const FILE_THEME: Theme = {
  ...BUILTIN_NORDIC_LIGHT,
  id: FILE_THEME_ID,
  name: "Desk lamp",
  is_builtin: true,
  font_size: 1.125,
};

const THEME_FILE_PATH = "/config/otterly/theme.yaml";

function valid_theme_file(theme: Theme): ThemeFileState {
  return { path: THEME_FILE_PATH, status: "valid", theme, errors: [] };
}

function create_harness() {
  const registry = new ActionRegistry();
  const stores = { ui: new UIStore() };

  const services = {
    theme: {
      load_themes: vi.fn().mockResolvedValue({
        user_themes: [],
        active_theme_id: BUILTIN_NORDIC_DARK.id,
      }),
      load_theme_file: vi.fn<() => Promise<ThemeFileState>>(),
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

  describe("theme.reload_file", () => {
    it("switches to a valid theme file and saves the choice", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.set_active_theme_id(BUILTIN_NORDIC_DARK.id);
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );

      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.theme_file).toEqual(valid_theme_file(FILE_THEME));
      expect(stores.ui.active_theme_id).toBe(FILE_THEME_ID);
      expect(stores.ui.active_theme).toEqual(FILE_THEME);
      expect(services.theme.save_active_theme_id).toHaveBeenCalledWith(
        FILE_THEME_ID,
      );
    });

    it("does not switch while the settings dialog has a theme draft", async () => {
      const { registry, stores, services } = create_harness();
      await registry.execute(ACTION_IDS.theme_switch, BUILTIN_NORDIC_LIGHT.id);
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );

      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.theme_file.theme).toEqual(FILE_THEME);
      expect(stores.ui.active_theme_id).toBe(BUILTIN_NORDIC_LIGHT.id);
      expect(services.theme.save_active_theme_id).not.toHaveBeenCalled();
    });

    it("keeps the last valid file theme while the file has errors", async () => {
      const { registry, stores, services } = create_harness();
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );
      await registry.execute(ACTION_IDS.theme_reload_file);

      const errors = [
        { line: 2, key: "font_size", message: "font_size must be a number" },
      ];
      services.theme.load_theme_file.mockResolvedValue({
        path: THEME_FILE_PATH,
        status: "invalid",
        theme: null,
        errors,
      });
      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.theme_file).toEqual({
        path: THEME_FILE_PATH,
        status: "invalid",
        theme: FILE_THEME,
        errors,
      });
      expect(stores.ui.active_theme).toEqual(FILE_THEME);
    });

    it("falls back to Mocha when the active theme file is deleted", async () => {
      const { registry, stores, services } = create_harness();
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );
      await registry.execute(ACTION_IDS.theme_reload_file);

      services.theme.load_theme_file.mockResolvedValue({
        path: THEME_FILE_PATH,
        status: "missing",
        theme: null,
        errors: [],
      });
      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.theme_file.theme).toBeNull();
      // Recreating the file brings it back, so the choice stays saved.
      expect(stores.ui.active_theme_id).toBe(FILE_THEME_ID);
      expect(stores.ui.active_theme).toBe(BUILTIN_MOCHA);
    });
  });

  it("does not delete the file theme", async () => {
    const { registry, stores, services } = create_harness();
    services.theme.load_theme_file.mockResolvedValue(
      valid_theme_file(FILE_THEME),
    );
    await registry.execute(ACTION_IDS.theme_reload_file);

    await registry.execute(ACTION_IDS.theme_delete, FILE_THEME_ID);

    expect(stores.ui.active_theme_id).toBe(FILE_THEME_ID);
    expect(stores.ui.theme_has_draft).toBe(false);
  });
});

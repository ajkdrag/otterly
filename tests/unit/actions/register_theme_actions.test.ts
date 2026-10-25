import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
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

vi.mock("svelte-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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

function create_harness({ persist_file_switch = true } = {}) {
  const registry = new ActionRegistry();
  const stores = { ui: new UIStore() };

  const services = {
    theme: {
      load_themes: vi.fn().mockResolvedValue({
        user_themes: [],
        active_theme_id: BUILTIN_NORDIC_DARK.id,
      }),
      load_theme_file: vi.fn<() => Promise<ThemeFileState>>(),
      create_theme_file_from: vi.fn(),
      open_theme_file: vi.fn<() => Promise<boolean>>(),
      reveal_theme_file: vi.fn<() => Promise<boolean>>(),
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
    persist_file_switch,
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

    it("switches without saving the choice in a window that does not persist it", async () => {
      const { registry, stores, services } = create_harness({
        persist_file_switch: false,
      });
      stores.ui.set_active_theme_id(BUILTIN_NORDIC_DARK.id);
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );

      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.active_theme_id).toBe(FILE_THEME_ID);
      expect(services.theme.save_active_theme_id).not.toHaveBeenCalled();
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

    it("keeps the last known path when the file can't be read", async () => {
      const { registry, stores, services } = create_harness();
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );
      await registry.execute(ACTION_IDS.theme_reload_file);

      services.theme.load_theme_file.mockResolvedValue({
        path: null,
        status: "invalid",
        theme: null,
        errors: [
          {
            line: null,
            key: null,
            message: "Found more than one theme file (theme.yaml, theme.json).",
          },
        ],
      });
      await registry.execute(ACTION_IDS.theme_reload_file);

      expect(stores.ui.theme_file.status).toBe("invalid");
      expect(stores.ui.theme_file.path).toBe(THEME_FILE_PATH);
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

  describe("theme file buttons", () => {
    it("shows the file in the file manager when no app can open it", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.set_theme_file(valid_theme_file(FILE_THEME));
      services.theme.open_theme_file.mockResolvedValue(false);
      services.theme.reveal_theme_file.mockResolvedValue(true);

      await registry.execute(ACTION_IDS.theme_open_file);

      expect(services.theme.reveal_theme_file).toHaveBeenCalledOnce();
      expect(toast.error).toHaveBeenCalledOnce();
    });

    it("does not reveal the file when it opened", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.set_theme_file(valid_theme_file(FILE_THEME));
      services.theme.open_theme_file.mockResolvedValue(true);

      await registry.execute(ACTION_IDS.theme_open_file);

      expect(services.theme.reveal_theme_file).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("says there is no file yet instead of opening or revealing one", async () => {
      const { registry, stores, services } = create_harness();
      expect(stores.ui.theme_file.status).toBe("missing");

      await registry.execute(ACTION_IDS.theme_open_file);
      await registry.execute(ACTION_IDS.theme_reveal_file);

      expect(services.theme.open_theme_file).not.toHaveBeenCalled();
      expect(services.theme.reveal_theme_file).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(2);
      expect(toast.error).toHaveBeenCalledWith(
        "There is no theme file yet. Create one in Settings > Theme.",
      );
    });

    it("still reveals a file the app can't read, to fix it in the folder", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.set_theme_file({
        path: THEME_FILE_PATH,
        status: "invalid",
        theme: null,
        errors: [{ line: null, key: null, message: "Found both files" }],
      });
      services.theme.reveal_theme_file.mockResolvedValue(true);

      await registry.execute(ACTION_IDS.theme_reveal_file);

      expect(services.theme.reveal_theme_file).toHaveBeenCalledOnce();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("creates the file from the active theme, then loads and opens it", async () => {
      const { registry, stores, services } = create_harness();
      stores.ui.set_active_theme_id(BUILTIN_NORDIC_LIGHT.id);
      services.theme.create_theme_file_from.mockResolvedValue({
        status: "created",
        path: THEME_FILE_PATH,
      });
      services.theme.load_theme_file.mockResolvedValue(
        valid_theme_file(FILE_THEME),
      );
      services.theme.open_theme_file.mockResolvedValue(true);

      await registry.execute(ACTION_IDS.theme_create_file);

      expect(services.theme.create_theme_file_from).toHaveBeenCalledWith(
        BUILTIN_NORDIC_LIGHT,
      );
      expect(stores.ui.theme_file.status).toBe("valid");
      expect(services.theme.open_theme_file).toHaveBeenCalledOnce();
    });

    it("does not load or open anything when creating the file fails", async () => {
      const { registry, services } = create_harness();
      services.theme.create_theme_file_from.mockResolvedValue({
        status: "failed",
        error: "A theme file already exists",
      });

      await registry.execute(ACTION_IDS.theme_create_file);

      expect(services.theme.load_theme_file).not.toHaveBeenCalled();
      expect(services.theme.open_theme_file).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledOnce();
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

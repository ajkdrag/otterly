import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "$lib/features/settings/application/settings_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_vault_id } from "$lib/shared/types/ids";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { create_test_vault } from "../helpers/test_fixtures";

const VAULT_ID = as_vault_id("vault-a");

function make_service(overrides: {
  vault_get?: unknown;
  global_get?: (key: string) => unknown;
}) {
  const vault_settings_port = {
    get_vault_setting: vi.fn().mockResolvedValue(overrides.vault_get ?? null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
  };
  const global_get = overrides.global_get ?? (() => null);
  const settings_port = {
    get_setting: vi
      .fn()
      .mockImplementation((key: string) => Promise.resolve(global_get(key))),
    set_setting: vi.fn().mockResolvedValue(undefined),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: VAULT_ID }));
  const op_store = new OpStore();
  const service = new SettingsService(
    vault_settings_port as never,
    settings_port as never,
    vault_store,
    op_store,
    () => 1,
  );
  return { service, vault_settings_port, settings_port };
}

describe("SettingsService", () => {
  it("loads global-only settings from global port, not vault", async () => {
    const { service } = make_service({
      vault_get: { max_open_tabs: 8 },
      global_get: (key) => {
        if (key === "show_vault_dashboard_on_open") return false;
        if (key === "autosave_enabled") return false;
        if (key === "git_autocommit_enabled") return true;
        return null;
      },
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.settings.show_vault_dashboard_on_open).toBe(false);
    expect(result.settings.autosave_enabled).toBe(false);
    expect(result.settings.git_autocommit_enabled).toBe(true);
    expect(result.settings.max_open_tabs).toBe(8);
  });

  it("saves global-only settings to global port only", async () => {
    const { service, vault_settings_port, settings_port } = make_service({});

    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      show_vault_dashboard_on_open: false,
      autosave_enabled: false,
      git_autocommit_enabled: true,
    };

    const result = await service.save_settings(settings);

    expect(result.status).toBe("success");

    const saved_vault = vault_settings_port.set_vault_setting.mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(saved_vault).not.toHaveProperty("show_vault_dashboard_on_open");
    expect(saved_vault).not.toHaveProperty("autosave_enabled");
    expect(saved_vault).not.toHaveProperty("git_autocommit_enabled");
    expect(saved_vault).toHaveProperty("max_open_tabs");

    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "show_vault_dashboard_on_open",
      false,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "autosave_enabled",
      false,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "git_autocommit_enabled",
      true,
    );
  });

  it("sanitizes stale global-only keys from vault settings during load", async () => {
    const { service, vault_settings_port } = make_service({
      vault_get: {
        max_open_tabs: 7,
        autosave_enabled: true,
        show_vault_dashboard_on_open: true,
        git_autocommit_enabled: true,
      },
      global_get: () => false,
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");

    const written_vault = vault_settings_port.set_vault_setting.mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(written_vault).not.toHaveProperty("show_vault_dashboard_on_open");
    expect(written_vault).not.toHaveProperty("autosave_enabled");
    expect(written_vault).not.toHaveProperty("git_autocommit_enabled");
    expect(written_vault).toHaveProperty("max_open_tabs", 7);
  });

  it("uses fallback defaults when no global value is stored", async () => {
    const { service } = make_service({
      vault_get: { max_open_tabs: 3 },
      global_get: () => null,
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.settings.show_vault_dashboard_on_open).toBe(
      DEFAULT_EDITOR_SETTINGS.show_vault_dashboard_on_open,
    );
    expect(result.settings.autosave_enabled).toBe(
      DEFAULT_EDITOR_SETTINGS.autosave_enabled,
    );
  });

  it("persists store_attachments_with_note as vault-scoped, not global", async () => {
    const { service, vault_settings_port, settings_port } = make_service({});

    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      store_attachments_with_note: true,
    };

    const result = await service.save_settings(settings);

    expect(result.status).toBe("success");

    const saved_vault = vault_settings_port.set_vault_setting.mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(saved_vault).toHaveProperty("store_attachments_with_note", true);

    const global_keys = settings_port.set_setting.mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(global_keys).not.toContain("store_attachments_with_note");
  });

  it("loads store_attachments_with_note from vault settings", async () => {
    const { service } = make_service({
      vault_get: { store_attachments_with_note: true },
    });

    const result = await service.load_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.settings.store_attachments_with_note).toBe(true);
  });
});

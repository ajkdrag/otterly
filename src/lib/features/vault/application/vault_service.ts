import type { VaultPort } from "$lib/features/vault/ports";
import type { NotesPort } from "$lib/features/note";
import type { WorkspaceIndexPort } from "$lib/features/search";
import type { SettingsPort } from "$lib/features/settings";
import type { VaultSettingsPort } from "$lib/features/vault/ports";
import {
  as_vault_id,
  type VaultId,
  type VaultPath,
} from "$lib/shared/types/ids";
import type { Vault } from "$lib/shared/types/vault";
import type { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type { NotesStore } from "$lib/features/note";
import type { EditorStore } from "$lib/features/editor";
import type { OpStore } from "$lib/app";
import type { SearchStore } from "$lib/features/search";
import type { NoteMeta } from "$lib/shared/types/note";
import type { FolderStats } from "$lib/shared/types/filetree";
import {
  DEFAULT_EDITOR_SETTINGS,
  SETTINGS_KEY,
  omit_global_only_keys,
  apply_global_only_overrides,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import type {
  VaultChoosePathResult,
  VaultInitializeResult,
  VaultOpenResult,
} from "$lib/features/vault/types/vault_service_result";
import { create_untitled_open_note } from "$lib/features/note";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";

const log = create_logger("vault_service");

export type AppMountConfig = {
  reset_app_state: boolean;
  bootstrap_default_vault_path: VaultPath | null;
};

const RECENT_NOTES_KEY = "recent_notes";
const STARRED_PATHS_KEY = "starred_paths";
const PINNED_VAULT_IDS_KEY = "pinned_vault_ids";

type VaultOpenSnapshot = {
  root_contents: Awaited<ReturnType<NotesPort["list_folder_contents"]>>;
  recent_vaults: Vault[];
  pinned_vault_ids: VaultId[];
  recent_notes: NoteMeta[];
  starred_paths: string[];
  editor_settings: EditorSettings;
};

class StaleVaultOpenError extends Error {
  constructor() {
    super("Stale vault-open request");
    this.name = "StaleVaultOpenError";
  }
}

export class VaultService {
  constructor(
    private readonly vault_port: VaultPort,
    private readonly notes_port: NotesPort,
    private readonly index_port: WorkspaceIndexPort,
    private readonly settings_port: SettingsPort,
    private readonly vault_settings_port: VaultSettingsPort,
    private readonly vault_store: VaultStore,
    private readonly notes_store: NotesStore,
    private readonly editor_store: EditorStore,
    private readonly op_store: OpStore,
    private readonly search_store: SearchStore,
    private readonly now_ms: () => number,
  ) {}

  private index_progress_unsubscribe: (() => void) | null = null;
  private active_open_revision = 0;

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private start_operation(operation_key: string): void {
    this.op_store.start(operation_key, this.now_ms());
  }

  private succeed_operation(operation_key: string): void {
    this.op_store.succeed(operation_key);
  }

  private fail_operation(
    operation_key: string,
    log_label: string,
    error: unknown,
  ): string {
    const message = error_message(error);
    log.error(log_label, { error: message });
    this.op_store.fail(operation_key, message);
    return message;
  }

  async initialize(config: AppMountConfig): Promise<VaultInitializeResult> {
    if (config.reset_app_state) {
      this.reset_app_state();
    }

    this.start_operation("app.startup");

    try {
      let editor_settings: EditorSettings | null = null;

      const has_vault = this.vault_store.vault !== null;

      if (!has_vault && config.bootstrap_default_vault_path) {
        const default_path = config.bootstrap_default_vault_path;
        const open_revision = await this.begin_open_revision();
        editor_settings = await this.open_vault(
          () => this.vault_port.open_vault(default_path),
          open_revision,
        );
      } else {
        const [recent_vaults, pinned_vault_ids] = await Promise.all([
          this.vault_port.list_vaults(),
          this.load_pinned_vault_ids(),
        ]);
        this.vault_store.set_recent_vaults(recent_vaults);
        this.vault_store.set_pinned_vault_ids(pinned_vault_ids);

        const current_vault_id = this.get_active_vault_id();
        if (current_vault_id) {
          editor_settings = await this.load_editor_settings(current_vault_id);
        }
      }

      this.succeed_operation("app.startup");

      return {
        status: "ready",
        has_vault: this.vault_store.vault !== null,
        editor_settings,
      };
    } catch (error) {
      const message = this.fail_operation(
        "app.startup",
        "App startup failed",
        error,
      );
      return {
        status: "error",
        error: message,
      };
    }
  }

  async choose_vault_path(): Promise<VaultChoosePathResult> {
    try {
      const vault_path = await this.vault_port.choose_vault();
      if (!vault_path) {
        return { status: "cancelled" };
      }

      return {
        status: "selected",
        path: vault_path,
      };
    } catch (error) {
      return {
        status: "failed",
        error: error_message(error),
      };
    }
  }

  async change_vault_by_path(vault_path: VaultPath): Promise<VaultOpenResult> {
    return this.change_vault(
      (revision) =>
        this.open_vault(() => this.vault_port.open_vault(vault_path), revision),
      "Choose vault failed",
    );
  }

  async change_vault_by_id(vault_id: VaultId): Promise<VaultOpenResult> {
    return this.change_vault(
      (revision) =>
        this.open_vault(
          () => this.vault_port.open_vault_by_id(vault_id),
          revision,
        ),
      "Select vault failed",
    );
  }

  async toggle_vault_pin(
    vault_id: VaultId,
  ): Promise<{ status: "success" } | { status: "failed"; error: string }> {
    const exists = this.vault_store.recent_vaults.some(
      (vault) => vault.id === vault_id,
    );
    if (!exists) {
      return { status: "failed", error: "Vault not found in recent list" };
    }

    const previous_pinned_ids = [...this.vault_store.pinned_vault_ids];
    this.start_operation("vault.pin");
    this.vault_store.toggle_pinned_vault(vault_id);

    try {
      await this.save_pinned_vault_ids(this.vault_store.pinned_vault_ids);
      this.succeed_operation("vault.pin");
      return { status: "success" };
    } catch (error) {
      this.vault_store.set_pinned_vault_ids(previous_pinned_ids);
      const message = this.fail_operation(
        "vault.pin",
        "Toggle vault pin failed",
        error,
      );
      return { status: "failed", error: message };
    }
  }

  async select_pinned_vault_by_slot(
    slot: number,
  ): Promise<VaultOpenResult | { status: "skipped" }> {
    const vault_id = this.vault_store.get_pinned_vault_id_by_slot(slot);
    if (!vault_id) {
      return { status: "skipped" };
    }
    return this.change_vault_by_id(vault_id);
  }

  async remove_vault_from_registry(
    vault_id: VaultId,
  ): Promise<{ status: "success" } | { status: "failed"; error: string }> {
    if (this.vault_store.vault?.id === vault_id) {
      return { status: "failed", error: "Cannot remove active vault" };
    }

    const previous_recent_vaults = [...this.vault_store.recent_vaults];
    const previous_pinned_vault_ids = [...this.vault_store.pinned_vault_ids];
    this.start_operation("vault.remove");

    try {
      await this.vault_port.remove_vault(vault_id);
      const [recent_vaults, pinned_vault_ids] = await Promise.all([
        this.vault_port.list_vaults(),
        this.load_pinned_vault_ids(),
      ]);
      this.vault_store.set_recent_vaults(recent_vaults);
      this.vault_store.set_pinned_vault_ids(pinned_vault_ids);
      await this.save_pinned_vault_ids(this.vault_store.pinned_vault_ids);
      this.succeed_operation("vault.remove");
      return { status: "success" };
    } catch (error) {
      this.vault_store.set_recent_vaults(previous_recent_vaults);
      this.vault_store.set_pinned_vault_ids(previous_pinned_vault_ids);
      const message = this.fail_operation(
        "vault.remove",
        "Remove vault from registry failed",
        error,
      );
      return { status: "failed", error: message };
    }
  }

  async rebuild_index(): Promise<
    | { status: "success" }
    | { status: "skipped" }
    | { status: "failed"; error: string }
  > {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }
    if (this.search_store.index_progress.status === "indexing") {
      return { status: "skipped" };
    }

    this.start_operation("vault.reindex");

    try {
      await this.index_port.rebuild_index(vault_id);
      this.succeed_operation("vault.reindex");
      return { status: "success" };
    } catch (error) {
      const message = this.fail_operation(
        "vault.reindex",
        "Reindex vault failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async sync_index(): Promise<
    | { status: "success" }
    | { status: "skipped" }
    | { status: "failed"; error: string }
  > {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }
    if (this.search_store.index_progress.status === "indexing") {
      return { status: "skipped" };
    }

    this.start_operation("vault.sync_index");

    try {
      await this.index_port.sync_index(vault_id);
      this.succeed_operation("vault.sync_index");
      return { status: "success" };
    } catch (error) {
      const message = this.fail_operation(
        "vault.sync_index",
        "Sync vault index failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  private async change_vault(
    open_fn: (revision: number) => Promise<EditorSettings>,
    error_label: string,
  ): Promise<VaultOpenResult> {
    const open_revision = await this.begin_open_revision();
    this.start_operation("vault.change");

    try {
      const editor_settings = await open_fn(open_revision);
      if (!this.is_current_open_revision(open_revision)) {
        return { status: "stale" };
      }
      this.succeed_operation("vault.change");
      return {
        status: "opened",
        editor_settings,
        opened_from_vault_switch: true,
      };
    } catch (error) {
      if (error instanceof StaleVaultOpenError) {
        return { status: "stale" };
      }
      const message = this.fail_operation("vault.change", error_label, error);
      return { status: "failed", error: message };
    }
  }

  private async open_vault(
    open_fn: () => Promise<Vault>,
    open_revision: number,
  ): Promise<EditorSettings> {
    const vault = await open_fn();
    this.throw_if_stale(open_revision);
    return this.finish_open_vault(vault, open_revision);
  }

  private async finish_open_vault(
    vault: Vault,
    open_revision: number,
  ): Promise<EditorSettings> {
    const snapshot = await this.load_open_vault_snapshot(vault, open_revision);
    this.throw_if_stale(open_revision);

    this.apply_open_vault_snapshot(vault, snapshot);
    this.trigger_dashboard_stats_refresh(vault.id, open_revision);
    this.subscribe_open_vault_index_progress(vault.id, open_revision);
    this.trigger_background_index_sync(vault.id, open_revision);

    return snapshot.editor_settings;
  }

  private async load_open_vault_snapshot(
    vault: Vault,
    open_revision: number,
  ): Promise<VaultOpenSnapshot> {
    await this.vault_port.remember_last_vault(vault.id);
    this.throw_if_stale(open_revision);

    const [root_contents, recent_vaults, pinned_vault_ids] = await Promise.all([
      this.notes_port.list_folder_contents(vault.id, "", 0, PAGE_SIZE),
      this.vault_port.list_vaults(),
      this.load_pinned_vault_ids(),
    ]);
    this.throw_if_stale(open_revision);

    const recent_notes = await this.load_recent_notes(vault.id);
    const starred_paths = await this.load_starred_paths(vault.id);
    const editor_settings = await this.load_editor_settings(vault.id);

    return {
      root_contents,
      recent_vaults,
      pinned_vault_ids,
      recent_notes,
      starred_paths,
      editor_settings,
    };
  }

  private apply_open_vault_snapshot(vault: Vault, snapshot: VaultOpenSnapshot) {
    this.clear_open_runtime_subscriptions();
    this.vault_store.clear();
    this.notes_store.reset();
    this.editor_store.reset();
    this.search_store.reset();

    this.vault_store.set_vault(vault);
    this.notes_store.merge_folder_contents("", snapshot.root_contents);
    this.vault_store.set_recent_vaults(snapshot.recent_vaults);
    this.vault_store.set_pinned_vault_ids(snapshot.pinned_vault_ids);
    this.notes_store.set_recent_notes(snapshot.recent_notes);
    this.notes_store.set_starred_paths(snapshot.starred_paths);
    this.notes_store.set_dashboard_stats_loading();

    this.editor_store.set_open_note(
      create_untitled_open_note({ open_titles: [], now_ms: this.now_ms() }),
    );
  }

  async refresh_dashboard_stats(): Promise<
    | { status: "ready"; stats: FolderStats }
    | { status: "skipped" }
    | { status: "failed"; error: string }
  > {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    this.notes_store.set_dashboard_stats_loading();
    const result = await this.fetch_dashboard_stats(vault_id);
    if (this.get_active_vault_id() !== vault_id) {
      return { status: "skipped" };
    }

    if (result.status === "ready") {
      this.notes_store.set_dashboard_stats(result.stats);
      return result;
    }

    this.notes_store.set_dashboard_stats_error(result.error);
    return result;
  }

  private trigger_dashboard_stats_refresh(
    vault_id: VaultId,
    open_revision: number,
  ) {
    void this.fetch_dashboard_stats(vault_id).then((result) => {
      if (!this.is_current_open_revision(open_revision)) {
        return;
      }
      if (this.get_active_vault_id() !== vault_id) {
        return;
      }
      if (result.status === "ready") {
        this.notes_store.set_dashboard_stats(result.stats);
        return;
      }
      this.notes_store.set_dashboard_stats_error(result.error);
    });
  }

  private async fetch_dashboard_stats(
    vault_id: VaultId,
  ): Promise<
    | { status: "ready"; stats: FolderStats }
    | { status: "failed"; error: string }
  > {
    try {
      const stats = await this.notes_port.get_folder_stats(vault_id, "");
      return {
        status: "ready",
        stats,
      };
    } catch (error) {
      const message = error_message(error);
      log.error("Load dashboard stats failed", { error: message, vault_id });
      return {
        status: "failed",
        error: message,
      };
    }
  }

  private subscribe_open_vault_index_progress(
    vault_id: VaultId,
    open_revision: number,
  ) {
    this.index_progress_unsubscribe = this.index_port.subscribe_index_progress(
      (event) => {
        if (!this.is_current_open_revision(open_revision)) {
          return;
        }
        if (event.vault_id === vault_id) {
          this.search_store.set_index_progress(event);
        }
      },
    );
  }

  private trigger_background_index_sync(
    vault_id: VaultId,
    open_revision: number,
  ) {
    this.index_port.sync_index(vault_id).catch((error: unknown) => {
      if (!this.is_current_open_revision(open_revision)) {
        return;
      }
      log.error("Background index sync failed", { error });
    });
  }

  private async load_editor_settings(
    vault_id: VaultId,
  ): Promise<EditorSettings> {
    const get_global = (k: string) =>
      this.settings_port.get_setting<unknown>(k);

    const stored =
      await this.vault_settings_port.get_vault_setting<EditorSettings>(
        vault_id,
        SETTINGS_KEY,
      );
    if (stored) {
      const vault_only = omit_global_only_keys(
        stored as Record<string, unknown>,
      ) as Partial<EditorSettings>;
      const merged = { ...DEFAULT_EDITOR_SETTINGS, ...vault_only };
      return apply_global_only_overrides(merged, get_global);
    }

    const legacy =
      await this.settings_port.get_setting<EditorSettings>(SETTINGS_KEY);
    if (legacy) {
      const vault_only = omit_global_only_keys(
        legacy as Record<string, unknown>,
      ) as Partial<EditorSettings>;
      const migrated = { ...DEFAULT_EDITOR_SETTINGS, ...vault_only };
      await this.vault_settings_port.set_vault_setting(
        vault_id,
        SETTINGS_KEY,
        vault_only,
      );
      return apply_global_only_overrides(migrated, get_global);
    }

    return apply_global_only_overrides(
      { ...DEFAULT_EDITOR_SETTINGS },
      get_global,
    );
  }

  async save_recent_notes(
    vault_id: VaultId,
    recent_notes: NoteMeta[],
  ): Promise<void> {
    try {
      await this.vault_settings_port.set_vault_setting(
        vault_id,
        RECENT_NOTES_KEY,
        recent_notes,
      );
    } catch (error) {
      log.error("Save recent notes failed", { error });
    }
  }

  private async load_recent_notes(vault_id: VaultId): Promise<NoteMeta[]> {
    try {
      const stored = await this.vault_settings_port.get_vault_setting<unknown>(
        vault_id,
        RECENT_NOTES_KEY,
      );
      if (!stored || !Array.isArray(stored)) {
        return [];
      }
      const parsed = stored.filter((entry): entry is NoteMeta => {
        if (!entry || typeof entry !== "object") return false;
        const record = entry as Record<string, unknown>;
        return (
          typeof record.id === "string" &&
          typeof record.path === "string" &&
          typeof record.name === "string" &&
          typeof record.title === "string" &&
          typeof record.mtime_ms === "number" &&
          typeof record.size_bytes === "number"
        );
      });
      return parsed;
    } catch (error) {
      log.error("Load recent notes failed", { error });
      return [];
    }
  }

  async save_starred_paths(
    vault_id: VaultId,
    starred_paths: string[],
  ): Promise<void> {
    try {
      await this.vault_settings_port.set_vault_setting(
        vault_id,
        STARRED_PATHS_KEY,
        starred_paths,
      );
    } catch (error) {
      log.error("Save starred paths failed", { error });
    }
  }

  private async load_starred_paths(vault_id: VaultId): Promise<string[]> {
    try {
      const stored = await this.vault_settings_port.get_vault_setting<unknown>(
        vault_id,
        STARRED_PATHS_KEY,
      );
      if (!stored || !Array.isArray(stored)) {
        return [];
      }
      return stored.filter(
        (entry): entry is string => typeof entry === "string",
      );
    } catch (error) {
      log.error("Load starred paths failed", { error });
      return [];
    }
  }

  private async save_pinned_vault_ids(vault_ids: VaultId[]): Promise<void> {
    await this.settings_port.set_setting(PINNED_VAULT_IDS_KEY, vault_ids);
  }

  private async load_pinned_vault_ids(): Promise<VaultId[]> {
    try {
      const stored =
        await this.settings_port.get_setting<unknown>(PINNED_VAULT_IDS_KEY);
      if (!stored || !Array.isArray(stored)) {
        return [];
      }
      return stored
        .filter((entry): entry is string => typeof entry === "string")
        .map((vault_id) => as_vault_id(vault_id));
    } catch (error) {
      log.error("Load pinned vault IDs failed", { error });
      return [];
    }
  }

  private reset_app_state() {
    this.vault_store.reset();
    this.notes_store.reset();
    this.editor_store.reset();
    this.op_store.reset_all();
  }

  reset_change_operation() {
    this.op_store.reset("vault.change");
  }

  private async begin_open_revision(): Promise<number> {
    const current_vault_id = this.get_active_vault_id();
    this.active_open_revision += 1;
    const revision = this.active_open_revision;
    this.clear_open_runtime_subscriptions();
    if (current_vault_id) {
      try {
        await this.index_port.cancel_index(current_vault_id);
      } catch (error) {
        log.error("Cancel index failed", { error });
      }
    }
    return revision;
  }

  private clear_open_runtime_subscriptions(): void {
    this.index_progress_unsubscribe?.();
    this.index_progress_unsubscribe = null;
  }

  private is_current_open_revision(revision: number): boolean {
    return revision === this.active_open_revision;
  }

  private throw_if_stale(revision: number): void {
    if (!this.is_current_open_revision(revision)) {
      throw new StaleVaultOpenError();
    }
  }
}

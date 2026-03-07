import type { NotesPort, NotesStore } from "$lib/features/note";
import type { WorkspaceIndexPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { OpStore } from "$lib/app";
import type { TabStore } from "$lib/features/tab";
import type {
  FolderDeleteStatsResult,
  FolderLoadResult,
  FolderMoveResult,
  FolderMutationResult,
} from "$lib/features/folder/types/folder_service_result";
import type { MoveItem } from "$lib/shared/types/filetree";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";
import { error_message } from "$lib/shared/utils/error_message";
import { ensure_open_note } from "$lib/features/note";
import { create_logger } from "$lib/shared/utils/logger";
import { move_destination_path } from "$lib/features/folder/domain/filetree";
import { as_note_path, type VaultId } from "$lib/shared/types/ids";
import {
  run_link_repair_operation,
  type LinkRepairService,
} from "$lib/features/links";

const log = create_logger("folder_service");
type MoveItemResult = Awaited<ReturnType<NotesPort["move_items"]>>[number];

export class FolderService {
  constructor(
    private readonly notes_port: NotesPort,
    private readonly index_port: WorkspaceIndexPort,
    private readonly vault_store: VaultStore,
    private readonly notes_store: NotesStore,
    private readonly editor_store: EditorStore,
    private readonly tab_store: TabStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
    private readonly link_repair: LinkRepairService | null = null,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private is_stale_generation(expected_generation: number): boolean {
    return expected_generation !== this.vault_store.generation;
  }

  private start_operation(operation_key: string): void {
    this.op_store.start(operation_key, this.now_ms());
  }

  private succeed_operation(operation_key: string): void {
    this.op_store.succeed(operation_key);
  }

  private fail_operation(
    operation_key: string,
    log_message: string,
    error: unknown,
    details?: Record<string, unknown>,
  ): string {
    const message = error_message(error);
    log.error(
      log_message,
      details ? { ...details, error: message } : { error: message },
    );
    this.op_store.fail(operation_key, message);
    return message;
  }

  private async run_link_repair(
    vault_id: VaultId,
    path_map: Map<string, string>,
  ): Promise<void> {
    await run_link_repair_operation({
      link_repair: this.link_repair,
      vault_id,
      path_map,
      on_start: (message) => {
        this.start_operation("links.repair");
        this.op_store.set_pending_message("links.repair", message);
      },
      on_progress: (message) => {
        this.op_store.set_pending_message("links.repair", message);
      },
      on_success: (message) => {
        this.op_store.succeed("links.repair", message);
      },
      on_failed: (message) => {
        this.op_store.fail("links.repair", message);
      },
      on_error: (error) =>
        this.fail_operation("links.repair", "Link repair failed", error),
    });
  }

  private build_note_path_map_for_prefix_move(
    old_prefix: string,
    new_prefix: string,
    note_paths: string[],
  ): Map<string, string> {
    const path_map = new Map<string, string>();
    for (const note_path of note_paths) {
      if (!note_path.startsWith(old_prefix)) {
        continue;
      }
      path_map.set(
        note_path,
        `${new_prefix}${note_path.slice(old_prefix.length)}`,
      );
    }
    return path_map;
  }

  private build_move_path_map(
    results: MoveItemResult[],
    items_by_path: Map<string, MoveItem>,
  ): Map<string, string> {
    const path_map = new Map<string, string>();

    for (const result of results) {
      if (!result.success) {
        continue;
      }

      const moved_item = items_by_path.get(result.path);
      if (!moved_item) {
        continue;
      }

      if (!moved_item.is_folder) {
        path_map.set(result.path, result.new_path);
        continue;
      }

      const folder_path_map = this.build_note_path_map_for_prefix_move(
        `${result.path}/`,
        `${result.new_path}/`,
        this.notes_store.notes.map((note) => note.path),
      );
      for (const [old_note_path, new_note_path] of folder_path_map) {
        path_map.set(old_note_path, new_note_path);
      }
    }

    return path_map;
  }

  private async apply_move_result(
    vault_id: VaultId,
    item: MoveItem,
    result: MoveItemResult,
  ): Promise<void> {
    if (item.is_folder) {
      this.apply_folder_rename(result.path, result.new_path);
      this.tab_store.update_tab_path_prefix(
        `${result.path}/`,
        `${result.new_path}/`,
      );
      await this.index_port.rename_folder_paths(
        vault_id,
        `${result.path}/`,
        `${result.new_path}/`,
      );
      return;
    }

    const old_note_path = as_note_path(result.path);
    const new_note_path = as_note_path(result.new_path);
    this.notes_store.rename_note(old_note_path, new_note_path);

    if (this.editor_store.open_note?.meta.id === old_note_path) {
      this.editor_store.update_open_note_path(new_note_path);
    }

    const renamed_note = this.notes_store.notes.find(
      (note) => note.path === new_note_path,
    );
    if (renamed_note) {
      this.notes_store.rename_recent_note(old_note_path, renamed_note);
    }

    this.tab_store.update_tab_path(old_note_path, new_note_path);
    await this.index_port.rename_note_path(
      vault_id,
      old_note_path,
      new_note_path,
    );
  }

  private async load_folder_slice(
    path: string,
    offset: number,
    expected_generation: number,
    apply_contents: (
      path: string,
      contents: Awaited<ReturnType<NotesPort["list_folder_contents"]>>,
    ) => void,
  ): Promise<FolderLoadResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    if (this.is_stale_generation(expected_generation)) {
      return { status: "stale" };
    }

    try {
      const contents = await this.notes_port.list_folder_contents(
        vault_id,
        path,
        offset,
        PAGE_SIZE,
      );

      if (this.is_stale_generation(expected_generation)) {
        return { status: "stale" };
      }

      apply_contents(path, contents);
      return {
        status: "loaded",
        total_count: contents.total_count,
        has_more: contents.has_more,
      };
    } catch (error) {
      if (this.is_stale_generation(expected_generation)) {
        return { status: "stale" };
      }

      const message = error_message(error);
      log.error("Load folder contents failed", {
        path,
        error: message,
        offset,
      });
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async create_folder(
    parent_path: string,
    folder_name: string,
  ): Promise<FolderMutationResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    const trimmed_name = folder_name.trim();
    if (!trimmed_name) {
      return { status: "skipped" };
    }

    this.start_operation("folder.create");

    try {
      await this.notes_port.create_folder(vault_id, parent_path, trimmed_name);
      const new_folder_path = parent_path
        ? `${parent_path}/${trimmed_name}`
        : trimmed_name;
      this.notes_store.add_folder_path(new_folder_path);
      this.succeed_operation("folder.create");
      return { status: "success" };
    } catch (error) {
      const message = this.fail_operation(
        "folder.create",
        "Create folder failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async load_delete_stats(
    folder_path: string,
  ): Promise<FolderDeleteStatsResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    this.start_operation("folder.delete_stats");

    try {
      const stats = await this.notes_port.get_folder_stats(
        vault_id,
        folder_path,
      );
      this.succeed_operation("folder.delete_stats");
      return {
        status: "ready",
        affected_note_count: stats.note_count,
        affected_folder_count: stats.folder_count,
      };
    } catch (error) {
      const message = this.fail_operation(
        "folder.delete_stats",
        "Load folder delete stats failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async delete_folder(folder_path: string): Promise<FolderMutationResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id || !folder_path) {
      return { status: "skipped" };
    }

    this.start_operation("folder.delete");

    try {
      const folder_prefix = `${folder_path}/`;
      const contains_open_note =
        this.editor_store.open_note?.meta.path.startsWith(folder_prefix) ??
        false;

      await this.notes_port.delete_folder(vault_id, folder_path);
      await this.index_port.remove_notes_by_prefix(vault_id, folder_prefix);

      this.notes_store.remove_folder(folder_path);
      this.notes_store.remove_recent_notes_by_prefix(folder_prefix);

      const open_titles = this.tab_store.tabs.map((tab) => tab.title);
      const ensured = ensure_open_note({
        vault: this.vault_store.vault,
        open_titles,
        open_note: contains_open_note ? null : this.editor_store.open_note,
        now_ms: this.now_ms(),
      });

      if (ensured) {
        this.editor_store.set_open_note(ensured);
      } else {
        this.editor_store.clear_open_note();
      }

      this.succeed_operation("folder.delete");
      return { status: "success" };
    } catch (error) {
      const message = this.fail_operation(
        "folder.delete",
        "Delete folder failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async rename_folder(
    folder_path: string,
    new_path: string,
  ): Promise<FolderMutationResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id || !folder_path || !new_path) {
      return { status: "skipped" };
    }

    this.start_operation("folder.rename");

    try {
      const path_map = this.build_note_path_map_for_prefix_move(
        `${folder_path}/`,
        `${new_path}/`,
        await this.index_port.list_note_paths_by_prefix(
          vault_id,
          `${folder_path}/`,
        ),
      );

      await this.notes_port.rename_folder(vault_id, folder_path, new_path);

      await this.run_link_repair(vault_id, path_map);

      this.succeed_operation("folder.rename");
      return { status: "success" };
    } catch (error) {
      const message = this.fail_operation(
        "folder.rename",
        "Rename folder failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async move_items(
    items: MoveItem[],
    target_folder: string,
    overwrite: boolean,
  ): Promise<FolderMoveResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id || items.length === 0) {
      return { status: "skipped" };
    }

    this.start_operation("folder.move");

    try {
      const results = await this.notes_port.move_items(
        vault_id,
        items,
        target_folder,
        overwrite,
      );

      const items_by_path = new Map(
        items.map((item) => [item.path, item] as const),
      );
      const path_map = this.build_move_path_map(results, items_by_path);

      await this.run_link_repair(vault_id, path_map);

      for (const result of results) {
        if (!result.success) {
          continue;
        }
        const item = items_by_path.get(result.path);
        if (!item) {
          continue;
        }
        await this.apply_move_result(vault_id, item, result);
      }

      this.succeed_operation("folder.move");
      return { status: "success", results };
    } catch (error) {
      const message = this.fail_operation(
        "folder.move",
        "Move items failed",
        error,
        { target_folder },
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  apply_folder_rename(folder_path: string, new_path: string): void {
    this.notes_store.rename_folder(folder_path, new_path);
    this.editor_store.update_open_note_path_prefix(
      `${folder_path}/`,
      `${new_path}/`,
    );
    this.notes_store.update_recent_note_path_prefix(
      `${folder_path}/`,
      `${new_path}/`,
    );
  }

  async load_folder(
    path: string,
    expected_generation: number,
  ): Promise<FolderLoadResult> {
    return this.load_folder_slice(
      path,
      0,
      expected_generation,
      (folder_path, contents) => {
        this.notes_store.merge_folder_contents(folder_path, contents);
      },
    );
  }

  async load_folder_page(
    path: string,
    offset: number,
    expected_generation: number,
  ): Promise<FolderLoadResult> {
    return this.load_folder_slice(
      path,
      offset,
      expected_generation,
      (folder_path, contents) => {
        this.notes_store.append_folder_page(folder_path, contents);
      },
    );
  }

  reset_create_operation() {
    this.op_store.reset("folder.create");
  }

  reset_delete_stats_operation() {
    this.op_store.reset("folder.delete_stats");
  }

  reset_delete_operation() {
    this.op_store.reset("folder.delete");
  }

  reset_rename_operation() {
    this.op_store.reset("folder.rename");
  }

  async remove_notes_by_prefix(folder_prefix: string): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;
    await this.index_port.remove_notes_by_prefix(vault_id, folder_prefix);
  }

  async rename_folder_index(
    old_prefix: string,
    new_prefix: string,
  ): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;
    await this.index_port.rename_folder_paths(vault_id, old_prefix, new_prefix);
  }

  build_move_preview(items: MoveItem[], target_folder: string) {
    return items.map((item) => ({
      ...item,
      new_path: move_destination_path(item.path, target_folder),
    }));
  }
}

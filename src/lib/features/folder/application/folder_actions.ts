import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  clear_filetree_scope_if_removed,
  clear_folder_filetree_state,
  load_folder,
  remove_expanded_paths,
  remap_expanded_paths,
  remap_path,
  remap_ui_paths_after_move,
  set_pagination,
  transform_filetree_paths,
} from "$lib/features/folder/application/filetree_action_helpers";
import {
  ancestor_folder_paths,
  build_folder_path_from_name,
  close_create_dialog,
  close_delete_dialog,
  close_rename_dialog,
  folder_name_from_path,
  is_valid_folder_name,
  parse_reveal_note_path,
} from "$lib/features/folder/application/folder_action_helpers";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";
import type {
  FolderLoadState,
  FolderPaginationState,
  MoveItem,
} from "$lib/shared/types/filetree";
import { create_logger } from "$lib/shared/utils/logger";
import { parent_folder_path } from "$lib/shared/utils/path";
import { get_invalid_drop_reason } from "$lib/features/folder/domain/filetree";

const log = create_logger("folder_actions");

type FileTreeSelectionPayload = {
  path: string;
  ordered_paths: string[];
  shift_key: boolean;
  additive_key: boolean;
};

type MoveItemsPayload = {
  items: MoveItem[];
  target_folder: string;
  overwrite: boolean;
};

type ToggleStarSelectionPayload = {
  paths: string[];
  all_starred: boolean;
};

function parse_filetree_selection_payload(
  payload: unknown,
): FileTreeSelectionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const path = typeof record.path === "string" ? record.path : "";
  if (!path) {
    return null;
  }
  const ordered_paths = Array.isArray(record.ordered_paths)
    ? record.ordered_paths.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  return {
    path,
    ordered_paths,
    shift_key: Boolean(record.shift_key),
    additive_key: Boolean(record.additive_key),
  };
}

function parse_move_items_payload(payload: unknown): MoveItemsPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const raw_items = Array.isArray(record.items) ? record.items : [];
  const items: MoveItem[] = raw_items
    .filter(
      (entry): entry is { path: string; is_folder: boolean } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        "path" in entry &&
        "is_folder" in entry,
    )
    .map((entry) => ({
      path: entry.path,
      is_folder: entry.is_folder,
    }));
  if (items.length === 0) {
    return null;
  }
  return {
    items,
    target_folder:
      typeof record.target_folder === "string" ? record.target_folder : "",
    overwrite: Boolean(record.overwrite),
  };
}

function parse_toggle_star_selection_payload(
  payload: unknown,
): ToggleStarSelectionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const paths = Array.isArray(record.paths)
    ? record.paths.filter((path): path is string => typeof path === "string")
    : [];
  if (paths.length === 0) {
    return null;
  }
  return {
    paths,
    all_starred: Boolean(record.all_starred),
  };
}

export function register_folder_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const loading_more = new Set<string>();

  function close_move_conflict_dialog() {
    stores.ui.filetree_move_conflict_dialog = {
      open: false,
      target_folder: "",
      items: [],
      conflicts: [],
    };
  }

  async function execute_move_items(
    items: MoveItem[],
    target_folder: string,
    overwrite: boolean,
  ) {
    const invalid_reason = get_invalid_drop_reason(items, target_folder);
    if (invalid_reason) {
      log.warn("Invalid drop target", { target_folder, invalid_reason });
      return;
    }

    const moving_paths = new Set(items.map((item) => item.path.toLowerCase()));
    const conflict_entries = services.folder
      .build_move_preview(items, target_folder)
      .filter((item) => {
        if (moving_paths.has(item.new_path.toLowerCase())) {
          return false;
        }
        if (item.is_folder) {
          return stores.notes.folder_paths.some(
            (folder_path) =>
              folder_path.toLowerCase() === item.new_path.toLowerCase(),
          );
        }
        return stores.notes.notes.some(
          (note) => note.path.toLowerCase() === item.new_path.toLowerCase(),
        );
      })
      .map((item) => ({
        path: item.path,
        new_path: item.new_path,
        error: "target already exists",
      }));

    if (conflict_entries.length > 0 && !overwrite) {
      stores.ui.filetree_move_conflict_dialog = {
        open: true,
        target_folder,
        items,
        conflicts: conflict_entries,
      };
      return;
    }

    const result = await services.folder.move_items(
      items,
      target_folder,
      overwrite,
    );
    if (result.status !== "success") {
      return;
    }

    stores.vault.bump_generation();
    close_move_conflict_dialog();

    for (const move_result of result.results) {
      const item = items.find((entry) => entry.path === move_result.path);
      if (!item || !move_result.success) {
        continue;
      }

      remap_ui_paths_after_move(
        input,
        move_result.path,
        move_result.new_path,
        item.is_folder,
      );

      if (item.is_folder) {
        clear_folder_filetree_state(input, move_result.path);
        clear_folder_filetree_state(input, move_result.new_path);
      }
      clear_folder_filetree_state(input, parent_folder_path(move_result.path));
      clear_folder_filetree_state(
        input,
        parent_folder_path(move_result.new_path),
      );
    }

    stores.ui.clear_selected_items();
  }

  async function load_delete_stats_for_dialog(folder_path: string) {
    const result = await services.folder.load_delete_stats(folder_path);

    if (result.status === "ready") {
      stores.ui.delete_folder_dialog = {
        ...stores.ui.delete_folder_dialog,
        status: "confirming",
        affected_note_count: result.affected_note_count,
        affected_folder_count: result.affected_folder_count,
      };
      return;
    }

    if (result.status === "failed") {
      stores.ui.delete_folder_dialog = {
        ...stores.ui.delete_folder_dialog,
        status: "error",
      };
      return;
    }

    close_delete_dialog(input);
  }

  async function execute_delete_folder() {
    const folder_path = stores.ui.delete_folder_dialog.folder_path;
    if (!folder_path) {
      return;
    }

    const result = await services.folder.delete_folder(folder_path);
    if (result.status !== "success") {
      return;
    }

    close_delete_dialog(input);
    const parent_path = parent_folder_path(folder_path);
    clear_filetree_scope_if_removed(input, folder_path);
    remove_expanded_paths(input, folder_path);
    clear_folder_filetree_state(input, parent_path);

    const folder_prefix = `${folder_path}/`;
    void services.folder
      .remove_notes_by_prefix(folder_prefix)
      .catch((err: unknown) => {
        log.error("Background index cleanup failed", {
          folder_path,
          error: err,
        });
      });
  }

  function execute_rename_folder() {
    const folder_path = stores.ui.rename_folder_dialog.folder_path;
    const new_name = stores.ui.rename_folder_dialog.new_name.trim();
    if (!folder_path || !is_valid_folder_name(new_name)) {
      return;
    }
    if (stores.op.is_pending("folder.rename")) {
      return;
    }

    const parent = parent_folder_path(folder_path);
    const new_path = build_folder_path_from_name(parent, new_name);

    close_rename_dialog(input);
    void handle_folder_rename_async(folder_path, new_name, new_path, parent);
  }

  async function handle_folder_rename_async(
    folder_path: string,
    new_name: string,
    new_path: string,
    parent: string,
  ) {
    try {
      const result = await services.folder.rename_folder(folder_path, new_path);
      if (result.status !== "success") {
        stores.ui.rename_folder_dialog = {
          open: true,
          folder_path,
          new_name,
        };
        return;
      }

      stores.vault.bump_generation();
      services.folder.apply_folder_rename(folder_path, new_path);
      remap_expanded_paths(input, folder_path, new_path);
      if (stores.ui.filetree_scoped_root_path) {
        stores.ui.filetree_scoped_root_path = remap_path(
          stores.ui.filetree_scoped_root_path,
          folder_path,
          new_path,
        );
      }

      clear_folder_filetree_state(input, folder_path);
      clear_folder_filetree_state(input, new_path);
      clear_folder_filetree_state(input, parent);
      const new_parent = parent_folder_path(new_path);
      if (new_parent !== parent) {
        clear_folder_filetree_state(input, new_parent);
      }

      const old_prefix = `${folder_path}/`;
      const new_prefix = `${new_path}/`;
      stores.tab.update_tab_path_prefix(old_prefix, new_prefix);
      void services.folder
        .rename_folder_index(old_prefix, new_prefix)
        .catch((err: unknown) => {
          log.error("Background index rename failed", {
            folder_path,
            error: err,
          });
        });
    } catch (err) {
      log.error("Unexpected rename flow failure", { folder_path, error: err });
    }
  }

  function register_create_actions() {
    registry.register({
      id: ACTION_IDS.folder_request_create,
      label: "Request Create Folder",
      execute: (parent_path: unknown) => {
        stores.ui.create_folder_dialog = {
          open: true,
          parent_path: String(parent_path),
          folder_name: "",
        };
        services.folder.reset_create_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.folder_update_create_name,
      label: "Update Create Folder Name",
      execute: (name: unknown) => {
        stores.ui.create_folder_dialog.folder_name = String(name);
      },
    });

    registry.register({
      id: ACTION_IDS.folder_confirm_create,
      label: "Confirm Create Folder",
      execute: async () => {
        const { parent_path, folder_name } = stores.ui.create_folder_dialog;
        const result = await services.folder.create_folder(
          parent_path,
          folder_name,
        );
        if (result.status === "success") {
          clear_folder_filetree_state(input, parent_path);
          close_create_dialog(input);
        }
      },
    });

    registry.register({
      id: ACTION_IDS.folder_cancel_create,
      label: "Cancel Create Folder",
      execute: () => {
        close_create_dialog(input);
        services.folder.reset_create_operation();
      },
    });
  }

  function register_selection_actions() {
    registry.register({
      id: ACTION_IDS.filetree_select_item,
      label: "Select File Tree Item",
      execute: (payload: unknown) => {
        const parsed = parse_filetree_selection_payload(payload);
        if (!parsed) {
          return;
        }
        if (parsed.shift_key) {
          stores.ui.select_item_range(parsed.ordered_paths, parsed.path);
          return;
        }
        if (parsed.additive_key) {
          stores.ui.toggle_selected_item(parsed.path);
          return;
        }
        stores.ui.set_single_selected_item(parsed.path);
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_clear_selection,
      label: "Clear File Tree Selection",
      execute: () => {
        stores.ui.clear_selected_items();
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_scope_to_folder,
      label: "Scope File Tree To Folder",
      execute: (folder_path: unknown) => {
        const path = String(folder_path).trim();
        if (!path) {
          return;
        }
        stores.ui.set_filetree_scoped_root_path(path);
        stores.ui.set_sidebar_view("explorer");
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_clear_scope,
      label: "Clear File Tree Scope",
      execute: () => {
        stores.ui.clear_filetree_scope();
      },
    });
  }

  function register_move_actions() {
    registry.register({
      id: ACTION_IDS.filetree_move_items,
      label: "Move File Tree Items",
      execute: async (payload: unknown) => {
        const parsed = parse_move_items_payload(payload);
        if (!parsed) {
          return;
        }
        await execute_move_items(
          parsed.items,
          parsed.target_folder,
          parsed.overwrite,
        );
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_confirm_move_overwrite,
      label: "Confirm File Tree Move Overwrite",
      execute: async () => {
        const dialog = stores.ui.filetree_move_conflict_dialog;
        if (!dialog.open) {
          return;
        }
        await execute_move_items(dialog.items, dialog.target_folder, true);
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_skip_move_conflicts,
      label: "Skip File Tree Move Conflicts",
      execute: async () => {
        const dialog = stores.ui.filetree_move_conflict_dialog;
        if (!dialog.open) {
          return;
        }
        const blocked = new Set(
          dialog.conflicts.map((entry) => entry.path.toLowerCase()),
        );
        const items = dialog.items.filter(
          (entry) => !blocked.has(entry.path.toLowerCase()),
        );
        if (items.length === 0) {
          close_move_conflict_dialog();
          return;
        }
        await execute_move_items(items, dialog.target_folder, false);
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_cancel_move_conflicts,
      label: "Cancel File Tree Move Conflicts",
      execute: () => {
        close_move_conflict_dialog();
      },
    });
  }

  function register_navigation_actions() {
    registry.register({
      id: ACTION_IDS.folder_toggle,
      label: "Toggle Folder",
      execute: async (path: unknown) => {
        const folder_path = String(path);
        const expanded_paths = new SvelteSet(stores.ui.filetree.expanded_paths);

        if (expanded_paths.has(folder_path)) {
          expanded_paths.delete(folder_path);
          stores.ui.filetree = {
            ...stores.ui.filetree,
            expanded_paths,
          };
          return;
        }

        expanded_paths.add(folder_path);
        stores.ui.filetree = {
          ...stores.ui.filetree,
          expanded_paths,
        };

        await load_folder(input, folder_path);
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_reveal_note,
      label: "Reveal Note In File Tree",
      execute: (note_input: unknown) => {
        const note_path = parse_reveal_note_path(note_input).trim();
        if (!note_path) {
          return;
        }

        const expanded_paths = new SvelteSet(stores.ui.filetree.expanded_paths);
        for (const folder_path of ancestor_folder_paths(note_path)) {
          expanded_paths.add(folder_path);
        }

        stores.ui.filetree = {
          ...stores.ui.filetree,
          expanded_paths,
        };

        const folder = parent_folder_path(note_path);
        stores.ui.set_selected_folder_path(folder);
        stores.ui.set_filetree_revealed_note_path(note_path);
        stores.ui.set_sidebar_view("explorer");
      },
    });

    registry.register({
      id: ACTION_IDS.folder_load_more,
      label: "Load More Folder Contents",
      execute: async (path: unknown) => {
        const folder_path = String(path);
        if (loading_more.has(folder_path)) {
          return;
        }

        const pagination = stores.ui.filetree.pagination.get(folder_path);
        if (!pagination || pagination.loaded_count >= pagination.total_count) {
          return;
        }

        set_pagination(input, folder_path, {
          ...pagination,
          load_state: "loading",
          error_message: null,
        });

        loading_more.add(folder_path);
        try {
          const generation = stores.vault.generation;
          const result = await services.folder.load_folder_page(
            folder_path,
            pagination.loaded_count,
            generation,
          );
          if (result.status === "loaded") {
            set_pagination(input, folder_path, {
              loaded_count: Math.min(
                pagination.loaded_count + PAGE_SIZE,
                result.total_count,
              ),
              total_count: result.total_count,
              load_state: "idle",
              error_message: null,
            });
          } else if (result.status === "failed") {
            set_pagination(input, folder_path, {
              ...pagination,
              load_state: "error",
              error_message: result.error,
            });
          } else {
            set_pagination(input, folder_path, {
              ...pagination,
              load_state: "idle",
              error_message: null,
            });
          }
        } finally {
          loading_more.delete(folder_path);
        }
      },
    });

    registry.register({
      id: ACTION_IDS.folder_retry_load,
      label: "Retry Folder Load",
      execute: async (path: unknown) => {
        await load_folder(input, String(path));
      },
    });

    registry.register({
      id: ACTION_IDS.folder_collapse_all,
      label: "Collapse All Folders",
      execute: () => {
        stores.ui.filetree = {
          ...stores.ui.filetree,
          expanded_paths: new SvelteSet<string>(),
        };
      },
    });

    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh File Tree",
      execute: async () => {
        stores.vault.bump_generation();

        const current_filetree = stores.ui.filetree;
        const loaded_paths = new Set<string>([""]);
        for (const [path, state] of current_filetree.load_states) {
          if (state === "loaded" || state === "error") {
            loaded_paths.add(path);
          }
        }

        stores.ui.filetree = {
          expanded_paths: new SvelteSet(current_filetree.expanded_paths),
          load_states: new SvelteMap<string, FolderLoadState>(),
          error_messages: new SvelteMap<string, string>(),
          pagination: new SvelteMap<string, FolderPaginationState>(),
        };

        stores.notes.reset_notes_and_folders();

        await load_folder(input, "");
        const non_root = Array.from(loaded_paths).filter((path) => path !== "");
        await Promise.all(non_root.map((path) => load_folder(input, path)));

        const fresh_folder_paths = new Set(stores.notes.folder_paths);
        transform_filetree_paths(input, (path) =>
          path === "" || fresh_folder_paths.has(path) ? path : null,
        );
      },
    });
  }

  function register_delete_actions() {
    registry.register({
      id: ACTION_IDS.folder_request_delete,
      label: "Request Delete Folder",
      execute: async (folder_path: unknown) => {
        const normalized_path = String(folder_path);

        stores.ui.delete_folder_dialog = {
          open: true,
          folder_path: normalized_path,
          affected_note_count: 0,
          affected_folder_count: 0,
          status: "fetching_stats",
        };

        services.folder.reset_delete_operation();
        services.folder.reset_delete_stats_operation();
        await load_delete_stats_for_dialog(normalized_path);
      },
    });

    registry.register({
      id: ACTION_IDS.folder_confirm_delete,
      label: "Confirm Delete Folder",
      execute: execute_delete_folder,
    });

    registry.register({
      id: ACTION_IDS.folder_cancel_delete,
      label: "Cancel Delete Folder",
      execute: () => {
        close_delete_dialog(input);
        services.folder.reset_delete_operation();
        services.folder.reset_delete_stats_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.folder_retry_delete,
      label: "Retry Delete Folder",
      execute: async () => {
        if (stores.ui.delete_folder_dialog.status === "error") {
          const folder_path = stores.ui.delete_folder_dialog.folder_path;
          if (!folder_path) {
            return;
          }

          stores.ui.delete_folder_dialog = {
            ...stores.ui.delete_folder_dialog,
            status: "fetching_stats",
          };
          services.folder.reset_delete_stats_operation();
          await load_delete_stats_for_dialog(folder_path);
          return;
        }
        await execute_delete_folder();
      },
    });
  }

  function register_rename_actions() {
    registry.register({
      id: ACTION_IDS.folder_request_rename,
      label: "Request Rename Folder",
      execute: (folder_path: unknown) => {
        const path = String(folder_path);
        stores.ui.rename_folder_dialog = {
          open: true,
          folder_path: path,
          new_name: folder_name_from_path(path),
        };
        services.folder.reset_rename_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.folder_update_rename_name,
      label: "Update Rename Folder Name",
      execute: (name: unknown) => {
        stores.ui.rename_folder_dialog.new_name = String(name);
      },
    });

    registry.register({
      id: ACTION_IDS.folder_confirm_rename,
      label: "Confirm Rename Folder",
      execute: execute_rename_folder,
    });

    registry.register({
      id: ACTION_IDS.folder_cancel_rename,
      label: "Cancel Rename Folder",
      execute: () => {
        close_rename_dialog(input);
        services.folder.reset_rename_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.folder_retry_rename,
      label: "Retry Rename Folder",
      execute: execute_rename_folder,
    });
  }

  function register_star_actions() {
    registry.register({
      id: ACTION_IDS.folder_toggle_star,
      label: "Toggle Star",
      execute: (folder_path: unknown) => {
        const path = String(folder_path);
        if (!path) {
          return;
        }
        stores.notes.toggle_star_path(path);
      },
    });

    registry.register({
      id: ACTION_IDS.filetree_toggle_star_selection,
      label: "Toggle Star (Selection)",
      execute: (payload: unknown) => {
        const parsed = parse_toggle_star_selection_payload(payload);
        if (!parsed) {
          return;
        }

        for (const path of parsed.paths) {
          const is_currently_starred = stores.notes.is_starred_path(path);
          if (parsed.all_starred && is_currently_starred) {
            stores.notes.toggle_star_path(path);
          } else if (!parsed.all_starred && !is_currently_starred) {
            stores.notes.toggle_star_path(path);
          }
        }
      },
    });
  }

  register_create_actions();
  register_selection_actions();
  register_move_actions();
  register_navigation_actions();
  register_delete_actions();
  register_rename_actions();
  register_star_actions();
}

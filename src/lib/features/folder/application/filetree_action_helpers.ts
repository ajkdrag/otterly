import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  FolderLoadState,
  FolderPaginationState,
} from "$lib/shared/types/filetree";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";

type FiletreeState = ActionRegistrationInput["stores"]["ui"]["filetree"];

function clone_filetree(ft: FiletreeState): {
  expanded_paths: SvelteSet<string>;
  load_states: SvelteMap<string, FolderLoadState>;
  error_messages: SvelteMap<string, string>;
  pagination: SvelteMap<string, FolderPaginationState>;
} {
  return {
    expanded_paths: new SvelteSet(ft.expanded_paths),
    load_states: new SvelteMap(ft.load_states),
    error_messages: new SvelteMap(ft.error_messages),
    pagination: new SvelteMap(ft.pagination),
  };
}

export function clear_folder_filetree_state(
  input: ActionRegistrationInput,
  folder_path: string,
) {
  const cloned = clone_filetree(input.stores.ui.filetree);
  cloned.load_states.delete(folder_path);
  cloned.error_messages.delete(folder_path);
  cloned.pagination.delete(folder_path);
  input.stores.ui.filetree = cloned;
}

export function should_load_folder(
  state: FolderLoadState | undefined,
): boolean {
  return !state || state === "unloaded" || state === "error";
}

export function set_load_state(
  input: ActionRegistrationInput,
  path: string,
  state: FolderLoadState,
  error: string | null,
) {
  const load_states = new SvelteMap(input.stores.ui.filetree.load_states);
  load_states.set(path, state);

  const error_messages = new SvelteMap(input.stores.ui.filetree.error_messages);
  if (error) {
    error_messages.set(path, error);
  } else {
    error_messages.delete(path);
  }

  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    load_states,
    error_messages,
  };
}

export function set_pagination(
  input: ActionRegistrationInput,
  path: string,
  state: FolderPaginationState,
) {
  const pagination = new SvelteMap(input.stores.ui.filetree.pagination);
  pagination.set(path, state);
  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    pagination,
  };
}

export function clear_folder_pagination(
  input: ActionRegistrationInput,
  path: string,
) {
  const pagination = new SvelteMap(input.stores.ui.filetree.pagination);
  pagination.delete(path);
  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    pagination,
  };
}

export function transform_filetree_paths(
  input: ActionRegistrationInput,
  transform: (path: string) => string | null,
) {
  const filetree = input.stores.ui.filetree;

  const expanded_paths = new SvelteSet<string>();
  for (const path of filetree.expanded_paths) {
    const result = transform(path);
    if (result !== null) {
      expanded_paths.add(result);
    }
  }

  const load_states = new SvelteMap<string, FolderLoadState>();
  for (const [path, state] of filetree.load_states) {
    const result = transform(path);
    if (result !== null) {
      load_states.set(result, state);
    }
  }

  const error_messages = new SvelteMap<string, string>();
  for (const [path, message] of filetree.error_messages) {
    const result = transform(path);
    if (result !== null) {
      error_messages.set(result, message);
    }
  }

  const pagination = new SvelteMap<string, FolderPaginationState>();
  for (const [path, state] of filetree.pagination) {
    const result = transform(path);
    if (result !== null) {
      pagination.set(result, state);
    }
  }

  input.stores.ui.filetree = {
    expanded_paths,
    load_states,
    error_messages,
    pagination,
  };
}

export function remove_expanded_paths(
  input: ActionRegistrationInput,
  folder_path: string,
) {
  const prefix = `${folder_path}/`;
  transform_filetree_paths(input, (path) =>
    path === folder_path || path.startsWith(prefix) ? null : path,
  );
}

export function remap_path(
  path: string,
  old_path: string,
  new_path: string,
): string {
  if (path === old_path) {
    return new_path;
  }

  const old_prefix = `${old_path}/`;
  if (path.startsWith(old_prefix)) {
    return `${new_path}/${path.slice(old_prefix.length)}`;
  }

  return path;
}

export function remap_expanded_paths(
  input: ActionRegistrationInput,
  old_path: string,
  new_path: string,
) {
  transform_filetree_paths(input, (path) =>
    remap_path(path, old_path, new_path),
  );
}

export function remap_ui_paths_after_move(
  input: ActionRegistrationInput,
  old_path: string,
  new_path: string,
  is_folder: boolean,
) {
  const scoped_root_path = input.stores.ui.filetree_scoped_root_path;
  if (scoped_root_path) {
    input.stores.ui.filetree_scoped_root_path = remap_path(
      scoped_root_path,
      old_path,
      new_path,
    );
  }

  if (is_folder) {
    input.stores.ui.selected_folder_path = remap_path(
      input.stores.ui.selected_folder_path,
      old_path,
      new_path,
    );
    input.stores.ui.filetree_revealed_note_path = remap_path(
      input.stores.ui.filetree_revealed_note_path,
      old_path,
      new_path,
    );
    remap_expanded_paths(input, old_path, new_path);
    return;
  }

  if (input.stores.ui.filetree_revealed_note_path === old_path) {
    input.stores.ui.filetree_revealed_note_path = new_path;
  }
}

export function clear_filetree_scope_if_removed(
  input: ActionRegistrationInput,
  removed_path: string,
) {
  const scoped_root_path = input.stores.ui.filetree_scoped_root_path;
  if (!scoped_root_path) {
    return;
  }
  if (
    scoped_root_path === removed_path ||
    scoped_root_path.startsWith(`${removed_path}/`)
  ) {
    input.stores.ui.filetree_scoped_root_path = null;
  }
}

export async function load_folder(
  input: ActionRegistrationInput,
  path: string,
): Promise<void> {
  const current_state = input.stores.ui.filetree.load_states.get(path);
  if (!should_load_folder(current_state)) {
    return;
  }

  set_load_state(input, path, "loading", null);
  const generation = input.stores.vault.generation;
  const result = await input.services.folder.load_folder(path, generation);

  if (result.status === "loaded") {
    set_load_state(input, path, "loaded", null);
    set_pagination(input, path, {
      loaded_count: Math.min(PAGE_SIZE, result.total_count),
      total_count: result.total_count,
      load_state: "idle",
      error_message: null,
    });
    return;
  }

  if (result.status === "failed") {
    set_load_state(input, path, "error", result.error);
    clear_folder_pagination(input, path);
  }
}

<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { get_invalid_drop_reason } from "$lib/features/folder/domain/filetree";
  import type { FlatTreeNode, MoveItem } from "$lib/shared/types/filetree";
  import type { NoteMeta } from "$lib/shared/types/note";
  import FileTreeRow from "$lib/features/folder/ui/file_tree_row.svelte";

  type Props = {
    nodes: FlatTreeNode[];
    selected_path: string;
    revealed_note_path: string;
    open_note_path: string;
    selected_items?: string[];
    starred_paths?: string[];
    on_select_item?:
      | ((payload: {
          path: string;
          ordered_paths: string[];
          shift_key: boolean;
          additive_key: boolean;
        }) => void)
      | undefined;
    on_toggle_folder: (path: string) => void;
    on_toggle_folder_node?: ((node: FlatTreeNode) => void) | undefined;
    on_select_note: (path: string) => void;
    on_select_folder: (path: string) => void;
    on_request_delete?: ((note: NoteMeta) => void) | undefined;
    on_request_rename?: ((note: NoteMeta) => void) | undefined;
    on_request_delete_folder?: ((folder_path: string) => void) | undefined;
    on_request_rename_folder?: ((folder_path: string) => void) | undefined;
    on_request_create_note?: (() => void) | undefined;
    on_request_create_folder?: ((folder_path: string) => void) | undefined;
    on_toggle_star?:
      | ((payload: { paths: string[]; all_starred: boolean }) => void)
      | undefined;
    scoped_root_path?: string | null;
    on_scope_to_folder?: ((folder_path: string) => void) | undefined;
    on_clear_scope?: (() => void) | undefined;
    on_retry_load: (path: string) => void;
    on_load_more: (folder_path: string) => void;
    on_retry_load_more: (folder_path: string) => void;
    on_move_items: (
      items: MoveItem[],
      target_folder: string,
      overwrite: boolean,
    ) => void;
  };

  let {
    nodes,
    selected_path,
    revealed_note_path,
    open_note_path,
    selected_items = [],
    starred_paths = [],
    on_select_item,
    on_toggle_folder,
    on_toggle_folder_node,
    on_select_note,
    on_select_folder,
    on_request_delete,
    on_request_rename,
    on_request_delete_folder,
    on_request_rename_folder,
    on_request_create_note,
    on_request_create_folder,
    on_toggle_star,
    scoped_root_path = null,
    on_scope_to_folder,
    on_clear_scope,
    on_retry_load,
    on_load_more,
    on_retry_load_more,
    on_move_items,
  }: Props = $props();

  const ROW_HEIGHT = 30;
  const OVERSCAN = 5;

  let scroll_container: HTMLDivElement | null = $state(null);
  let pending_load_more_scroll_top: number | null = $state(null);
  let previous_nodes_count = -1;
  let dragging_items = $state<MoveItem[]>([]);
  let drag_source_paths = $state(new Set<string>());
  let drag_over_target = $state<string | null>(null);
  let drag_over_invalid = $state(false);
  let drag_ghost_el: HTMLDivElement | null = $state(null);
  let drag_ghost_text = $state("");

  function restore_scroll_top(min_scroll_top: number) {
    if (min_scroll_top <= 0) {
      return;
    }

    const apply = () => {
      if (!scroll_container) {
        return;
      }
      if (scroll_container.scrollTop < min_scroll_top) {
        scroll_container.scrollTop = min_scroll_top;
      }
    };

    queueMicrotask(apply);
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 0,
    getScrollElement: () => scroll_container,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  $effect(() => {
    const v = $virtualizer;
    if (!v) return;

    const next_count = nodes.length;
    const count_changed = next_count !== previous_nodes_count;
    const has_loading_load_more = nodes.some(
      (node) => node.is_load_more && node.is_loading,
    );

    if (!count_changed) {
      if (pending_load_more_scroll_top !== null && !has_loading_load_more) {
        pending_load_more_scroll_top = null;
      }
      return;
    }

    v.setOptions({ count: next_count });
    if (pending_load_more_scroll_top === null) {
      v.measure();
    }

    if (pending_load_more_scroll_top !== null) {
      if (next_count > previous_nodes_count) {
        restore_scroll_top(pending_load_more_scroll_top);
      }
      pending_load_more_scroll_top = null;
    }

    previous_nodes_count = next_count;
  });

  const virtual_items = $derived.by(() => {
    const current_nodes = nodes;
    void current_nodes;

    const v = $virtualizer;
    if (!v) return [];
    return v.getVirtualItems();
  });

  const total_size = $derived.by(() => {
    const current_nodes = nodes;
    void current_nodes;

    const v = $virtualizer;
    if (!v) return nodes.length * ROW_HEIGHT;
    return v.getTotalSize();
  });

  const ordered_paths = $derived.by(() =>
    nodes.filter((node) => !node.is_load_more).map((node) => node.path),
  );

  const all_selected_starred = $derived(
    selected_items.length > 1 &&
      selected_items.every((path) =>
        starred_paths.some((sp) => sp.toLowerCase() === path.toLowerCase()),
      ),
  );

  const node_by_path = $derived.by(() => {
    const lookup = new Map<string, FlatTreeNode>();
    for (const node of nodes) {
      if (!node.is_load_more) {
        lookup.set(node.path, node);
      }
    }
    return lookup;
  });

  $effect(() => {
    const v = $virtualizer;
    if (!v) return;

    const items = v.getVirtualItems();
    for (const item of items) {
      const node = nodes[item.index];
      if (!node?.is_load_more || node.is_loading || node.has_error) {
        continue;
      }
      if (scroll_container) {
        pending_load_more_scroll_top = Number(scroll_container.scrollTop);
      }
      on_load_more(node.parent_path ?? "");
      break;
    }
  });

  function reset_drag_state() {
    dragging_items = [];
    drag_source_paths = new Set<string>();
    drag_over_target = null;
    drag_over_invalid = false;
  }

  function handle_toggle_star(path: string) {
    const is_multi = selected_items.length > 1 && selected_items.includes(path);
    const paths = is_multi ? [...selected_items] : [path];
    const is_all_starred = is_multi
      ? all_selected_starred
      : starred_paths.some((sp) => sp.toLowerCase() === path.toLowerCase());
    on_toggle_star?.({ paths, all_starred: is_all_starred });
  }

  function handle_row_pointer(node: FlatTreeNode, event: MouseEvent) {
    on_select_item?.({
      path: node.path,
      ordered_paths,
      shift_key: event.shiftKey,
      additive_key: event.metaKey || event.ctrlKey,
    });
  }

  function handle_row_keydown(node: FlatTreeNode, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    on_select_item?.({
      path: node.path,
      ordered_paths,
      shift_key: event.shiftKey,
      additive_key: event.metaKey || event.ctrlKey,
    });
  }

  function handle_drag_start_row(node: FlatTreeNode, event: DragEvent) {
    if (node.is_load_more) {
      event.preventDefault();
      return;
    }
    const selected_set = new Set(selected_items);
    const source_paths =
      selected_set.has(node.path) && selected_items.length > 0
        ? selected_items.filter((path) => node_by_path.has(path))
        : [node.path];

    const items: MoveItem[] = source_paths
      .map((path) => node_by_path.get(path))
      .filter((entry): entry is FlatTreeNode => !!entry)
      .map((entry) => ({
        path: entry.path,
        is_folder: entry.is_folder,
      }));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }

    dragging_items = items;
    drag_source_paths = new Set(items.map((item) => item.path));
    drag_over_target = null;
    drag_over_invalid = false;

    event.dataTransfer?.setData(
      "text/plain",
      items.map((item) => item.path).join("\n"),
    );
    event.dataTransfer?.setData(
      "application/x-otterly-filetree-count",
      String(items.length),
    );
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      drag_ghost_text =
        items.length === 1 ? node.name : `${items.length} items`;
      if (drag_ghost_el) {
        event.dataTransfer.setDragImage(drag_ghost_el, -24, 12);
      }
    }
  }

  function handle_drag_over_target(target_folder: string, event: DragEvent) {
    if (dragging_items.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag_over_target = target_folder;
    drag_over_invalid =
      get_invalid_drop_reason(dragging_items, target_folder) !== null;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = drag_over_invalid ? "none" : "move";
    }
  }

  function handle_drop_target(target_folder: string, event: DragEvent) {
    if (dragging_items.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const invalid = get_invalid_drop_reason(dragging_items, target_folder);
    if (!invalid) {
      on_move_items(dragging_items, target_folder, false);
    }
    reset_drag_state();
  }

  function handle_drag_over_row(node: FlatTreeNode, event: DragEvent) {
    if (!node.is_folder) {
      if (dragging_items.length > 0) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "none";
        }
      }
      return;
    }
    handle_drag_over_target(node.path, event);
  }

  function handle_drag_leave_row(node: FlatTreeNode, _event: DragEvent) {
    if (drag_over_target === node.path) {
      drag_over_target = null;
      drag_over_invalid = false;
    }
  }

  function handle_drop_row(node: FlatTreeNode, event: DragEvent) {
    if (!node.is_folder) {
      return;
    }
    handle_drop_target(node.path, event);
  }

  function handle_drag_end(_node: FlatTreeNode, _event: DragEvent) {
    reset_drag_state();
  }

  function handle_container_drag_over(event: DragEvent) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".TreeRow")) {
      return;
    }
    handle_drag_over_target("", event);
  }

  function handle_container_drop(event: DragEvent) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".TreeRow")) {
      return;
    }
    handle_drop_target("", event);
  }
</script>

<div
  bind:this={scroll_container}
  class="virtual-file-tree h-full w-full overflow-auto"
  role="tree"
  tabindex="0"
  aria-label="File tree"
  ondragover={handle_container_drag_over}
  ondrop={handle_container_drop}
  ondragleave={() => {
    if (drag_over_target === "") {
      drag_over_target = null;
      drag_over_invalid = false;
    }
  }}
>
  <div class="relative w-full" style="height: {total_size}px">
    {#each virtual_items as virtual_row (virtual_row.key)}
      {@const node = nodes[virtual_row.index]}
      {#if node}
        <div
          class="absolute left-0 top-0 w-full"
          style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
        >
          <FileTreeRow
            {node}
            is_selected={selected_items.length <= 1 &&
              (node.is_folder
                ? selected_path === node.path
                : revealed_note_path === node.path ||
                  open_note_path === node.path)}
            is_multi_selected={selected_items.includes(node.path)}
            is_starred={starred_paths.includes(node.path)}
            drag_over_state={drag_over_target === node.path
              ? drag_over_invalid
                ? "invalid"
                : "valid"
              : "none"}
            is_drag_source={drag_source_paths.has(node.path)}
            on_row_pointer={handle_row_pointer}
            on_row_keydown={handle_row_keydown}
            on_drag_start_row={handle_drag_start_row}
            on_drag_over_row={handle_drag_over_row}
            on_drag_leave_row={handle_drag_leave_row}
            on_drop_row={handle_drop_row}
            on_drag_end_row={handle_drag_end}
            {on_toggle_folder}
            {on_toggle_folder_node}
            {on_select_note}
            {on_select_folder}
            {on_request_delete}
            {on_request_rename}
            {on_request_delete_folder}
            {on_request_rename_folder}
            {on_request_create_note}
            {on_request_create_folder}
            on_toggle_star={on_toggle_star ? handle_toggle_star : undefined}
            {scoped_root_path}
            {on_scope_to_folder}
            {on_clear_scope}
            selection_count={selected_items.length}
            {all_selected_starred}
            {on_retry_load}
            {on_retry_load_more}
          />
        </div>
      {/if}
    {/each}
  </div>
  <div bind:this={drag_ghost_el} class="DragGhost" aria-hidden="true">
    {drag_ghost_text}
  </div>
</div>

<style>
  .DragGhost {
    position: fixed;
    top: -1000px;
    left: -1000px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background-color: var(--sidebar-accent);
    color: var(--sidebar-foreground);
    font-size: var(--text-xs);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
  }
</style>

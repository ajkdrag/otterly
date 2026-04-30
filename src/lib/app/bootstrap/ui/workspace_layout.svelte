<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button";
  import ActivityBar from "$lib/app/bootstrap/ui/activity_bar.svelte";
  import { VirtualFileTree } from "$lib/features/folder";
  import { VaultDashboardPanel } from "$lib/features/vault";
  import { NoteEditor, NoteDetailsDialog } from "$lib/features/note";
  import { TabBar } from "$lib/features/tab";
  import { FindInFileBar } from "$lib/features/search";
  import { EditorStatusBar } from "$lib/features/editor";
  import { ContextRail } from "$lib/features/links";
  import { SvelteSet } from "svelte/reactivity";
  import { build_filetree, sort_tree } from "$lib/features/folder";
  import { flatten_filetree, scope_flat_tree } from "$lib/features/folder";
  import { as_note_path } from "$lib/shared/types/ids";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { NoteMeta } from "$lib/shared/types/note";
  import {
    FilePlus,
    FolderPlus,
    RefreshCw,
    FoldVertical,
    Star,
  } from "@lucide/svelte";
  import StatsOverlay from "$lib/features/stats/ui/stats_overlay.svelte";
  import { ModulesPanel } from "$lib/features/nlp_kernal";

  const { stores, action_registry } = use_app_context();

  let stats_overlay_open = $state(false);
  let starred_expanded_node_ids = $state(new SvelteSet<string>());

  function starred_node_id(root_path: string, relative_path: string): string {
    return `starred:${root_path}:${relative_path}`;
  }

  function is_note_path(path: string): boolean {
    return path.endsWith(".md");
  }

  function toggle_star_for_selection(payload: {
    paths: string[];
    all_starred: boolean;
  }) {
    void action_registry.execute(
      ACTION_IDS.filetree_toggle_star_selection,
      payload,
    );
  }

  function toggle_starred_folder_node(node: {
    id: string;
    path: string;
    is_folder: boolean;
  }) {
    if (!node.is_folder) {
      return;
    }

    if (starred_expanded_node_ids.has(node.id)) {
      starred_expanded_node_ids.delete(node.id);
      return;
    }

    starred_expanded_node_ids.add(node.id);
    void action_registry.execute(ACTION_IDS.folder_retry_load, node.path);
  }

  const flat_nodes = $derived(
    flatten_filetree({
      notes: stores.notes.notes,
      folder_paths: stores.notes.folder_paths,
      expanded_paths: stores.ui.filetree.expanded_paths,
      load_states: stores.ui.filetree.load_states,
      error_messages: stores.ui.filetree.error_messages,
      show_hidden_files: stores.ui.editor_settings.show_hidden_files,
      pagination: stores.ui.filetree.pagination,
    }),
  );

  const scoped_flat_nodes = $derived.by(() =>
    scope_flat_tree(flat_nodes, stores.ui.filetree_scoped_root_path),
  );

  const scoped_root_folder_name = $derived.by(() => {
    const scoped_root_path = stores.ui.filetree_scoped_root_path;
    if (!scoped_root_path) {
      return null;
    }
    return scoped_root_path.split("/").at(-1) ?? scoped_root_path;
  });

  const starred_nodes = $derived.by(() => {
    const starred_paths = stores.notes.starred_paths;
    if (starred_paths.length === 0) {
      return [];
    }

    const root_paths = [...starred_paths].sort((a, b) => {
      const a_is_folder = !is_note_path(a);
      const b_is_folder = !is_note_path(b);
      if (a_is_folder !== b_is_folder) {
        return a_is_folder ? -1 : 1;
      }
      return a.localeCompare(b);
    });

    const result = [];
    for (const root_path of root_paths) {
      const is_folder = !is_note_path(root_path);

      if (!is_folder) {
        const note_meta =
          stores.notes.notes.find((note) => note.path === root_path) ??
          ({
            id: root_path,
            path: root_path,
            name: (root_path.split("/").at(-1) ?? root_path).replace(
              /\.md$/i,
              "",
            ),
            title: (root_path.split("/").at(-1) ?? root_path).replace(
              /\.md$/i,
              "",
            ),
            mtime_ms: 0,
            size_bytes: 0,
          } as NoteMeta);

        result.push({
          id: `starred:${root_path}`,
          path: root_path,
          name: note_meta.name,
          depth: 0,
          is_folder: false,
          is_expanded: false,
          is_loading: false,
          has_error: false,
          error_message: null,
          note: note_meta,
          parent_path: null,
          is_load_more: false,
        });
        continue;
      }

      const root_id = starred_node_id(root_path, "");
      const root_load_state =
        stores.ui.filetree.load_states.get(root_path) ?? "unloaded";
      const root_is_expanded = starred_expanded_node_ids.has(root_id);

      result.push({
        id: root_id,
        path: root_path,
        name: root_path.split("/").at(-1) ?? root_path,
        depth: 0,
        is_folder: true,
        is_expanded: root_is_expanded,
        is_loading: root_load_state === "loading",
        has_error: root_load_state === "error",
        error_message: stores.ui.filetree.error_messages.get(root_path) ?? null,
        note: null,
        parent_path: null,
        is_load_more: false,
      });

      if (!root_is_expanded) {
        continue;
      }

      const relative_notes = stores.notes.notes
        .filter((note) => note.path.startsWith(`${root_path}/`))
        .map((note) => {
          const relative_path = note.path.slice(root_path.length + 1);
          return {
            ...note,
            id: as_note_path(relative_path),
            path: as_note_path(relative_path),
          };
        });
      const relative_folders = stores.notes.folder_paths
        .filter((path) => path.startsWith(`${root_path}/`))
        .map((path) => path.slice(root_path.length + 1));

      const tree = sort_tree(build_filetree(relative_notes, relative_folders));

      function visit(
        tree_node: ReturnType<typeof build_filetree>,
        parent_actual_path: string,
        depth: number,
      ) {
        for (const [, child] of tree_node.children) {
          if (
            !stores.ui.editor_settings.show_hidden_files &&
            child.name.startsWith(".")
          ) {
            continue;
          }

          const actual_path = `${root_path}/${child.path}`;
          const node_id = starred_node_id(root_path, child.path);
          const load_state =
            stores.ui.filetree.load_states.get(actual_path) ?? "unloaded";
          const is_expanded =
            child.is_folder && starred_expanded_node_ids.has(node_id);

          result.push({
            id: node_id,
            path: actual_path,
            name: child.name,
            depth,
            is_folder: child.is_folder,
            is_expanded,
            is_loading: load_state === "loading",
            has_error: load_state === "error",
            error_message:
              stores.ui.filetree.error_messages.get(actual_path) ?? null,
            note: child.note
              ? ({
                  ...child.note,
                  id: actual_path,
                  path: actual_path,
                } as NoteMeta)
              : null,
            parent_path: parent_actual_path,
            is_load_more: false,
          });

          if (child.is_folder && is_expanded) {
            visit(child, actual_path, depth + 1);
          }
        }

        const pagination_state =
          stores.ui.filetree.pagination.get(parent_actual_path);
        if (
          pagination_state &&
          pagination_state.loaded_count < pagination_state.total_count
        ) {
          const load_more_id = starred_node_id(
            root_path,
            `__load_more__:${parent_actual_path || "root"}`,
          );
          result.push({
            id: load_more_id,
            path: load_more_id,
            name: "",
            depth,
            is_folder: false,
            is_expanded: false,
            is_loading: pagination_state.load_state === "loading",
            has_error: pagination_state.load_state === "error",
            error_message: pagination_state.error_message,
            note: null,
            parent_path: parent_actual_path,
            is_load_more: true,
          });
        }
      }

      visit(tree, root_path, 1);
    }

    return result;
  });

  $effect(() => {
    const valid_ids = new Set(starred_nodes.map((node) => node.id));
    for (const id of starred_expanded_node_ids) {
      if (!valid_ids.has(id)) {
        starred_expanded_node_ids.delete(id);
      }
    }
  });

  const word_count = $derived(stores.editor.cursor?.total_words ?? 0);
  const line_count = $derived(stores.editor.cursor?.total_lines ?? 0);

  let details_dialog_open = $state(false);

  type HeaderAction = {
    icon: typeof FilePlus;
    label: string;
    onclick: () => void;
  };

  const explorer_header_actions: HeaderAction[] = [
    {
      icon: FilePlus,
      label: "New Note",
      onclick: () => void action_registry.execute(ACTION_IDS.note_create),
    },
    {
      icon: FolderPlus,
      label: "New Folder",
      onclick: () =>
        void action_registry.execute(
          ACTION_IDS.folder_request_create,
          stores.ui.selected_folder_path,
        ),
    },
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
    {
      icon: FoldVertical,
      label: "Collapse All",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_collapse_all),
    },
  ];

  const starred_header_actions: HeaderAction[] = [
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
    {
      icon: FoldVertical,
      label: "Collapse All",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_collapse_all),
    },
  ];

  const dashboard_header_actions: HeaderAction[] = [
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
  ];

  const sidebar_header_actions = $derived.by(() => {
    const view = stores.ui.sidebar_view;
    if (view === "starred") return starred_header_actions;
    if (view === "dashboard") return dashboard_header_actions;
    return explorer_header_actions;
  });
</script>

{#if stores.vault.vault}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex h-screen flex-col"
    onpointerdown={(e) => {
      if (stores.ui.selected_items.size <= 1) return;
      const target = e.target as HTMLElement;
      if (target.closest(".TreeRow")) return;
      void action_registry.execute(ACTION_IDS.filetree_clear_selection);
    }}
  >
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <ActivityBar
        sidebar_open={stores.ui.sidebar_open}
        active_view={stores.ui.sidebar_view}
        on_open_explorer={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "explorer") {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(
            ACTION_IDS.ui_set_sidebar_view,
            "explorer",
          );
        }}
        on_open_starred={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "starred") {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(
            ACTION_IDS.ui_set_sidebar_view,
            "starred",
          );
        }}
        on_open_dashboard={() => {
          if (
            stores.ui.sidebar_open &&
            stores.ui.sidebar_view === "dashboard"
          ) {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(
            ACTION_IDS.ui_set_sidebar_view,
            "dashboard",
          );
        }}
        on_open_modules={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "modules") {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(
            ACTION_IDS.ui_set_sidebar_view,
            "modules",
          );
        }}
        on_open_stats={() => {
          stats_overlay_open = !stats_overlay_open;
        }}
        on_open_help={() => void action_registry.execute(ACTION_IDS.help_open)}
        on_open_settings={() =>
          void action_registry.execute(ACTION_IDS.settings_open)}
      />
      <Sidebar.Provider
        open={stores.ui.sidebar_open}
        class="flex-1 min-h-0 min-w-0"
      >
        <Resizable.PaneGroup direction="horizontal" class="h-full">
          {#if stores.ui.sidebar_open}
            <Resizable.Pane
              defaultSize={15}
              minSize={10}
              maxSize={40}
              order={1}
            >
              <Sidebar.Root collapsible="none" class="w-full">
                <Sidebar.Header class="p-0">
                  <div class="SidebarHeader">
                    {#if stores.ui.sidebar_view === "starred"}
                      <span class="SidebarHeader__title">Starred</span>
                    {:else if stores.ui.sidebar_view === "dashboard"}
                      <span class="SidebarHeader__title">Dashboard</span>
                    {:else if stores.ui.sidebar_view === "modules"}
                      <span class="SidebarHeader__title">System Modules</span>
                    {:else}
                      <button
                        type="button"
                        class="SidebarHeader__title SidebarHeader__title--button"
                        onclick={() => {
                          void action_registry.execute(
                            ACTION_IDS.ui_select_folder,
                            "",
                          );
                        }}
                        aria-label="Select vault root"
                      >
                        {stores.vault.vault.name}
                      </button>
                    {/if}
                    <div class="SidebarHeader__actions">
                      {#each sidebar_header_actions as action (action.label)}
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                class="SidebarHeaderButton"
                                onclick={action.onclick}
                              >
                                <action.icon class="SidebarHeaderIcon" />
                              </Button>
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>{action.label}</Tooltip.Content>
                        </Tooltip.Root>
                      {/each}
                    </div>
                  </div>
                  {#if stores.ui.sidebar_view === "explorer" && stores.ui.filetree_scoped_root_path && scoped_root_folder_name}
                    <div
                      class="SidebarScope"
                      title={stores.ui.filetree_scoped_root_path}
                    >
                      <span class="SidebarScope__label">Scoped to:</span>
                      <span class="SidebarScope__value"
                        >{scoped_root_folder_name}</span
                      >
                      <button
                        type="button"
                        class="SidebarScope__clear"
                        onclick={() => {
                          void action_registry.execute(
                            ACTION_IDS.filetree_clear_scope,
                          );
                        }}
                        aria-label="Clear file tree scope"
                      >
                        Clear
                      </button>
                    </div>
                  {/if}
                </Sidebar.Header>

                <Sidebar.Content class="overflow-hidden">
                  {#if stores.ui.sidebar_view === "starred"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <VirtualFileTree
                          nodes={starred_nodes}
                          selected_path={stores.ui.selected_folder_path}
                          revealed_note_path={stores.ui
                            .filetree_revealed_note_path}
                          open_note_path={stores.editor.open_note?.meta.path ??
                            ""}
                          selected_items={Array.from(stores.ui.selected_items)}
                          starred_paths={stores.notes.starred_paths}
                          on_select_item={(payload) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_select_item,
                              payload,
                            )}
                          on_toggle_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_toggle,
                              path,
                            )}
                          on_toggle_folder_node={toggle_starred_folder_node}
                          on_select_note={(note_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.note_open,
                              note_path,
                            )}
                          on_select_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.ui_select_folder,
                              path,
                            )}
                          on_request_create_note={() =>
                            void action_registry.execute(
                              ACTION_IDS.note_create,
                            )}
                          on_request_create_folder={(folder_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_request_create,
                              folder_path,
                            )}
                          on_toggle_star={toggle_star_for_selection}
                          on_retry_load={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_retry_load,
                              path,
                            )}
                          on_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_retry_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_move_items={(items, target_folder, overwrite) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_move_items,
                              {
                                items,
                                target_folder,
                                overwrite,
                              },
                            )}
                        />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if stores.ui.sidebar_view === "stats"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        {@const StatsDashboard =
                          stores.ui.sidebar_view === "stats"}
                        {#if StatsDashboard}
                          {#await import("$lib/features/stats/ui/stats_dashboard.svelte") then mod}
                            <mod.default />
                          {/await}
                        {/if}
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if stores.ui.sidebar_view === "modules"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <ModulesPanel />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if stores.ui.sidebar_view === "dashboard"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <VaultDashboardPanel
                          stats_status={stores.notes.dashboard_stats.status}
                          note_count={stores.notes.dashboard_stats.value
                            ?.note_count ?? null}
                          folder_count={stores.notes.dashboard_stats.value
                            ?.folder_count ?? null}
                          recent_notes={stores.notes.recent_notes}
                          vault_name={stores.vault.vault.name}
                          vault_path={stores.vault.vault.path}
                          on_note_click={(note_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.note_open,
                              note_path,
                            )}
                          on_new_note={() =>
                            void action_registry.execute(
                              ACTION_IDS.note_create,
                            )}
                          on_search={() =>
                            void action_registry.execute(
                              ACTION_IDS.omnibar_open,
                            )}
                          on_reindex={() =>
                            void action_registry.execute(
                              ACTION_IDS.vault_reindex,
                            )}
                        />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  <Sidebar.Group
                    class="h-full"
                    hidden={stores.ui.sidebar_view !== "explorer"}
                  >
                    <Sidebar.GroupContent class="h-full">
                      <VirtualFileTree
                        nodes={scoped_flat_nodes}
                        selected_path={stores.ui.selected_folder_path}
                        revealed_note_path={stores.ui
                          .filetree_revealed_note_path}
                        open_note_path={stores.editor.open_note?.meta.path ??
                          ""}
                        selected_items={Array.from(stores.ui.selected_items)}
                        starred_paths={stores.notes.starred_paths}
                        on_select_item={(payload) =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_select_item,
                            payload,
                          )}
                        on_toggle_folder={(path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_toggle,
                            path,
                          )}
                        on_select_note={(note_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.note_open,
                            note_path,
                          )}
                        on_select_folder={(path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.ui_select_folder,
                            path,
                          )}
                        on_request_delete={(note: NoteMeta) =>
                          void action_registry.execute(
                            ACTION_IDS.note_request_delete,
                            note,
                          )}
                        on_request_rename={(note: NoteMeta) =>
                          void action_registry.execute(
                            ACTION_IDS.note_request_rename,
                            note,
                          )}
                        on_request_delete_folder={(folder_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_request_delete,
                            folder_path,
                          )}
                        on_request_rename_folder={(folder_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_request_rename,
                            folder_path,
                          )}
                        on_request_create_note={() =>
                          void action_registry.execute(ACTION_IDS.note_create)}
                        on_request_create_folder={(folder_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_request_create,
                            folder_path,
                          )}
                        scoped_root_path={stores.ui.filetree_scoped_root_path}
                        on_scope_to_folder={(folder_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_scope_to_folder,
                            folder_path,
                          )}
                        on_clear_scope={() =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_clear_scope,
                          )}
                        on_toggle_star={toggle_star_for_selection}
                        on_retry_load={(path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_retry_load,
                            path,
                          )}
                        on_load_more={(path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_load_more,
                            path,
                          )}
                        on_retry_load_more={(path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_load_more,
                            path,
                          )}
                        on_move_items={(items, target_folder, overwrite) =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_move_items,
                            {
                              items,
                              target_folder,
                              overwrite,
                            },
                          )}
                      />
                    </Sidebar.GroupContent>
                  </Sidebar.Group>
                </Sidebar.Content>

                <Sidebar.Rail />
              </Sidebar.Root>
            </Resizable.Pane>
            <Resizable.Handle withHandle />
          {/if}
          <Resizable.Pane order={2}>
            <Sidebar.Inset class="flex h-full min-h-0 min-w-0 flex-col">
              <TabBar />
              <div class="flex min-h-0 flex-1 flex-col">
                <FindInFileBar
                  open={stores.ui.find_in_file.open}
                  query={stores.ui.find_in_file.query}
                  matches={stores.search.in_file_matches}
                  selected_match_index={stores.ui.find_in_file
                    .selected_match_index}
                  on_query_change={(query: string) =>
                    void action_registry.execute(
                      ACTION_IDS.find_in_file_set_query,
                      query,
                    )}
                  on_next={() =>
                    void action_registry.execute(ACTION_IDS.find_in_file_next)}
                  on_prev={() =>
                    void action_registry.execute(ACTION_IDS.find_in_file_prev)}
                  on_close={() =>
                    void action_registry.execute(ACTION_IDS.find_in_file_close)}
                />
                <NoteEditor />
              </div>
            </Sidebar.Inset>
          </Resizable.Pane>
          {#if stores.ui.context_rail_open}
            <Resizable.Handle withHandle />
            <Resizable.Pane
              defaultSize={20}
              minSize={12}
              maxSize={35}
              order={3}
            >
              <ContextRail />
            </Resizable.Pane>
          {/if}
        </Resizable.PaneGroup>
      </Sidebar.Provider>
    </div>
    <EditorStatusBar
      cursor_info={stores.editor.cursor}
      {word_count}
      {line_count}
      has_note={!!stores.editor.open_note}
      last_saved_at={stores.editor.last_saved_at}
      index_progress={stores.search.index_progress}
      vault_name={stores.vault.vault?.name ?? null}
      git_enabled={stores.git.enabled}
      git_branch={stores.git.branch}
      git_is_dirty={stores.git.is_dirty}
      git_pending_files={stores.git.pending_files}
      git_sync_status={stores.git.sync_status}
      is_repairing_links={stores.op.is_pending("links.repair")}
      link_repair_message={stores.op.get("links.repair").message}
      on_vault_click={() =>
        void action_registry.execute(ACTION_IDS.vault_request_change)}
      on_info_click={() => (details_dialog_open = true)}
      on_git_click={() =>
        void action_registry.execute(ACTION_IDS.git_open_history)}
      on_sync_click={() =>
        void action_registry.execute(ACTION_IDS.vault_sync_index)}
    />
  </div>

  <NoteDetailsDialog
    open={details_dialog_open}
    note={stores.editor.open_note}
    {word_count}
    {line_count}
    on_close={() => (details_dialog_open = false)}
  />

  <StatsOverlay
    open={stats_overlay_open}
    on_close={() => (stats_overlay_open = false)}
  />
{/if}

<style>
  .SidebarHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--size-touch-lg);
    padding-inline: var(--space-3);
    gap: var(--space-2);
    border-block-end: 1px solid var(--border);
  }

  .SidebarHeader__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .SidebarHeader__title--button {
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .SidebarHeader__title--button:hover {
    color: var(--foreground);
  }

  .SidebarHeader__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
  }

  .SidebarScope {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-block-end: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .SidebarScope__label {
    flex-shrink: 0;
  }

  .SidebarScope__value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--foreground);
    font-weight: 600;
  }

  .SidebarScope__clear {
    margin-inline-start: auto;
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .SidebarScope__clear:hover {
    color: var(--foreground);
  }

  :global(.SidebarHeaderButton) {
    width: var(--size-touch-sm);
    height: var(--size-touch-sm);
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  :global(.SidebarHeaderButton:hover) {
    color: var(--foreground);
  }

  :global(.SidebarHeaderIcon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  :global(.StarredGroupLabel) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-4);
  }

  :global(.StarredGroupLabel__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>

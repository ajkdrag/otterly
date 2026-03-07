<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    Pin,
    X,
    ChevronLeft,
    ChevronRight,
    PanelRight,
    Columns2,
  } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { Tab, TabId } from "$lib/features/tab/types/tab";
  import type { NoteMeta } from "$lib/shared/types/note";

  const { stores, action_registry } = use_app_context();

  function find_note_meta(tab: Tab): NoteMeta | null {
    if (tab.kind !== "note") return null;
    return stores.notes.notes.find((n) => n.path === tab.note_path) ?? null;
  }

  function is_starred(tab: Tab): boolean {
    if (tab.kind !== "note") return false;
    return stores.notes.starred_paths.includes(tab.note_path);
  }

  const tabs = $derived(stores.tab.tabs);
  const active_tab_id = $derived(stores.tab.active_tab_id);

  let scroll_container: HTMLDivElement | undefined = $state();
  let can_scroll_left = $state(false);
  let can_scroll_right = $state(false);

  let drag_source_id: TabId | null = $state(null);
  let drag_source_pinned = $state(false);
  let drag_over_id: TabId | null = $state(null);

  function check_scroll() {
    if (!scroll_container) return;
    can_scroll_left = scroll_container.scrollLeft > 0;
    can_scroll_right =
      scroll_container.scrollLeft <
      scroll_container.scrollWidth - scroll_container.clientWidth - 1;
  }

  $effect(() => {
    if (!scroll_container) return;
    const _tabs_length = tabs.length;
    const _active = active_tab_id;
    check_scroll();
  });

  $effect(() => {
    if (!scroll_container) return;
    const observer = new ResizeObserver(() => {
      check_scroll();
    });
    observer.observe(scroll_container);
    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    if (!scroll_container || !active_tab_id) return;
    const active_el = scroll_container.querySelector(
      `[data-tab-id="${CSS.escape(active_tab_id)}"]`,
    ) as HTMLElement | null;
    if (active_el) {
      active_el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  });

  function scroll_left() {
    scroll_container?.scrollBy({ left: -200, behavior: "smooth" });
  }

  function scroll_right() {
    scroll_container?.scrollBy({ left: 200, behavior: "smooth" });
  }

  function activate(tab_id: TabId) {
    if (tab_id === active_tab_id) return;
    void action_registry.execute(ACTION_IDS.tab_activate, tab_id);
  }

  function close(event: MouseEvent, tab_id: TabId) {
    event.stopPropagation();
    void action_registry.execute(ACTION_IDS.tab_close, tab_id);
  }

  function handle_dragstart(event: DragEvent, tab: Tab) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.id);
    drag_source_id = tab.id;
    drag_source_pinned = tab.is_pinned;
  }

  function handle_dragover(event: DragEvent, tab: Tab) {
    if (!event.dataTransfer) return;
    if (drag_source_id && drag_source_pinned !== tab.is_pinned) {
      event.dataTransfer.dropEffect = "none";
      drag_over_id = null;
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    drag_over_id = tab.id;
  }

  function handle_dragleave() {
    drag_over_id = null;
  }

  function handle_drop(event: DragEvent, target_tab: Tab) {
    event.preventDefault();
    drag_over_id = null;

    if (!drag_source_id || drag_source_id === target_tab.id) {
      drag_source_id = null;
      return;
    }

    const from_index = tabs.findIndex((t) => t.id === drag_source_id);
    const to_index = tabs.findIndex((t) => t.id === target_tab.id);
    if (from_index !== -1 && to_index !== -1) {
      stores.tab.reorder_tab(from_index, to_index);
    }
    drag_source_id = null;
  }

  function handle_dragend() {
    drag_source_id = null;
    drag_source_pinned = false;
    drag_over_id = null;
  }

  function handle_auxclick(event: MouseEvent, tab_id: TabId) {
    if (event.button === 1) {
      event.preventDefault();
      void action_registry.execute(ACTION_IDS.tab_close, tab_id);
    }
  }
</script>

{#if tabs.length > 0}
  <div class="TabBar" role="tablist" aria-label="Open tabs">
    {#if can_scroll_left}
      <button
        type="button"
        class="TabBar__scroll-btn TabBar__scroll-btn--left"
        onclick={scroll_left}
        aria-label="Scroll tabs left"
      >
        <ChevronLeft class="TabBar__scroll-icon" />
      </button>
    {/if}

    <div
      class="TabBar__tabs"
      bind:this={scroll_container}
      onscroll={check_scroll}
    >
      {#each tabs as tab, i (tab.id)}
        {#if i > 0 && !tab.is_pinned && tabs[i - 1]?.is_pinned}
          <div class="TabBar__pin-divider" aria-hidden="true"></div>
        {/if}
        {@const is_active = tab.id === active_tab_id}
        {@const is_dragging = tab.id === drag_source_id}
        {@const is_drag_over =
          tab.id === drag_over_id && drag_source_id !== tab.id}
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            {#snippet child({ props })}
              <Tooltip.Root delayDuration={500}>
                <Tooltip.Trigger>
                  {#snippet child({ props: tooltip_props })}
                    <div
                      {...props}
                      {...tooltip_props}
                      role="tab"
                      class="TabBar__tab"
                      class:TabBar__tab--active={is_active}
                      class:TabBar__tab--dragging={is_dragging}
                      class:TabBar__tab--drag-over={is_drag_over}
                      class:TabBar__tab--pinned={tab.is_pinned}
                      data-tab-id={tab.id}
                      aria-selected={is_active}
                      tabindex="0"
                      onclick={() => activate(tab.id)}
                      onauxclick={(e: MouseEvent) => handle_auxclick(e, tab.id)}
                      draggable={true}
                      ondragstart={(e: DragEvent) => handle_dragstart(e, tab)}
                      ondragover={(e: DragEvent) => handle_dragover(e, tab)}
                      ondragleave={handle_dragleave}
                      ondrop={(e: DragEvent) => handle_drop(e, tab)}
                      ondragend={handle_dragend}
                      onkeydown={(e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          activate(tab.id);
                        }
                      }}
                    >
                      {#if tab.is_pinned}
                        <span class="TabBar__tab-icon">
                          <Pin class="TabBar__icon TabBar__icon--pin" />
                        </span>
                      {/if}
                      <span class="TabBar__tab-title">{tab.title}</span>
                      {#if tab.is_dirty}
                        <span
                          class="TabBar__dirty-dot"
                          aria-label="Unsaved changes"
                        ></span>
                      {/if}
                      <button
                        type="button"
                        class="TabBar__close-btn"
                        class:TabBar__close-btn--dirty={tab.is_dirty}
                        class:TabBar__close-btn--visible={is_active}
                        onclick={(e: MouseEvent) => close(e, tab.id)}
                        aria-label="Close tab"
                      >
                        <X class="TabBar__close-icon" />
                      </button>
                    </div>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom" sideOffset={4}>
                  {tab.kind === "note" ? tab.note_path : tab.file_path}
                </Tooltip.Content>
              </Tooltip.Root>
            {/snippet}
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.Item
                onSelect={() =>
                  void action_registry.execute(ACTION_IDS.tab_close, tab.id)}
              >
                Close Tab
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={tabs.length <= 1}
                onSelect={() =>
                  void action_registry.execute(
                    ACTION_IDS.tab_close_other,
                    tab.id,
                  )}
              >
                Close Other Tabs
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={tabs.indexOf(tab) >= tabs.length - 1}
                onSelect={() =>
                  void action_registry.execute(
                    ACTION_IDS.tab_close_right,
                    tab.id,
                  )}
              >
                Close Tabs to the Right
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={() =>
                  void action_registry.execute(ACTION_IDS.tab_close_all)}
              >
                Close All Tabs
              </ContextMenu.Item>
              <ContextMenu.Separator />
              {#if tab.is_pinned}
                <ContextMenu.Item
                  onSelect={() =>
                    void action_registry.execute(ACTION_IDS.tab_unpin, tab.id)}
                >
                  Unpin Tab
                </ContextMenu.Item>
              {:else}
                <ContextMenu.Item
                  onSelect={() =>
                    void action_registry.execute(ACTION_IDS.tab_pin, tab.id)}
                >
                  Pin Tab
                </ContextMenu.Item>
              {/if}
              <ContextMenu.Separator />
              <ContextMenu.Item
                onSelect={() =>
                  void action_registry.execute(
                    ACTION_IDS.tab_copy_path,
                    tab.id,
                  )}
              >
                Copy File Path
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={() =>
                  void action_registry.execute(
                    ACTION_IDS.tab_reveal_in_tree,
                    tab.id,
                  )}
              >
                Reveal in File Tree
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={tab.kind !== "note"}
                onSelect={() => {
                  if (tab.kind === "note") {
                    void action_registry.execute(
                      ACTION_IDS.split_view_open_to_side,
                      tab.note_path,
                    );
                  }
                }}
              >
                <Columns2 class="mr-2 h-4 w-4" />
                Open to Side
              </ContextMenu.Item>
              <ContextMenu.Separator />
              {@const note_meta = find_note_meta(tab)}
              <ContextMenu.Item
                disabled={!note_meta}
                onSelect={() => {
                  if (note_meta && tab.kind === "note") {
                    void action_registry.execute(
                      ACTION_IDS.note_toggle_star,
                      tab.note_path,
                    );
                  }
                }}
              >
                {is_starred(tab) ? "Unstar" : "Star"}
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!note_meta}
                onSelect={() => {
                  if (note_meta) {
                    void action_registry.execute(
                      ACTION_IDS.note_request_rename,
                      note_meta,
                    );
                  }
                }}
              >
                Rename
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!note_meta}
                onSelect={() => {
                  if (note_meta) {
                    void action_registry.execute(
                      ACTION_IDS.note_request_delete,
                      note_meta,
                    );
                  }
                }}
              >
                Delete
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!is_active}
                onSelect={() => {
                  if (is_active) {
                    void action_registry.execute(ACTION_IDS.note_copy_markdown);
                  }
                }}
              >
                Copy Markdown
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      {/each}
    </div>

    {#if can_scroll_right}
      <button
        type="button"
        class="TabBar__scroll-btn TabBar__scroll-btn--right"
        onclick={scroll_right}
        aria-label="Scroll tabs right"
      >
        <ChevronRight class="TabBar__scroll-icon" />
      </button>
    {/if}

    <div class="TabBar__actions">
      <button
        type="button"
        class="TabBar__action-btn"
        class:TabBar__action-btn--active={stores.ui.context_rail_open}
        onclick={() =>
          void action_registry.execute(ACTION_IDS.ui_toggle_context_rail)}
        aria-pressed={stores.ui.context_rail_open}
        aria-label="Toggle links panel"
      >
        <PanelRight class="TabBar__action-icon" />
      </button>
    </div>
  </div>
{/if}

<style>
  .TabBar {
    display: flex;
    align-items: stretch;
    height: var(--size-touch-lg);
    min-width: 0;
    background-color: var(--background);
    border-block-end: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
  }

  .TabBar__tabs {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
    flex: 1;
    min-width: 0;
    scroll-behavior: smooth;
    scrollbar-width: none;
  }

  .TabBar__tabs::-webkit-scrollbar {
    display: none;
  }

  .TabBar__scroll-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    flex-shrink: 0;
    color: var(--muted-foreground);
    background-color: var(--background);
    border: none;
    z-index: var(--z-dropdown);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .TabBar__scroll-btn:hover {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .TabBar__scroll-btn--left {
    box-shadow: 4px 0 8px -2px
      color-mix(in oklch, var(--shadow-color) 8%, transparent);
  }

  .TabBar__scroll-btn--right {
    box-shadow: -4px 0 8px -2px
      color-mix(in oklch, var(--shadow-color) 8%, transparent);
  }

  :global(.TabBar__scroll-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .TabBar__tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 100px;
    max-width: 260px;
    padding-inline: var(--space-3) var(--space-2);
    height: 100%;
    border-inline-end: 1px solid var(--border);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    position: relative;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .TabBar__tab:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .TabBar__tab--active {
    color: var(--foreground);
    font-weight: 500;
  }

  .TabBar__tab--active::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: 2px;
    background-color: var(--foreground);
  }

  .TabBar__tab--active:hover {
    background-color: var(--muted);
  }

  .TabBar__tab--pinned {
    background-color: color-mix(in oklch, var(--muted) 30%, transparent);
  }

  .TabBar__tab--pinned:hover {
    background-color: var(--muted);
  }

  .TabBar__pin-divider {
    width: 2px;
    flex-shrink: 0;
    background-color: var(--border);
  }

  .TabBar__tab--dragging {
    opacity: 0.5;
  }

  .TabBar__tab--drag-over {
    border-inline-start: 2px solid var(--interactive);
  }

  .TabBar__tab:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .TabBar__tab-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  :global(.TabBar__icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  :global(.TabBar__icon--pin) {
    color: var(--interactive-muted);
  }

  .TabBar__tab-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .TabBar__dirty-dot {
    width: var(--space-1-5);
    height: var(--space-1-5);
    border-radius: 50%;
    background-color: var(--indicator-dirty);
    opacity: 0.7;
    flex-shrink: 0;
    align-self: center;
    margin-inline: var(--space-0-5);
  }

  .TabBar__close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0;
    flex-shrink: 0;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .TabBar__close-btn--visible,
  .TabBar__tab:hover .TabBar__close-btn {
    opacity: 1;
  }

  .TabBar__close-btn:hover {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
    color: var(--foreground);
  }

  :global(.TabBar__close-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .TabBar__actions {
    display: flex;
    align-items: center;
    padding-inline: var(--space-1);
    flex-shrink: 0;
    border-inline-start: 1px solid var(--border);
  }

  .TabBar__action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-sm);
    height: var(--size-touch-sm);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .TabBar__action-btn:hover {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .TabBar__action-btn--active {
    color: var(--interactive);
  }

  .TabBar__action-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  :global(.TabBar__action-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }
</style>

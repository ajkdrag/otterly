<script lang="ts">
  import { Info, FolderOpen, RefreshCw } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { GitStatusWidget } from "$lib/features/git";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import type { CursorInfo } from "$lib/shared/types/editor";
  import type { IndexProgress } from "$lib/features/search";
  import type { GitSyncStatus } from "$lib/features/git";

  interface Props {
    cursor_info: CursorInfo | null;
    word_count: number;
    line_count: number;
    has_note: boolean;
    is_dirty: boolean;
    last_saved_at: number | null;
    index_progress: IndexProgress;
    vault_name: string | null;
    git_enabled: boolean;
    git_branch: string;
    git_is_dirty: boolean;
    git_pending_files: number;
    git_sync_status: GitSyncStatus;
    is_repairing_links: boolean;
    link_repair_message: string | null;
    on_vault_click: () => void;
    on_info_click: () => void;
    on_git_click: () => void;
    on_sync_click: () => void;
  }

  let {
    cursor_info,
    word_count,
    line_count,
    has_note,
    is_dirty,
    last_saved_at,
    index_progress,
    vault_name,
    git_enabled,
    git_branch,
    git_is_dirty,
    git_pending_files,
    git_sync_status,
    is_repairing_links,
    link_repair_message,
    on_vault_click,
    on_info_click,
    on_git_click,
    on_sync_click,
  }: Props = $props();

  const line = $derived(cursor_info?.line ?? null);
  const column = $derived(cursor_info?.column ?? null);
  const is_indexing = $derived(index_progress.status === "indexing");
  const show_index_counts = $derived(
    index_progress.total > 1 || index_progress.indexed > 0,
  );
  const sync_tooltip = $derived.by(() => {
    if (is_indexing) return "Indexing in progress…";
    if (index_progress.status === "failed")
      return "Last index failed — click to retry";
    return "Sync index";
  });

  let show_completed = $state(false);
  let completed_timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (index_progress.status === "completed") {
      show_completed = true;
      completed_timer = setTimeout(() => {
        show_completed = false;
      }, 3000);
    }
    return () => {
      if (completed_timer) {
        clearTimeout(completed_timer);
      }
    };
  });

  let tick = $state(Date.now());

  $effect(() => {
    if (!last_saved_at) return;
    tick = Date.now();
    const handle = setInterval(() => {
      tick = Date.now();
    }, 15_000);
    return () => clearInterval(handle);
  });

  const saved_label = $derived(
    is_dirty
      ? "Unsaved changes"
      : last_saved_at
        ? `Saved ${format_relative_time(last_saved_at, tick)}`
        : null,
  );
</script>

<div class="StatusBar">
  <div class="StatusBar__section">
    <span class="StatusBar__item">
      Ln {line ?? "--"}, Col {column ?? "--"}
    </span>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <span class="StatusBar__item">
      {has_note ? word_count : "--"} words
    </span>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <span class="StatusBar__item">
      {has_note ? line_count : "--"} lines
    </span>
    {#if saved_label}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <span class="StatusBar__item" class:StatusBar__item--unsaved={is_dirty}
        >{saved_label}</span
      >
    {/if}
  </div>
  <div class="StatusBar__section">
    {#if is_repairing_links}
      <span class="StatusBar__item StatusBar__item--repairing">
        <RefreshCw class="StatusBar__spinner" />
        <span>{link_repair_message ?? "Repairing links..."}</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}

    {#if is_indexing}
      <span class="StatusBar__item StatusBar__item--indexing">
        {#if show_index_counts}
          <span>Indexing {index_progress.indexed}/{index_progress.total}</span>
        {:else}
          <span>Indexing...</span>
        {/if}
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {:else if index_progress.status === "failed"}
      <span class="StatusBar__item StatusBar__item--failed">
        <span>Index failed</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {:else if show_completed}
      <span class="StatusBar__item StatusBar__item--completed">
        <span>Indexed</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    <button
      type="button"
      class="StatusBar__vault-action"
      onclick={on_vault_click}
      disabled={!vault_name}
      aria-label="Switch vault"
    >
      <FolderOpen />
      <span>{vault_name ?? "--"}</span>
    </button>
    <button
      type="button"
      class="StatusBar__action"
      onclick={on_info_click}
      disabled={!has_note}
      aria-label="Note details"
    >
      <Info />
    </button>
    {#if git_enabled}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <GitStatusWidget
        enabled={git_enabled}
        branch={git_branch}
        is_dirty={git_is_dirty}
        pending_files={git_pending_files}
        sync_status={git_sync_status}
        on_click={on_git_click}
      />
    {/if}
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="StatusBar__action"
              class:StatusBar__action--active={is_indexing}
              onclick={on_sync_click}
              disabled={!vault_name || is_indexing}
              aria-label={sync_tooltip}
            >
              <RefreshCw class={is_indexing ? "StatusBar__spinner" : ""} />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" sideOffset={4}>
          {sync_tooltip}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </div>
</div>

<style>
  .StatusBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--size-status-bar);
    padding-inline: var(--space-3);
    font-family: var(--font-family-mono);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background-color: color-mix(in oklch, var(--muted) 30%, transparent);
    color: var(--muted-foreground);
  }

  .StatusBar__section {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .StatusBar__item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .StatusBar__item--indexing {
    color: var(--primary);
  }

  .StatusBar__item--repairing {
    color: var(--primary);
  }

  .StatusBar__item--failed {
    color: var(--destructive);
  }

  .StatusBar__item--completed {
    color: var(--muted-foreground);
  }

  .StatusBar__item--unsaved {
    color: var(--indicator-dirty);
  }

  .StatusBar__separator {
    width: 1px;
    height: var(--space-2-5);
    background-color: currentColor;
    opacity: 0.2;
  }

  .StatusBar__vault-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 14rem;
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .StatusBar__vault-action > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .StatusBar__vault-action:hover:not(:disabled) {
    opacity: 1;
    color: var(--interactive);
  }

  .StatusBar__vault-action:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .StatusBar__vault-action:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .StatusBar__action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0.7;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .StatusBar__action:hover:not(:disabled) {
    opacity: 1;
    color: var(--interactive);
  }

  .StatusBar__action:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .StatusBar__action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .StatusBar__action--active {
    color: var(--primary);
    opacity: 1;
  }

  :global(.StatusBar__item svg),
  :global(.StatusBar__action svg),
  :global(.StatusBar__vault-action svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  :global(.StatusBar__spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>

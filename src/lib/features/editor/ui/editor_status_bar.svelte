<script lang="ts">
  import type { Snippet } from "svelte";
  import { Code } from "@lucide/svelte";
  import { VimStatusIndicator } from "$lib/features/vim";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import type {
    CursorInfo,
    EditorViewMode,
    VimStatus,
  } from "$lib/shared/types/editor";

  // The status bar of the vault window and of a document window. It shows
  // what every editor has. Each window adds its own items at the right end
  // through children: vault, index and git state in the vault window, the
  // file path in a document window. Those items use the StatusBar__ classes.
  interface Props {
    cursor_info: CursorInfo | null;
    has_open_file: boolean;
    view_mode: EditorViewMode;
    vim_status: VimStatus | null;
    is_dirty: boolean;
    last_saved_at: number | null;
    on_view_mode_click: () => void;
    children: Snippet;
  }

  let {
    cursor_info,
    has_open_file,
    view_mode,
    vim_status,
    is_dirty,
    last_saved_at,
    on_view_mode_click,
    children,
  }: Props = $props();

  const words = $derived(
    !cursor_info
      ? "--"
      : cursor_info.word_count_pending
        ? "…"
        : String(cursor_info.total_words),
  );

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
    {#if vim_status && has_open_file}
      <VimStatusIndicator status={vim_status} />
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    <span class="StatusBar__item">
      Ln {cursor_info?.line ?? "--"}, Col {cursor_info?.column ?? "--"}
    </span>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <span class="StatusBar__item">{words} words</span>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <span class="StatusBar__item">
      {cursor_info?.total_lines ?? "--"} lines
    </span>
    {#if saved_label}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <span class="StatusBar__item" class:StatusBar__item--unsaved={is_dirty}
        >{saved_label}</span
      >
    {/if}
  </div>
  <div class="StatusBar__section">
    {#if has_open_file && view_mode !== "text"}
      <button
        type="button"
        class="StatusBar__button"
        onclick={on_view_mode_click}
        aria-pressed={view_mode === "source"}
        title="Toggle source mode"
      >
        <Code />
        <span>{view_mode === "source" ? "Source" : "Rich"}</span>
      </button>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    {@render children()}
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

  .StatusBar__item--unsaved {
    color: var(--indicator-dirty);
  }

  /* Markup from children carries the caller's style scope, so the rules
     below are global under .StatusBar. Only hover sets a color, so a caller
     can color its own items with semantic utilities, like the index state. */
  .StatusBar :global(.StatusBar__item) {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .StatusBar :global(.StatusBar__separator) {
    width: 1px;
    height: var(--space-2-5);
    background-color: currentColor;
    opacity: 0.2;
  }

  /* Icon and label, like the Rich/Source toggle and the vault name. */
  .StatusBar :global(.StatusBar__button) {
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

  .StatusBar :global(.StatusBar__button > span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Icon only, like note info and index sync. */
  .StatusBar :global(.StatusBar__icon-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .StatusBar :global(.StatusBar__button:hover:not(:disabled)),
  .StatusBar :global(.StatusBar__icon-button:hover:not(:disabled)) {
    opacity: 1;
    color: var(--interactive);
  }

  .StatusBar :global(.StatusBar__button:focus-visible),
  .StatusBar :global(.StatusBar__icon-button:focus-visible) {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .StatusBar :global(.StatusBar__icon-button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .StatusBar :global(svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>

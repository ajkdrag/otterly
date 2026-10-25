<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";

  type Props = {
    tag: string;
    size: "sm" | "md";
    // Makes the whole chip a button.
    onclick?: () => void;
    // Adds a separate × button. A chip is never both: no button in a button.
    on_remove?: () => void;
    // Defaults to the full tag, which also shows what a truncated chip says.
    title?: string;
  };

  let { tag, size, onclick, on_remove, title }: Props = $props();

  const chip_title = $derived(title ?? `#${tag}`);

  // Enter and Space already click the button. Backspace and Delete remove the
  // chip too, so a focused × behaves like the ones in a tokenized input.
  function remove_on_backspace_or_delete(event: KeyboardEvent) {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    event.preventDefault();
    on_remove?.();
  }
</script>

{#snippet label()}
  <span class="TagChip__label"><span class="TagChip__hash">#</span>{tag}</span>
{/snippet}

{#if on_remove}
  <span class="TagChip TagChip--{size} TagChip--removable" title={chip_title}>
    {@render label()}
    <button
      type="button"
      class="TagChip__remove"
      aria-label={`Remove tag #${tag}`}
      onclick={on_remove}
      onkeydown={remove_on_backspace_or_delete}><XIcon /></button
    >
  </span>
{:else if onclick}
  <button
    type="button"
    class="TagChip TagChip--{size} TagChip--clickable"
    title={chip_title}
    {onclick}
  >
    {@render label()}
  </button>
{:else}
  <span class="TagChip TagChip--{size}" title={chip_title}>
    {@render label()}
  </span>
{/if}

<style>
  .TagChip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-0-5);
    max-width: 16rem;
    padding-inline: var(--space-1-5);
    border-radius: var(--editor-tag-radius);
    color: var(--editor-tag-text);
    background-color: var(--editor-tag-bg);
    /* An inset shadow is a border that takes no room. */
    box-shadow: inset 0 0 0 1px var(--editor-tag-border);
    white-space: nowrap;
  }

  .TagChip--sm {
    height: 1.25rem;
    font-size: var(--text-xs);
  }

  .TagChip--md {
    height: 1.5rem;
    font-size: var(--text-sm);
  }

  .TagChip--removable {
    padding-inline-end: var(--space-0-5);
  }

  .TagChip__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .TagChip__hash {
    opacity: var(--editor-tag-hash-opacity);
  }

  .TagChip--clickable {
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .TagChip--clickable:hover {
    color: var(--editor-tag-text-hover);
    background-color: var(--editor-tag-bg-hover);
  }

  .TagChip--clickable:focus-visible,
  .TagChip__remove:focus-visible {
    outline: 2px solid var(--focus-ring);
  }

  /* 16px hit area around a 12px icon. */
  .TagChip__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-sm);
    color: inherit;
    opacity: 0.7;
  }

  .TagChip__remove:hover,
  .TagChip__remove:focus-visible {
    opacity: 1;
  }

  .TagChip__remove:hover {
    background-color: var(--editor-tag-bg-hover);
  }

  .TagChip__remove :global(svg) {
    width: 0.75rem;
    height: 0.75rem;
    color: inherit;
  }
</style>

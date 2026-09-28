<script lang="ts">
  import { format_hotkey_for_display } from "$lib/features/hotkey/domain/hotkey_validation";

  type Props = {
    hotkey: string;
  };

  let { hotkey }: Props = $props();

  // Split before formatting. Plus formats to "+", which would break the split.
  const parts = $derived(
    hotkey.split("+").map((part) => format_hotkey_for_display(part)),
  );
</script>

<span class="HotkeyKey">
  {#each parts as part, i (i)}
    <kbd class="HotkeyKey__kbd">{part}</kbd>
    {#if i < parts.length - 1}
      <span class="HotkeyKey__separator">+</span>
    {/if}
  {/each}
</span>

<style>
  .HotkeyKey {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .HotkeyKey__kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2em;
    height: 2em;
    padding: 0 var(--space-2);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    background-color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    line-height: 1;
    white-space: nowrap;
    box-shadow: 0 1px 0 var(--border);
  }

  .HotkeyKey__separator {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1;
  }
</style>

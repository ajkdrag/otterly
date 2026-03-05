<script lang="ts">
  import LinksPanel from "$lib/features/links/ui/links_panel.svelte";
  import { OutlinePanel } from "$lib/features/outline";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores } = use_app_context();

  const tabs = [
    { id: "links" as const, label: "Links" },
    { id: "outline" as const, label: "Outline" },
  ];
</script>

<div class="ContextRail">
  <div class="ContextRail__tabs">
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        class="ContextRail__tab"
        class:ContextRail__tab--active={stores.ui.context_rail_tab === tab.id}
        onclick={() => stores.ui.set_context_rail_tab(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>
  <div class="ContextRail__panel">
    {#if stores.ui.context_rail_tab === "links"}
      <LinksPanel />
    {:else if stores.ui.context_rail_tab === "outline"}
      <OutlinePanel />
    {/if}
  </div>
</div>

<style>
  .ContextRail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
  }

  .ContextRail__tabs {
    display: flex;
    align-items: center;
    height: var(--size-touch-lg);
    border-block-end: 1px solid var(--border);
    padding-inline: 0;
    flex-shrink: 0;
  }

  .ContextRail__tab {
    display: flex;
    align-items: center;
    height: 100%;
    padding-inline: var(--space-3);
    border: none;
    background: none;
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-block-end: 2px solid transparent;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .ContextRail__tab:hover {
    color: var(--foreground);
  }

  .ContextRail__tab--active {
    color: var(--interactive);
    border-block-end-color: var(--interactive);
  }

  .ContextRail__panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding-block-start: var(--space-2);
  }
</style>

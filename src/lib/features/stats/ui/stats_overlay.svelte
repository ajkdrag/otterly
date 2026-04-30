<script lang="ts">
  import StatsDashboard from "$lib/features/stats/ui/stats_dashboard.svelte";
  import { X } from "@lucide/svelte";

  type Props = {
    open: boolean;
    on_close: () => void;
  };

  let { open, on_close }: Props = $props();

  function handle_backdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("StatsOverlay")) {
      on_close();
    }
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      on_close();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="StatsOverlay"
    onclick={handle_backdrop}
    onkeydown={handle_keydown}
  >
    <div class="StatsOverlay__panel">
      <button
        type="button"
        class="StatsOverlay__close"
        onclick={on_close}
        aria-label="Close statistics"
      >
        <X />
      </button>
      <StatsDashboard />
    </div>
  </div>
{/if}

<style>
  .StatsOverlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .StatsOverlay__panel {
    position: relative;
    width: min(90vw, 720px);
    height: min(85vh, 800px);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .StatsOverlay__close {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: var(--muted);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .StatsOverlay__close:hover {
    background: var(--destructive);
    color: white;
  }

  :global(.StatsOverlay__close svg) {
    width: 16px;
    height: 16px;
  }
</style>

<script lang="ts">
  import { Download, RotateCw } from "@lucide/svelte";
  import type { UpdateStatus } from "$lib/features/updater/state/updater_store.svelte";
  import {
    update_download_percent,
    update_status_label,
  } from "$lib/features/updater/domain/update_status_label";

  // The updater's item in the status bar: checking, the download with its
  // progress, then a Restart button that stays until you use it, also after
  // "Later" on the toast.
  interface Props {
    status: UpdateStatus;
    on_restart: () => void;
  }

  let { status, on_restart }: Props = $props();

  const label = $derived(update_status_label(status));
  const percent = $derived(update_download_percent(status));
</script>

{#if status.kind === "ready"}
  <button
    type="button"
    class="StatusBar__button text-primary"
    onclick={on_restart}
    title="Restart Otterly to finish updating"
  >
    <RotateCw />
    <span>{label}</span>
  </button>
  <span class="StatusBar__separator" aria-hidden="true"></span>
{:else if label}
  <span class="StatusBar__item text-primary" role="status">
    <Download />
    <span>{label}</span>
    {#if percent !== null}
      <span
        class="h-1 w-12 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <span
          class="block h-full rounded-full bg-primary transition-[width]"
          style:width="{percent}%"
        ></span>
      </span>
    {/if}
  </span>
  <span class="StatusBar__separator" aria-hidden="true"></span>
{/if}

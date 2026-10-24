<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  type Props = {
    tags: string[];
  };

  let { tags }: Props = $props();

  const { action_registry } = use_app_context();

  function open_tag(tag: string) {
    void action_registry.execute(ACTION_IDS.tags_open_tag, tag);
  }
</script>

{#if tags.length === 0}
  <p class="py-1 pr-3 pl-6 text-xs text-muted-foreground">No tags</p>
{:else}
  <div class="flex flex-wrap gap-1 px-3 py-1">
    {#each tags as tag (tag)}
      <button
        type="button"
        class="max-w-full truncate rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
        onclick={() => open_tag(tag)}
      >
        #{tag}
      </button>
    {/each}
  </div>
{/if}

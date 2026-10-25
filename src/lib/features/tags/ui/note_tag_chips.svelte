<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import TagChip from "$lib/features/tags/ui/tag_chip.svelte";

  type Props = {
    tags: string[];
  };

  let { tags }: Props = $props();

  const { action_registry } = use_app_context();

  function search_tag(tag: string) {
    void action_registry.execute(ACTION_IDS.omnibar_open_tags, {
      tags: [tag],
    });
  }
</script>

{#if tags.length === 0}
  <p class="py-1 pr-3 pl-6 text-xs text-muted-foreground">No tags</p>
{:else}
  <div class="flex flex-wrap gap-1 px-3 py-1">
    {#each tags as tag (tag)}
      <TagChip
        {tag}
        size="sm"
        title={`Search notes tagged #${tag}`}
        onclick={() => {
          search_tag(tag);
        }}
      />
    {/each}
  </div>
{/if}

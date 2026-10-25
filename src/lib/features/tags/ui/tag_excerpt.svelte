<script lang="ts">
  import { split_text_on_tag } from "$lib/features/tags/domain/split_text_on_tag";

  type Props = {
    text: string;
    tags: readonly string[];
  };

  let { text, tags }: Props = $props();

  const parts = $derived(split_text_on_tag(text, tags));
</script>

<!-- No wrapper: the caller's own element sets the font, clamp and ellipsis. -->
{#each parts as part, index (index)}{#if part.is_tag}<span
      class="TagExcerpt__tag">{part.text}</span
    >{:else}{part.text}{/if}{/each}

<style>
  .TagExcerpt__tag {
    color: var(--editor-tag-text);
  }
</style>

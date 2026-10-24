<script lang="ts">
  import LinkSection from "$lib/features/links/ui/link_section.svelte";
  import LinkItem from "$lib/features/links/ui/link_item.svelte";
  import { NoteTagChips } from "$lib/features/tags";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  // The tags store keeps the previous note's tags until the rail computes the
  // new ones, so only show tags that belong to the open note.
  const note_tags = $derived(
    stores.tags.note_tags_path === (stores.editor.open_note?.meta.path ?? null)
      ? stores.tags.note_tags
      : [],
  );

  const global_status = $derived(stores.links.global_status);
  const global_error = $derived(stores.links.global_error);

  const backlinks = $derived(stores.links.backlinks);
  const global_outlinks = $derived(stores.links.outlinks);
  const local_outlink_paths = $derived(stores.links.local_outlink_paths);
  const orphan_links = $derived(stores.links.orphan_links);
  const external_links = $derived(stores.links.external_links);
  const outlinks = $derived.by(() =>
    global_status === "ready"
      ? global_outlinks.map((entry) => entry.path)
      : local_outlink_paths,
  );

  function open_existing_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }

  function open_or_create_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open_wiki_link, path);
  }

  function open_url(url: string) {
    void action_registry.execute(ACTION_IDS.shell_open_url, url);
  }

  function title_from_path(path: string): string {
    const leaf = path.split("/").pop() ?? path;
    return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
  }
</script>

<div class="LinksPanel">
  <LinkSection title="Tags" count={note_tags.length}>
    <NoteTagChips tags={note_tags} />
  </LinkSection>

  <LinkSection title="Backlinks" count={backlinks.length}>
    {#if global_status === "loading"}
      <p class="LinksPanel__loading">Loading backlinks...</p>
    {:else if global_status === "error"}
      <p class="LinksPanel__error">
        {global_error ?? "Backlinks unavailable"}
      </p>
    {:else if backlinks.length === 0}
      <p class="LinksPanel__empty">No backlinks</p>
    {:else}
      {#each backlinks as link (link.path)}
        <LinkItem
          title={link.title}
          path={link.path}
          backlink
          onclick={() => open_existing_note(link.path)}
        />
      {/each}
    {/if}
  </LinkSection>

  <LinkSection title="Outlinks" count={outlinks.length}>
    {#if outlinks.length === 0}
      <p class="LinksPanel__empty">No outlinks</p>
    {:else if global_status === "ready"}
      {#each global_outlinks as link (link.path)}
        <LinkItem
          title={link.title}
          path={link.path}
          onclick={() => open_existing_note(link.path)}
        />
      {/each}
    {:else}
      {#each outlinks as path (path)}
        <LinkItem
          title={title_from_path(path)}
          {path}
          onclick={() => open_or_create_note(path)}
        />
      {/each}
    {/if}
  </LinkSection>

  <LinkSection
    title="Planned"
    count={orphan_links.length}
    default_expanded={true}
  >
    {#if global_status === "loading"}
      <p class="LinksPanel__loading">Loading planned notes...</p>
    {:else if global_status === "error"}
      <p class="LinksPanel__error">
        {global_error ?? "Planned notes unavailable"}
      </p>
    {:else if orphan_links.length === 0}
      <p class="LinksPanel__empty">No planned notes</p>
    {:else}
      {#each orphan_links as link (link.target_path)}
        <LinkItem
          title={title_from_path(link.target_path)}
          path={link.target_path}
          meta={`${String(link.ref_count)} refs`}
          onclick={() => open_or_create_note(link.target_path)}
        />
      {/each}
    {/if}
  </LinkSection>

  <LinkSection
    title="External"
    count={external_links.length}
    default_expanded={false}
  >
    {#if external_links.length === 0}
      <p class="LinksPanel__empty">No external links</p>
    {:else}
      {#each external_links as link (link.url)}
        <LinkItem
          title={link.text}
          path={link.url}
          external
          onclick={() => open_url(link.url)}
        />
      {/each}
    {/if}
  </LinkSection>
</div>

<style>
  .LinksPanel {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .LinksPanel__empty {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }

  .LinksPanel__loading {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }

  .LinksPanel__error {
    font-size: var(--text-xs);
    color: var(--destructive);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }
</style>

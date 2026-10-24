<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ArrowDownAZIcon from "@lucide/svelte/icons/arrow-down-a-z";
  import ArrowDownWideNarrowIcon from "@lucide/svelte/icons/arrow-down-wide-narrow";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { TagCount } from "$lib/features/tags/types/tag";

  const { stores, action_registry } = use_app_context();

  // Filter and sort live here, not in a store. The panel stays mounted while
  // the sidebar shows tags, so they survive opening a tag and going back.
  let filter_text = $state("");
  let sort_mode = $state<"count" | "name">("count");
  const sort_toggle_label = $derived(
    sort_mode === "count" ? "Sort by name" : "Sort by count",
  );

  const tags = $derived(stores.tags.tags);
  const tags_status = $derived(stores.tags.tags_status);
  const selected_tag = $derived(stores.tags.selected_tag);
  const tagged_notes = $derived(stores.tags.tagged_notes);
  const tagged_notes_status = $derived(stores.tags.tagged_notes_status);
  const indexing = $derived(stores.search.index_progress.status === "indexing");
  const open_note_path = $derived(stores.editor.open_note?.meta.path ?? null);

  // @Speed: The list is plain, not virtualized. Virtualize it if a vault with
  // thousands of tags feels slow.
  const visible_tags = $derived.by(() => {
    const query = filter_text.trim().replace(/^#/, "").toLowerCase();
    const matching = query
      ? tags.filter((entry) => entry.tag.toLowerCase().includes(query))
      : tags;
    return [...matching].sort(sort_mode === "count" ? by_count : by_name);
  });

  function by_name(a: TagCount, b: TagCount): number {
    return a.tag.localeCompare(b.tag, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function by_count(a: TagCount, b: TagCount): number {
    return b.count - a.count || by_name(a, b);
  }

  function parent_folder(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
  }

  function open_tag(tag: string) {
    void action_registry.execute(ACTION_IDS.tags_open_tag, tag);
  }

  function close_tag() {
    void action_registry.execute(ACTION_IDS.tags_close_tag);
  }

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  {#if selected_tag === null}
    <div class="flex items-center gap-1 px-2 pb-2">
      <Input
        bind:value={filter_text}
        placeholder="Filter tags…"
        aria-label="Filter tags"
        class="h-8"
        onkeydown={(event) => {
          if (event.key === "Escape") filter_text = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={sort_toggle_label}
        title={sort_toggle_label}
        onclick={() => (sort_mode = sort_mode === "count" ? "name" : "count")}
      >
        {#if sort_mode === "count"}
          <ArrowDownWideNarrowIcon />
        {:else}
          <ArrowDownAZIcon />
        {/if}
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-1">
      {#if tags_status === "error"}
        <p class="px-2 py-1 text-xs text-destructive">
          {stores.tags.tags_error ?? "Could not load tags"}
        </p>
      {:else if tags.length === 0}
        {#if indexing}
          <p class="px-2 py-1 text-xs text-muted-foreground">Indexing…</p>
        {:else if tags_status === "ready"}
          <p class="px-2 py-1 text-xs text-muted-foreground">
            No tags yet. Type #tag in a note.
          </p>
        {/if}
      {:else if visible_tags.length === 0}
        <p class="px-2 py-1 text-xs text-muted-foreground">No tags match</p>
      {:else}
        {#each visible_tags as entry (entry.tag)}
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onclick={() => open_tag(entry.tag)}
          >
            <span class="min-w-0 flex-1 truncate">#{entry.tag}</span>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
              {entry.count}
            </span>
          </button>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="flex flex-col gap-1 px-2 pb-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-7 self-start px-2 text-muted-foreground"
        onclick={close_tag}
      >
        <ArrowLeftIcon />
        All tags
      </Button>
      <p class="truncate px-1 text-sm font-medium">
        #{selected_tag}
        {#if tagged_notes_status === "ready"}
          <span class="font-normal text-muted-foreground">
            · {tagged_notes.length}
            {tagged_notes.length === 1 ? "note" : "notes"}
          </span>
        {/if}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-1">
      {#if tagged_notes_status === "error"}
        <p class="px-2 py-1 text-xs text-destructive">
          Could not load notes with #{selected_tag}
        </p>
      {:else if tagged_notes_status === "ready" && tagged_notes.length === 0}
        <p class="px-2 py-1 text-xs text-muted-foreground">
          No notes with #{selected_tag}
        </p>
      {:else}
        {#each tagged_notes as entry (entry.note.path)}
          {@const folder = parent_folder(entry.note.path)}
          {@const is_open = entry.note.path === open_note_path}
          <button
            type="button"
            class={[
              "flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground",
              is_open && "bg-accent text-accent-foreground",
            ]}
            aria-current={is_open ? "true" : undefined}
            onclick={() => open_note(entry.note.path)}
          >
            <span class="truncate text-sm">
              {entry.note.title || entry.note.name}
            </span>
            {#if folder}
              <span class="truncate text-xs text-muted-foreground">
                {folder}
              </span>
            {/if}
            {#if entry.excerpt}
              <span class="line-clamp-2 text-xs text-muted-foreground">
                {entry.excerpt}
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<script lang="ts">
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ArrowDownAZIcon from "@lucide/svelte/icons/arrow-down-a-z";
  import ArrowDownWideNarrowIcon from "@lucide/svelte/icons/arrow-down-wide-narrow";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import SearchIcon from "@lucide/svelte/icons/search";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { format_hotkey_for_display } from "$lib/features/hotkey";
  import { tag_key } from "$lib/features/tags/domain/tag_key";
  import type { TagCount } from "$lib/features/tags/types/tag";
  import TagChip from "$lib/features/tags/ui/tag_chip.svelte";
  import TagExcerpt from "$lib/features/tags/ui/tag_excerpt.svelte";
  import { picker_shortcut_step } from "$lib/shared/utils/picker_navigation";

  const { stores, action_registry } = use_app_context();

  // The list renders at most this many rows, with a count row under them.
  // Typing narrows a bigger list, and a bounded list is simpler than a
  // virtual one.
  const MAX_TAG_ROWS = 500;
  const search_key = format_hotkey_for_display("CmdOrCtrl+↵");

  // Filter, sort and the keyboard rows live here, not in a store. The panel
  // stays mounted while the sidebar shows tags, so they survive opening a tag
  // and going back.
  let filter_text = $state("");
  let sort_mode = $state<"count" | "name">("count");
  const sort_toggle_label = $derived(
    sort_mode === "count" ? "Sort by name" : "Sort by count",
  );

  // Focus stays in the filter input (list) or on the notes listbox
  // (drill-down). The active row is an active descendant of either.
  let active_tag_index = $state(0);
  let active_note_index = $state(0);
  // Set by enter_tag. The notes arrive over IPC and the list does not exist
  // before that, so the focus move waits for them (see the effect below).
  let entering_tag = $state(false);
  let filter_input: HTMLInputElement | null = $state(null);
  let notes_listbox: HTMLElement | null = $state(null);
  let back_button: HTMLElement | null = $state(null);

  const tags = $derived(stores.tags.tags);
  const tags_status = $derived(stores.tags.tags_status);
  const selected_tag = $derived(stores.tags.selected_tag);
  const tagged_notes = $derived(stores.tags.tagged_notes);
  const tagged_notes_total = $derived(stores.tags.tagged_notes_total);
  const tagged_notes_status = $derived(stores.tags.tagged_notes_status);
  const indexing = $derived(stores.search.index_progress.status === "indexing");
  const open_note_path = $derived(stores.editor.open_note?.meta.path ?? null);

  // localeCompare with options builds a new collator on every call, which is
  // about 20x slower than reusing one over thousands of tags. The list sorts
  // again on every keystroke and every autosave.
  const tag_name_collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  // Same identity as the index (NFC + lowercase), because the stored spelling
  // of a tag can be NFD, for example when it was pasted from a macOS file name.
  const filter_query = $derived(tag_key(filter_text.trim().replace(/^#/, "")));
  const visible_tags = $derived.by(() => {
    const matching = filter_query
      ? tags.filter((entry) => tag_key(entry.tag).includes(filter_query))
      : tags;
    return [...matching].sort(sort_mode === "count" ? by_count : by_name);
  });
  const shown_tags = $derived(visible_tags.slice(0, MAX_TAG_ROWS));
  const tag_row = $derived(
    Math.max(0, Math.min(active_tag_index, shown_tags.length - 1)),
  );
  const note_row = $derived(
    Math.max(0, Math.min(active_note_index, tagged_notes.length - 1)),
  );

  function by_name(a: TagCount, b: TagCount): number {
    return tag_name_collator.compare(a.tag, b.tag);
  }

  function by_count(a: TagCount, b: TagCount): number {
    return b.count - a.count || by_name(a, b);
  }

  // Splits the tag around the filter match so the match can be bold. Skips
  // tags whose key changes length (NFD, odd lowercase), where indexes would
  // not line up.
  function split_on_match(tag: string): [string, string, string] {
    const key = tag_key(tag);
    const index = filter_query ? key.indexOf(filter_query) : -1;
    if (index < 0 || key.length !== tag.length) return [tag, "", ""];
    const end = index + filter_query.length;
    return [tag.slice(0, index), tag.slice(index, end), tag.slice(end)];
  }

  function parent_folder(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
  }

  function arrow_step(event: KeyboardEvent): 1 | -1 | null {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return null;
    if (event.key === "ArrowDown") return 1;
    if (event.key === "ArrowUp") return -1;
    return null;
  }

  function is_mod_enter(event: KeyboardEvent): boolean {
    return event.key === "Enter" && (event.metaKey || event.ctrlKey);
  }

  function scroll_row_into_view(id: string) {
    void tick().then(() => {
      document.getElementById(id)?.scrollIntoView?.({ block: "nearest" });
    });
  }

  function enter_tag(tag: string) {
    active_note_index = 0;
    entering_tag = true;
    void action_registry.execute(ACTION_IDS.tags_open_tag, tag);
  }

  function leave_tag() {
    const tag = selected_tag;
    entering_tag = false;
    void action_registry.execute(ACTION_IDS.tags_close_tag);
    active_tag_index = Math.max(
      0,
      shown_tags.findIndex((entry) => entry.tag === tag),
    );
    scroll_row_into_view(`tags-pane-tag-${String(active_tag_index)}`);
    void tick().then(() => filter_input?.focus());
  }

  function search_tag(tag: string) {
    void action_registry.execute(ACTION_IDS.omnibar_open_tags, {
      tags: [tag],
    });
  }

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.tags_open_note, path);
  }

  function on_filter_keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const step = picker_shortcut_step(event) ?? arrow_step(event);
    if (step !== null) {
      event.preventDefault();
      active_tag_index = Math.max(
        0,
        Math.min(tag_row + step, shown_tags.length - 1),
      );
      scroll_row_into_view(`tags-pane-tag-${String(active_tag_index)}`);
      return;
    }
    if (event.key === "Enter") {
      const entry = shown_tags[tag_row];
      if (!entry) return;
      event.preventDefault();
      if (is_mod_enter(event)) search_tag(entry.tag);
      else enter_tag(entry.tag);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (filter_text) {
        filter_text = "";
        active_tag_index = 0;
      } else {
        void action_registry.execute(ACTION_IDS.tags_leave_pane);
      }
    }
  }

  async function on_notes_keydown(event: KeyboardEvent) {
    if (event.isComposing || selected_tag === null) return;
    const step = picker_shortcut_step(event) ?? arrow_step(event);
    const last = tagged_notes.length - 1;
    let next_row: number | null = null;
    if (step !== null) next_row = Math.max(0, Math.min(note_row + step, last));
    if (event.key === "Home") next_row = 0;
    if (event.key === "End") next_row = Math.max(0, last);
    if (next_row !== null) {
      event.preventDefault();
      active_note_index = next_row;
      scroll_row_into_view(`tags-pane-note-${String(next_row)}`);
      return;
    }

    if (event.key === "Escape" || event.key === "Backspace") {
      event.preventDefault();
      leave_tag();
      return;
    }
    if (is_mod_enter(event)) {
      event.preventDefault();
      search_tag(selected_tag);
      return;
    }
    const entry = tagged_notes[note_row];
    if (!entry) return;
    if (event.key === "Enter") {
      event.preventDefault();
      await action_registry.execute(ACTION_IDS.tags_open_note, entry.note.path);
      void action_registry.execute(ACTION_IDS.tags_leave_pane);
      return;
    }
    // Space previews: the note opens and the list keeps focus.
    if (event.key === " ") {
      event.preventDefault();
      await action_registry.execute(ACTION_IDS.tags_open_note, entry.note.path);
      notes_listbox?.focus();
    }
  }

  // Where focus goes when the pane is entered: the filter, the notes list, or
  // the Back button for a tag with no notes. Null while the notes still load
  // or the element is not bound yet.
  function pane_focus_target(): HTMLElement | null {
    if (selected_tag === null) return filter_input;
    if (tagged_notes_status === "idle" || tagged_notes_status === "loading")
      return null;
    return tagged_notes.length > 0 ? notes_listbox : back_button;
  }

  // The flag means "move focus into the pane now". It is one shot, so the pane
  // mounting again later does not steal focus.
  //
  // The palette closes the omnibar and sets the flag in the same tick. This
  // effect runs before the dialog lets go of its focus trap (the pane comes
  // first in the tree), so focusing right away is pulled back into the dialog
  // and the omnibar then hands focus to the editor. Focusing one frame later
  // wins in either order, because the omnibar's restore sees the pane has focus.
  $effect(() => {
    if (!stores.ui.tags_pane_focus_pending || stores.ui.omnibar.open) return;
    const target = pane_focus_target();
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      target.focus();
      stores.ui.tags_pane_focus_pending = false;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  // A pane that closes before it could take focus must not take it when it
  // opens later.
  $effect(() => () => {
    stores.ui.tags_pane_focus_pending = false;
  });

  // After entering a tag, with the notes in: put the active row on the open
  // note and focus the list.
  $effect(() => {
    if (!entering_tag) return;
    const target = pane_focus_target();
    if (!target) return;
    if (target === notes_listbox) {
      active_note_index = Math.max(
        0,
        tagged_notes.findIndex((entry) => entry.note.path === open_note_path),
      );
    }
    target.focus();
    entering_tag = false;
  });
</script>

<div class="group flex h-full min-h-0 flex-col">
  {#if selected_tag === null}
    <div class="flex items-center gap-1 px-2 pb-2">
      <Input
        bind:ref={filter_input}
        bind:value={filter_text}
        placeholder="Filter tags…"
        aria-label="Filter tags"
        role="combobox"
        aria-expanded={shown_tags.length > 0}
        aria-controls="tags-pane-list"
        aria-activedescendant={shown_tags[tag_row]
          ? `tags-pane-tag-${String(tag_row)}`
          : undefined}
        data-picker-keys
        class="h-8"
        oninput={() => (active_tag_index = 0)}
        onkeydown={on_filter_keydown}
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
          Couldn't load tags. Use Refresh to try again.
        </p>
      {:else if tags.length === 0}
        {#if indexing}
          <p class="px-2 py-1 text-xs text-muted-foreground">Indexing notes…</p>
        {:else if tags_status === "ready"}
          <div class="px-2 py-1 text-xs text-muted-foreground">
            <p class="font-medium text-foreground">No tags yet</p>
            <p>Type #tag in any note to tag it.</p>
          </div>
        {/if}
      {:else if visible_tags.length === 0}
        <div class="px-2 py-1 text-xs text-muted-foreground">
          <p>No tags match "{filter_text.trim()}"</p>
          <p>Esc clears the filter</p>
        </div>
      {:else}
        <div id="tags-pane-list" role="listbox" aria-label="Tags">
          {#each shown_tags as entry, index (entry.tag)}
            {@const [before, match, after] = split_on_match(entry.tag)}
            <button
              id={`tags-pane-tag-${String(index)}`}
              type="button"
              role="option"
              tabindex="-1"
              aria-selected={index === tag_row}
              class={[
                "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                index === tag_row &&
                  "group-focus-within:bg-sidebar-accent group-focus-within:text-sidebar-accent-foreground",
              ]}
              onclick={() => enter_tag(entry.tag)}
            >
              <span class="min-w-0 flex-1 truncate"
                ><span class="text-muted-foreground">#</span>{before}<span
                  class="font-semibold">{match}</span
                >{after}</span
              >
              <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
                {entry.count}
              </span>
            </button>
          {/each}
        </div>
        {#if visible_tags.length > MAX_TAG_ROWS}
          <p class="px-2 py-1 text-xs text-muted-foreground">
            Showing {MAX_TAG_ROWS} of {visible_tags.length.toLocaleString()} tags.
            Type to filter.
          </p>
        {/if}
      {/if}
    </div>
    <p
      class="hidden px-3 py-1 text-xs text-muted-foreground group-focus-within:block"
    >
      ↑↓ Move · ↵ Open · {search_key} Search · Esc {filter_text
        ? "Clear"
        : "Back to note"}
    </p>
  {:else}
    <div class="flex flex-col gap-1 px-2 pb-2">
      <Button
        bind:ref={back_button}
        variant="ghost"
        size="sm"
        class="h-7 self-start px-2 text-muted-foreground"
        onclick={leave_tag}
      >
        <ArrowLeftIcon />
        All tags
      </Button>
      <div class="flex min-w-0 items-center gap-2 px-1">
        <TagChip tag={selected_tag} size="sm" />
        {#if tagged_notes_status === "ready"}
          <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
            {tagged_notes_total.toLocaleString()}
            {tagged_notes_total === 1 ? "note" : "notes"}
          </span>
        {/if}
        <Button
          variant="ghost"
          size="icon-sm"
          class="ml-auto shrink-0"
          aria-label={`Search within #${selected_tag}`}
          title={`Search within #${selected_tag} (${search_key})`}
          onclick={() => {
            if (selected_tag !== null) search_tag(selected_tag);
          }}
        >
          <SearchIcon />
        </Button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-1">
      {#if tagged_notes_status === "error"}
        <p class="px-2 py-1 text-xs text-destructive">
          Couldn't load notes with #{selected_tag}
        </p>
      {:else if tagged_notes.length === 0}
        <p class="px-2 py-1 text-xs text-muted-foreground">
          {tagged_notes_status === "ready"
            ? `No notes with #${selected_tag}`
            : "Loading…"}
        </p>
      {:else}
        <div
          bind:this={notes_listbox}
          role="listbox"
          tabindex="0"
          aria-label={`Notes tagged #${selected_tag}`}
          aria-activedescendant={`tags-pane-note-${String(note_row)}`}
          data-picker-keys
          class="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onkeydown={on_notes_keydown}
        >
          {#each tagged_notes as entry, index (entry.note.path)}
            {@const folder = parent_folder(entry.note.path)}
            {@const is_open = entry.note.path === open_note_path}
            <button
              id={`tags-pane-note-${String(index)}`}
              type="button"
              role="option"
              tabindex="-1"
              aria-selected={index === note_row}
              aria-current={is_open ? "true" : undefined}
              class={[
                "flex w-full flex-col gap-0.5 rounded-sm border-l-2 border-transparent px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                is_open && "border-interactive",
                index === note_row &&
                  "group-focus-within:bg-sidebar-accent group-focus-within:text-sidebar-accent-foreground",
              ]}
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
              {#if entry.snippet}
                <span class="line-clamp-2 text-xs text-muted-foreground">
                  <TagExcerpt text={entry.snippet} tags={[selected_tag]} />
                </span>
              {/if}
            </button>
          {/each}
        </div>
        {#if tagged_notes_total > tagged_notes.length}
          <p class="px-2 py-1 text-xs text-muted-foreground">
            Showing {tagged_notes.length.toLocaleString()} of {tagged_notes_total.toLocaleString()}
            notes. Search within #{selected_tag} to narrow it down.
          </p>
        {/if}
      {/if}
    </div>
    <p
      class="hidden px-3 py-1 text-xs text-muted-foreground group-focus-within:block"
    >
      ↑↓ Move · ↵ Open · Space Preview · {search_key} Search · Esc Back
    </p>
  {/if}
</div>

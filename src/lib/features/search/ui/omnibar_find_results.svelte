<script lang="ts">
  import { untrack } from "svelte";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import FileIcon from "@lucide/svelte/icons/file-text";
  import ReplaceIcon from "@lucide/svelte/icons/replace";
  import ReplaceAllIcon from "@lucide/svelte/icons/replace-all";
  import type { VaultFindResults } from "$lib/features/search/state/search_store.svelte";
  import type {
    VaultFindMatch,
    VaultFindMatchRow,
    VaultFindRow,
  } from "$lib/features/search/types/vault_find";
  import { format_hotkey_for_display } from "$lib/features/hotkey";
  import { trim_context_before } from "$lib/features/search/domain/match_context";
  import { build_replacement_preview } from "$lib/features/search/domain/replacement_preview";
  import { parent_folder_path } from "$lib/shared/utils/path";
  import { plural } from "$lib/shared/utils/plural";

  // The omnibar's Text mode list: a header, then every match grouped under
  // its file, virtualized. omnibar.svelte owns the rows, the selection and
  // the keyboard. It points the input's aria-activedescendant at the
  // `omnibar-find-row-<row_index>` ids below.

  type Props = {
    results: VaultFindResults;
    rows: VaultFindRow[];
    selected_row: VaultFindMatchRow | null;
    // The rows belong to an older request while the new one waits for its
    // debounce. They stay on screen, dimmed.
    stale: boolean;
    has_pattern: boolean;
    // Each match shows as old -> new. On while the replacement is not empty
    // or the replace input has focus, so an empty one reads as a deletion.
    preview_on: boolean;
    replacement: string;
    can_replace: boolean;
    git_enabled: boolean;
    // "#a and #b" while tag chips narrow the search, "" without chips.
    tag_list_label: string;
    include: string;
    is_indexing: boolean;
    on_open_match: (row: VaultFindMatchRow) => void;
    on_replace_match: (row: VaultFindMatchRow) => void;
    on_replace_file: (row: VaultFindMatchRow) => void;
  };

  let {
    results,
    rows,
    selected_row,
    stale,
    has_pattern,
    preview_on,
    replacement,
    can_replace,
    git_enabled,
    tag_list_label,
    include,
    is_indexing,
    on_open_match,
    on_replace_match,
    on_replace_file,
  }: Props = $props();

  // File rows and match rows share one fixed height, so the virtualizer
  // never measures. The rows are sized in rem, the virtualizer counts px.
  const ROW_HEIGHT_REM = 1.75;
  const OVERSCAN = 10;
  const row_height_px =
    ROW_HEIGHT_REM *
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

  // Key labels: glyphs on macOS, words elsewhere.
  const empty_hint = [
    `${format_hotkey_for_display("Alt+C")} Match case`,
    `${format_hotkey_for_display("Alt+W")} Whole word`,
    `${format_hotkey_for_display("Alt+R")} Regex`,
    "⇥ Replace",
  ].join(" · ");

  let scroll_element: HTMLDivElement | null = $state(null);

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 0,
    getScrollElement: () => scroll_element,
    estimateSize: () => row_height_px,
    overscan: OVERSCAN,
  });

  // setOptions updates the virtualizer store, which reruns this effect. Only
  // call it when the row count really changed, like virtual_file_tree does.
  let measured_count = -1;
  $effect(() => {
    const instance = $virtualizer;
    const count = rows.length;
    if (count === measured_count) return;
    measured_count = count;
    instance.setOptions({ count });
    instance.measure();
  });

  const virtual_rows = $derived.by(() => {
    void rows.length;
    return $virtualizer.getVirtualItems();
  });

  // Follow the selection, not the rows: a batch that inserts files above the
  // selected match must not scroll the list. The store is read untracked, or
  // every scroll would rerun this and pull the list back.
  const selected_key = $derived(selected_row?.key ?? null);
  $effect(() => {
    if (selected_key === null) return;
    const index = untrack(() => selected_row?.row_index);
    if (index === undefined) return;
    untrack(() => $virtualizer).scrollToIndex(index, { align: "auto" });
  });

  const error_text = $derived(results.error?.message ?? "");
  const is_truncated = $derived(results.stats?.truncated ?? false);

  const summary = $derived.by(() => {
    if (results.status === "idle" || results.status === "error") return "";
    const match_count = is_truncated
      ? `${results.match_count.toLocaleString()}+ results`
      : plural(results.match_count, "result", "results");
    const counts = `${match_count} in ${plural(results.files.length, "file", "files")}`;
    return results.status === "searching" ? `Searching… ${counts}` : counts;
  });

  // Live region text. Only the finished count, or every 50 ms batch would
  // queue another announcement.
  const announced_summary = $derived(
    results.status === "done" ? summary : error_text,
  );

  // Rust walks one vault and the file list comes from the index. While the
  // index is still being built, tagged notes can be missing from it.
  const show_indexing_note = $derived(is_indexing && tag_list_label !== "");

  function file_name(path: string) {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  // It follows the mode that produced the results, not the toggle, which may
  // have changed since.
  function replacement_preview(match: VaultFindMatch) {
    return build_replacement_preview(
      match,
      replacement,
      results.request?.regex ?? false,
      results.group_names,
    );
  }

  // Replace goes straight to disk. Only a git vault has a checkpoint to go
  // back to, so say it when there is none.
  function replace_label(label: string) {
    return git_enabled ? label : `${label} (cannot be undone)`;
  }

  // Rows never take focus. Focus stays in the input you were typing in, so
  // the preview and the keys keep working after a click.
  function keep_focus(event: MouseEvent) {
    event.preventDefault();
  }
</script>

<div class="flex min-h-0 flex-col">
  {#if summary}
    <div
      class="text-muted-foreground flex items-center gap-2 border-b px-4 py-1.5 text-xs"
    >
      <span class="min-w-0 flex-1 truncate">{summary}</span>
      {#if results.status === "done" && results.stats}
        <span class="shrink-0 tabular-nums"
          >{String(results.stats.elapsed_ms)} ms</span
        >
      {/if}
    </div>
  {/if}
  {#if is_truncated && results.stats}
    <p class="text-muted-foreground px-4 py-1 text-xs">
      Showing the first {results.stats.match_count.toLocaleString()}. Narrow the
      search to replace all.
    </p>
  {/if}
  {#if show_indexing_note}
    <p class="text-muted-foreground px-4 py-1 text-xs">
      Indexing notes. Some tagged notes may be missing.
    </p>
  {/if}

  <div
    bind:this={scroll_element}
    id="omnibar-results"
    role="listbox"
    tabindex="-1"
    aria-label="Find in vault results"
    class="max-h-[min(var(--size-dialog-list-height-lg),55vh)] min-h-24 overflow-y-auto [scrollbar-gutter:stable]"
  >
    <div
      class="relative w-full transition-opacity"
      class:opacity-50={stale}
      style="height: {$virtualizer.getTotalSize()}px"
    >
      {#each virtual_rows as virtual_row (rows[virtual_row.index]?.key ?? virtual_row.key)}
        {@const row = rows[virtual_row.index]}
        {#if row?.kind === "file"}
          <div
            role="presentation"
            class="absolute top-0 left-0 flex w-full items-center gap-2 px-4 text-sm"
            style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
            title={row.file.path}
            onmousedown={keep_focus}
          >
            <FileIcon class="text-muted-foreground size-4 shrink-0" />
            <span class="text-foreground shrink-0 truncate font-medium"
              >{file_name(row.file.path)}</span
            >
            <span class="text-muted-foreground min-w-0 flex-1 truncate text-xs"
              >{parent_folder_path(row.file.path)}</span
            >
            <span
              class="bg-secondary text-secondary-foreground shrink-0 rounded-full px-1.5 text-xs tabular-nums"
              >{row.file.matches.length}</span
            >
          </div>
        {:else if row?.kind === "match"}
          {@const context = trim_context_before(row.match.before)}
          <!-- The input owns the keyboard (aria-activedescendant), so a row
               only needs the click. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id="omnibar-find-row-{String(row.row_index)}"
            role="option"
            tabindex="-1"
            aria-selected={row.key === selected_row?.key}
            class="group hover:bg-accent/60 aria-selected:border-primary aria-selected:bg-(--interactive-bg) absolute top-0 left-0 flex w-full cursor-pointer items-center gap-2 border-s-2 border-transparent ps-4 pe-2 text-sm"
            style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
            onmousedown={keep_focus}
            onclick={() => {
              on_open_match(row);
            }}
          >
            <span
              class="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums"
              >{String(row.match.line)}</span
            >
            <!--
              The match never gets cut unless it alone is wider than the row.
              Width goes to the match first, then to the words before it (they
              shrink from the left: rtl puts the ellipsis there), and the text
              after it gets what is left. That box has a basis of 0, so it can
              never take width from the other two.
              The gap before the match is its own box, because the rtl box
              drops a trailing space. Keep the tags hugging their text: pre
              would show any space the formatter adds.
            -->
            <span class="flex min-w-0 flex-1">
              <span class="flex min-w-0">
                <span
                  class="text-muted-foreground overflow-hidden text-ellipsis whitespace-pre [direction:rtl]"
                  ><bdo dir="ltr">{context.text}</bdo></span
                >
                <span class="shrink-0">{context.gap}</span>
                <span
                  class="max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-pre"
                  >{#if preview_on}<del
                      class="bg-destructive/15 text-destructive line-through"
                      >{row.match.text}</del
                    ><ins class="bg-primary/15 text-foreground no-underline"
                      >{replacement_preview(row.match)}</ins
                    >{:else}<mark
                      class="text-foreground rounded-sm bg-(--editor-find-match-bg)"
                      >{row.match.text}</mark
                    >{/if}</span
                >
              </span>
              <span
                class="text-muted-foreground flex-1 overflow-hidden text-ellipsis whitespace-pre"
                >{row.match.after}</span
              >
            </span>
            {#if preview_on}
              <span
                class="hidden shrink-0 items-center gap-0.5 group-hover:flex group-aria-selected:flex"
              >
                <button
                  type="button"
                  tabindex="-1"
                  class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 items-center justify-center rounded-sm disabled:opacity-50"
                  aria-label={replace_label("Replace")}
                  title={replace_label("Replace")}
                  disabled={!can_replace}
                  onclick={(event) => {
                    event.stopPropagation();
                    on_replace_match(row);
                  }}
                >
                  <ReplaceIcon class="size-3.5" />
                </button>
                <button
                  type="button"
                  tabindex="-1"
                  class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 items-center justify-center rounded-sm disabled:opacity-50"
                  aria-label={replace_label("Replace in file")}
                  title={replace_label("Replace in file")}
                  disabled={!can_replace}
                  onclick={(event) => {
                    event.stopPropagation();
                    on_replace_file(row);
                  }}
                >
                  <ReplaceAllIcon class="size-3.5" />
                </button>
              </span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <!-- While stale, a new search is on its way: no "No results" flash. -->
    {#if rows.length === 0 && results.status !== "searching" && !stale}
      <div
        class="text-muted-foreground px-3 py-8 text-center text-sm"
        aria-hidden="true"
      >
        {#if !has_pattern}
          <p>Find text in every file</p>
          <p class="mt-1 text-xs">{empty_hint}</p>
        {:else if results.error}
          <p
            class="text-destructive break-words whitespace-pre-wrap"
            title={results.error.details}
          >
            {error_text}
          </p>
        {:else if results.status === "done"}
          <p>No results</p>
          {#if tag_list_label}
            <p class="mt-1 text-xs">Only in notes tagged {tag_list_label}</p>
          {/if}
          {#if include.trim()}
            <p class="mt-1 text-xs">Only in files matching {include.trim()}</p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {announced_summary}
  </div>
</div>

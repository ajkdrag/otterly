<script lang="ts">
  import Papa from "papaparse";

  interface Props {
    content: string;
    delimiter?: string;
  }

  let { content, delimiter = "" }: Props = $props();

  const ROW_HEIGHT = 32;
  const OVERSCAN = 5;

  let scroll_top = $state(0);
  let container_height = $state(600);
  let copied_cell = $state<string | null>(null);
  let copy_timer = $state<ReturnType<typeof setTimeout> | null>(null);
  let sort_column = $state<string | null>(null);
  let sort_direction = $state<"asc" | "desc" | null>(null);

  $effect(() => {
    return () => {
      if (copy_timer !== null) clearTimeout(copy_timer);
    };
  });

  const parsed = $derived(
    Papa.parse<Record<string, unknown>>(content, {
      header: true,
      dynamicTyping: true,
      delimiter,
      skipEmptyLines: true,
    }),
  );

  const headers = $derived(parsed.meta.fields ?? []);
  const raw_rows = $derived(parsed.data);

  const sorted_rows = $derived.by(() => {
    if (!sort_column || !sort_direction) return raw_rows;

    const col = sort_column;
    const dir = sort_direction;

    return [...raw_rows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === "asc" ? cmp : -cmp;
    });
  });

  const visible_start = $derived(
    Math.max(0, Math.floor(scroll_top / ROW_HEIGHT) - OVERSCAN),
  );
  const visible_count = $derived(
    Math.ceil(container_height / ROW_HEIGHT) + OVERSCAN * 2,
  );
  const visible_rows = $derived(
    sorted_rows.slice(visible_start, visible_start + visible_count),
  );
  const top_spacer = $derived(visible_start * ROW_HEIGHT);
  const bottom_spacer = $derived(
    Math.max(
      0,
      (sorted_rows.length - visible_start - visible_rows.length) * ROW_HEIGHT,
    ),
  );

  function on_scroll(e: Event) {
    const target = e.currentTarget as HTMLDivElement;
    scroll_top = target.scrollTop;
    container_height = target.clientHeight;
  }

  function cycle_sort(col: string) {
    if (sort_column !== col) {
      sort_column = col;
      sort_direction = "asc";
    } else if (sort_direction === "asc") {
      sort_direction = "desc";
    } else {
      sort_column = null;
      sort_direction = null;
    }
  }

  function sort_indicator(col: string): string {
    if (sort_column !== col || !sort_direction) return "";
    return sort_direction === "asc" ? " ↑" : " ↓";
  }

  async function copy_cell(value: unknown, key: string) {
    const text = value == null ? "" : String(value);
    try {
      await navigator.clipboard.writeText(text);
      if (copy_timer !== null) clearTimeout(copy_timer);
      copied_cell = key;
      copy_timer = setTimeout(() => {
        copied_cell = null;
        copy_timer = null;
      }, 600);
    } catch {
      // clipboard unavailable
    }
  }
</script>

<div class="CsvViewer">
  {#if headers.length === 0}
    <div class="CsvViewer__empty">
      <span>No data to display</span>
    </div>
  {:else}
    <div class="CsvViewer__table-wrapper" onscroll={on_scroll}>
      <table class="CsvViewer__table">
        <thead>
          <tr>
            {#each headers as col}
              <th
                class="CsvViewer__header-cell"
                onclick={() => cycle_sort(col)}
                title={col}
              >
                <span class="CsvViewer__header-text"
                  >{col}{sort_indicator(col)}</span
                >
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if top_spacer > 0}
            <tr style:height="{top_spacer}px" aria-hidden="true">
              <td colspan={headers.length}></td>
            </tr>
          {/if}

          {#each visible_rows as row, i}
            {@const abs_idx = visible_start + i}
            <tr
              class="CsvViewer__row"
              class:CsvViewer__row--alt={abs_idx % 2 === 1}
            >
              {#each headers as col}
                {@const val = row[col]}
                {@const key = `${abs_idx}__${col}`}
                <td
                  class="CsvViewer__cell"
                  class:CsvViewer__cell--copied={copied_cell === key}
                  onclick={() => copy_cell(val, key)}
                  title={val == null ? "" : String(val)}
                >
                  {val == null ? "" : String(val)}
                </td>
              {/each}
            </tr>
          {/each}

          {#if bottom_spacer > 0}
            <tr style:height="{bottom_spacer}px" aria-hidden="true">
              <td colspan={headers.length}></td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="CsvViewer__footer">
      <span>{raw_rows.length} rows</span>
    </div>
  {/if}
</div>

<style>
  .CsvViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background-color: var(--background);
    color: var(--foreground);
  }

  .CsvViewer__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .CsvViewer__table-wrapper {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .CsvViewer__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    table-layout: auto;
  }

  .CsvViewer__table thead {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .CsvViewer__header-cell {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    font-weight: 500;
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    background-color: var(--muted);
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .CsvViewer__header-cell:last-child {
    border-right: none;
  }

  .CsvViewer__header-cell:hover {
    background-color: var(--background-surface-3, var(--border));
    color: var(--foreground);
  }

  .CsvViewer__header-text {
    display: inline-block;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  .CsvViewer__row {
    height: 32px;
  }

  .CsvViewer__row--alt {
    background-color: color-mix(in oklch, var(--muted) 40%, transparent);
  }

  .CsvViewer__row:hover {
    background-color: color-mix(in oklch, var(--muted) 70%, transparent);
  }

  .CsvViewer__cell {
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    vertical-align: middle;
    transition: background-color var(--duration-fast, 100ms);
  }

  .CsvViewer__cell:last-child {
    border-right: none;
  }

  .CsvViewer__cell--copied {
    background-color: color-mix(
      in oklch,
      var(--interactive, #48a) 20%,
      transparent
    );
  }

  .CsvViewer__footer {
    display: flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-top: 1px solid var(--border);
    background-color: var(--muted);
    flex-shrink: 0;
  }
</style>

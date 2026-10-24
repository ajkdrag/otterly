<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { SvelteSet } from "svelte/reactivity";
  import {
    CaseSensitive,
    ChevronDown,
    ChevronRight,
    Ellipsis,
    ListCollapse,
    RefreshCw,
    Regex,
    Replace,
    ReplaceAll,
    WholeWord,
    X,
  } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type {
    VaultFindFile,
    VaultFindMatch,
  } from "$lib/features/search/types/vault_find";

  type ResultRow =
    | { kind: "file"; key: string; file: VaultFindFile; collapsed: boolean }
    | {
        kind: "match";
        key: string;
        file: VaultFindFile;
        match: VaultFindMatch;
      };

  const ROW_HEIGHT = 22;
  const OVERSCAN = 10;

  const { stores, action_registry } = use_app_context();
  const inputs = $derived(stores.ui.vault_find);
  const results = stores.search.vault_find;

  let find_input: HTMLInputElement | null = $state(null);
  let tree: HTMLDivElement | null = $state(null);
  // Collapsed files and the keyboard cursor are view state, so they stay here.
  const collapsed = new SvelteSet<string>();
  let active_index = $state(-1);

  const rows = $derived.by(() => {
    const out: ResultRow[] = [];
    for (const file of results.files) {
      const is_collapsed = collapsed.has(file.path);
      out.push({ kind: "file", key: file.path, file, collapsed: is_collapsed });
      if (is_collapsed) continue;
      for (const match of file.matches) {
        out.push({
          kind: "match",
          key: `${file.path}\n${String(match.index)}`,
          file,
          match,
        });
      }
    }
    return out;
  });

  const query_error = $derived(
    results.error?.kind === "invalid_glob" ? null : results.error,
  );
  const glob_error = $derived(
    results.error?.kind === "invalid_glob" ? results.error : null,
  );
  const summary = $derived.by(() => {
    if (results.status === "idle" || results.status === "error") return "";
    const matches = results.match_count;
    const files = results.files.length;
    const counts = `${String(matches)} ${matches === 1 ? "result" : "results"} in ${String(files)} ${files === 1 ? "file" : "files"}`;
    if (results.status === "searching") return `Searching... ${counts}`;
    if (!results.stats) return counts;
    return `${counts} (${String(results.stats.elapsed_ms)} ms)`;
  });
  const all_collapsed = $derived(
    results.files.length > 0 &&
      results.files.every((file) => collapsed.has(file.path)),
  );

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 0,
    getScrollElement: () => tree,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // setOptions updates the virtualizer store, which reruns this effect. Only
  // call it when the row count really changed, like virtual_file_tree does.
  let measured_count = -1;
  $effect(() => {
    const virtualizer_now = $virtualizer;
    const count = rows.length;
    if (count === measured_count) return;
    measured_count = count;
    virtualizer_now.setOptions({ count });
    virtualizer_now.measure();
  });

  const virtual_rows = $derived.by(() => {
    void rows.length;
    return $virtualizer.getVirtualItems();
  });

  // The vault_find.open action bumps the nonce to land you in the input.
  $effect(() => {
    void inputs.focus_nonce;
    const input = find_input;
    if (!input) return;
    input.focus();
    input.select();
  });

  // Keep the cursor on a real row while results stream in or get dismissed.
  $effect(() => {
    if (active_index >= rows.length) active_index = rows.length - 1;
  });

  function file_name(path: string) {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  function folder_of(path: string) {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? "" : path.slice(0, slash);
  }

  function toggle_option(option: "case_sensitive" | "whole_word" | "regex") {
    inputs[option] = !inputs[option];
  }

  // Match on event.code: Option+C types "ç" on macOS, so event.key is useless.
  function handle_option_keys(event: KeyboardEvent): boolean {
    if (!event.altKey || event.metaKey || event.ctrlKey) return false;
    const option =
      event.code === "KeyC"
        ? "case_sensitive"
        : event.code === "KeyW"
          ? "whole_word"
          : event.code === "KeyR"
            ? "regex"
            : null;
    if (!option) return false;
    event.preventDefault();
    toggle_option(option);
    return true;
  }

  function focus_tree(index: number) {
    if (rows.length === 0) return;
    set_active(index);
    tree?.focus();
  }

  function set_active(index: number) {
    active_index = Math.max(0, Math.min(rows.length - 1, index));
    $virtualizer.scrollToIndex(active_index, { align: "auto" });
  }

  function toggle_collapsed(path: string) {
    if (collapsed.has(path)) collapsed.delete(path);
    else collapsed.add(path);
  }

  function toggle_all_collapsed() {
    if (all_collapsed) {
      collapsed.clear();
      return;
    }
    for (const file of results.files) collapsed.add(file.path);
  }

  async function open_match(row: ResultRow, focus_editor: boolean) {
    if (row.kind !== "match") return;
    await action_registry.execute(ACTION_IDS.vault_find_open_match, {
      path: row.file.path,
      line: row.match.line,
      column: row.match.column,
      length: row.match.length,
      focus_editor,
    });
    // Opening a note focuses the editor. Take focus back after the editor
    // has selected the match, so Enter can walk through matches.
    if (!focus_editor) requestAnimationFrame(() => tree?.focus());
  }

  function dismiss(row: ResultRow) {
    void action_registry.execute(ACTION_IDS.vault_find_dismiss, {
      path: row.file.path,
      match_index: row.kind === "match" ? row.match.index : undefined,
    });
  }

  function replace_row(row: ResultRow) {
    if (row.kind === "match") {
      void action_registry.execute(ACTION_IDS.vault_find_replace_match, {
        path: row.file.path,
        match_index: row.match.index,
      });
      return;
    }
    void action_registry.execute(
      ACTION_IDS.vault_find_replace_file,
      row.file.path,
    );
  }

  function parent_file_index(index: number) {
    for (let current = index; current >= 0; current--) {
      if (rows[current]?.kind === "file") return current;
    }
    return 0;
  }

  function handle_tree_keydown(event: KeyboardEvent) {
    const row = rows[active_index];
    switch (event.key) {
      case "ArrowDown":
        set_active(active_index + 1);
        break;
      case "ArrowUp":
        if (active_index <= 0) {
          find_input?.focus();
          active_index = -1;
        } else {
          set_active(active_index - 1);
        }
        break;
      case "ArrowLeft":
        if (row?.kind === "match") set_active(parent_file_index(active_index));
        else if (row && !row.collapsed) toggle_collapsed(row.file.path);
        break;
      case "ArrowRight":
        if (row?.kind === "file" && row.collapsed)
          toggle_collapsed(row.file.path);
        else if (row?.kind === "file") set_active(active_index + 1);
        break;
      case "Enter":
        if (row?.kind === "file") toggle_collapsed(row.file.path);
        else if (row) void open_match(row, false);
        break;
      case "Delete":
      case "Backspace":
        if (row) dismiss(row);
        break;
      case "Escape":
        find_input?.focus();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function handle_find_keydown(event: KeyboardEvent) {
    if (handle_option_keys(event)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focus_tree(0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      void action_registry.execute(ACTION_IDS.vault_find_focus_editor);
    }
  }

  function handle_replace_keydown(event: KeyboardEvent) {
    if (handle_option_keys(event)) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void action_registry.execute(ACTION_IDS.vault_find_request_replace_all);
    }
  }
</script>

{#snippet option_toggle(
  option: "case_sensitive" | "whole_word" | "regex",
  label: string,
  Icon: typeof CaseSensitive,
)}
  <button
    type="button"
    class="text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-foreground aria-pressed:ring-ring flex size-5 items-center justify-center rounded-sm aria-pressed:ring-1"
    aria-pressed={inputs[option]}
    aria-label={label}
    title={label}
    onclick={() => {
      toggle_option(option);
    }}
  >
    <Icon class="size-3.5" />
  </button>
{/snippet}

<div class="flex h-full min-h-0 flex-col text-sm">
  <div class="flex gap-1 px-2 pt-2">
    <button
      type="button"
      class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-4 shrink-0 items-start justify-center rounded-sm pt-1.5"
      aria-label={inputs.replace_open ? "Hide replace" : "Show replace"}
      aria-expanded={inputs.replace_open}
      title="Toggle replace"
      onclick={() => {
        inputs.replace_open = !inputs.replace_open;
      }}
    >
      {#if inputs.replace_open}
        <ChevronDown class="size-3.5" />
      {:else}
        <ChevronRight class="size-3.5" />
      {/if}
    </button>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="relative">
        <Input
          bind:ref={find_input}
          class="h-7 pr-[4.75rem] text-xs md:text-xs"
          placeholder="Find in vault"
          aria-label="Find in vault"
          aria-invalid={query_error !== null}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          value={inputs.query}
          oninput={(event) => {
            inputs.query = event.currentTarget.value;
          }}
          onkeydown={handle_find_keydown}
        />
        <div
          class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5"
        >
          {@render option_toggle(
            "case_sensitive",
            "Match case (Alt+C)",
            CaseSensitive,
          )}
          {@render option_toggle(
            "whole_word",
            "Match whole word (Alt+W)",
            WholeWord,
          )}
          {@render option_toggle(
            "regex",
            "Use regular expression (Alt+R)",
            Regex,
          )}
        </div>
      </div>

      {#if inputs.replace_open}
        <div class="flex items-center gap-1">
          <Input
            class="h-7 text-xs md:text-xs"
            placeholder="Replace"
            aria-label="Replace"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            value={inputs.replacement}
            oninput={(event) => {
              inputs.replacement = event.currentTarget.value;
            }}
            onkeydown={handle_replace_keydown}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 shrink-0"
            aria-label="Replace all"
            title={results.stats?.truncated
              ? "Too many results to replace all. Narrow the search."
              : "Replace all (CmdOrCtrl+Enter)"}
            disabled={!results.can_replace_all ||
              stores.op.is_pending("vault_find.replace")}
            onclick={() => {
              void action_registry.execute(
                ACTION_IDS.vault_find_request_replace_all,
              );
            }}
          >
            <ReplaceAll class="size-4" />
          </Button>
        </div>
      {/if}

      {#if query_error}
        <p class="text-destructive text-xs break-words whitespace-pre-wrap">
          {query_error.message}
        </p>
      {/if}
    </div>
  </div>

  <div class="flex justify-end px-2">
    <button
      type="button"
      class="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm px-1"
      aria-label="Toggle files to include and exclude"
      aria-expanded={inputs.filters_open}
      title="Toggle search details"
      onclick={() => {
        inputs.filters_open = !inputs.filters_open;
      }}
    >
      <Ellipsis class="size-3.5" />
    </button>
  </div>

  {#if inputs.filters_open}
    <div class="flex flex-col gap-1 px-2 pb-1 pl-7">
      <label class="text-muted-foreground text-xs" for="vault-find-include">
        files to include
      </label>
      <Input
        id="vault-find-include"
        class="h-7 text-xs md:text-xs"
        placeholder="e.g. *.md, daily"
        aria-invalid={glob_error !== null}
        value={inputs.include}
        oninput={(event) => {
          inputs.include = event.currentTarget.value;
        }}
      />
      <label class="text-muted-foreground text-xs" for="vault-find-exclude">
        files to exclude
      </label>
      <Input
        id="vault-find-exclude"
        class="h-7 text-xs md:text-xs"
        placeholder="e.g. archive/**"
        aria-invalid={glob_error !== null}
        value={inputs.exclude}
        oninput={(event) => {
          inputs.exclude = event.currentTarget.value;
        }}
      />
      {#if glob_error}
        <p class="text-destructive text-xs break-words whitespace-pre-wrap">
          {glob_error.message}
        </p>
      {/if}
    </div>
  {/if}

  {#if summary}
    <div
      class="text-muted-foreground flex items-center gap-1 px-2 py-1 pl-7 text-xs"
    >
      <span class="min-w-0 flex-1 truncate" role="status">{summary}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-6"
        aria-label="Refresh"
        title="Refresh"
        onclick={() => {
          void action_registry.execute(ACTION_IDS.vault_find_refresh);
        }}
      >
        <RefreshCw class="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-6"
        aria-label={all_collapsed ? "Expand all" : "Collapse all"}
        title={all_collapsed ? "Expand all" : "Collapse all"}
        disabled={results.files.length === 0}
        onclick={toggle_all_collapsed}
      >
        <ListCollapse class="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-6"
        aria-label="Clear results"
        title="Clear results"
        onclick={() => {
          void action_registry.execute(ACTION_IDS.vault_find_clear);
        }}
      >
        <X class="size-3.5" />
      </Button>
    </div>
  {/if}

  {#if results.stats?.truncated}
    <p class="text-muted-foreground px-2 pb-1 pl-7 text-xs">
      Showing the first {results.stats.match_count.toLocaleString()} results. Narrow
      the search to see the rest.
    </p>
  {/if}

  {#if results.status === "done" && results.files.length === 0}
    <p class="text-muted-foreground px-2 py-1 pl-7 text-xs">No results.</p>
  {/if}

  <div
    bind:this={tree}
    class="min-h-0 flex-1 overflow-auto outline-none"
    role="tree"
    tabindex="0"
    aria-label="Find in vault results"
    aria-activedescendant={active_index >= 0
      ? `vault-find-row-${String(active_index)}`
      : undefined}
    onkeydown={handle_tree_keydown}
    onfocus={() => {
      if (active_index < 0 && rows.length > 0) active_index = 0;
    }}
  >
    <div
      class="relative w-full"
      style="height: {$virtualizer.getTotalSize()}px"
    >
      {#each virtual_rows as virtual_row (rows[virtual_row.index]?.key ?? virtual_row.key)}
        {@const row = rows[virtual_row.index]}
        {#if row}
          <!-- The tree container owns the keyboard: Up/Down/Left/Right/Enter. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id="vault-find-row-{String(virtual_row.index)}"
            class="group hover:bg-accent/60 aria-selected:bg-accent absolute top-0 left-0 flex w-full cursor-pointer items-center gap-1 pr-1 text-xs"
            style="height: {virtual_row.size}px; transform: translateY({virtual_row.start}px)"
            role="treeitem"
            aria-level={row.kind === "file" ? 1 : 2}
            aria-expanded={row.kind === "file" ? !row.collapsed : undefined}
            aria-selected={virtual_row.index === active_index}
            tabindex="-1"
            onclick={() => {
              active_index = virtual_row.index;
              if (row.kind === "file") toggle_collapsed(row.file.path);
              else void open_match(row, true);
            }}
          >
            {#if row.kind === "file"}
              <span
                class="text-muted-foreground flex w-5 shrink-0 justify-center"
              >
                {#if row.collapsed}
                  <ChevronRight class="size-3.5" />
                {:else}
                  <ChevronDown class="size-3.5" />
                {/if}
              </span>
              <span class="text-foreground shrink-0 truncate font-medium">
                {file_name(row.file.path)}
              </span>
              <span
                class="text-muted-foreground min-w-0 flex-1 truncate"
                title={row.file.path}
              >
                {folder_of(row.file.path)}
              </span>
              <span
                class="bg-secondary text-secondary-foreground rounded-full px-1.5 group-hover:hidden group-aria-selected:hidden"
              >
                {row.file.matches.length}
              </span>
            {:else}
              <span
                class="min-w-0 flex-1 truncate pl-7"
                title="Line {String(row.match.line)}"
              >
                <!-- No whitespace between these tags: it would show up in the preview. -->
                <span class="text-muted-foreground">{row.match.before}</span
                >{#if row.match.replacement !== null}<del
                    class="bg-destructive/15 text-destructive line-through"
                    >{row.match.text}</del
                  ><ins class="bg-primary/15 text-foreground no-underline"
                    >{row.match.replacement}</ins
                  >{:else}<mark
                    class="text-foreground rounded-sm bg-(--editor-find-match-bg)"
                    >{row.match.text}</mark
                  >{/if}<span class="text-muted-foreground"
                  >{row.match.after}</span
                >
              </span>
            {/if}
            <span
              class="hidden shrink-0 items-center group-hover:flex group-aria-selected:flex"
            >
              {#if inputs.replace_open}
                <button
                  type="button"
                  class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-5 items-center justify-center rounded-sm"
                  aria-label={row.kind === "file"
                    ? "Replace in file"
                    : "Replace"}
                  title={row.kind === "file" ? "Replace in file" : "Replace"}
                  tabindex="-1"
                  disabled={stores.op.is_pending("vault_find.replace")}
                  onclick={(event) => {
                    event.stopPropagation();
                    replace_row(row);
                  }}
                >
                  {#if row.kind === "file"}
                    <ReplaceAll class="size-3.5" />
                  {:else}
                    <Replace class="size-3.5" />
                  {/if}
                </button>
              {/if}
              <button
                type="button"
                class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-5 items-center justify-center rounded-sm"
                aria-label="Dismiss"
                title="Dismiss"
                tabindex="-1"
                onclick={(event) => {
                  event.stopPropagation();
                  dismiss(row);
                }}
              >
                <X class="size-3.5" />
              </button>
            </span>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button";
  import type { VimrcStatus } from "$lib/features/vim/types/vimrc";

  type Props = {
    enabled: boolean;
    repeat_held_keys: boolean;
    // null until the first load, which only runs while Vim mode is on or
    // after Reload.
    vimrc: VimrcStatus | null;
    // The last load failed. The previous vimrc stays applied.
    load_error: string | null;
    is_loading: boolean;
    on_toggle: (enabled: boolean) => void;
    on_toggle_repeat_held_keys: (repeat: boolean) => void;
    on_open_vimrc: () => void;
    on_reload_vimrc: () => void;
  };

  let {
    enabled,
    repeat_held_keys,
    vimrc,
    load_error,
    is_loading,
    on_toggle,
    on_toggle_repeat_held_keys,
    on_open_vimrc,
    on_reload_vimrc,
  }: Props = $props();

  // Only macOS opens an accent menu for a held letter.
  const is_mac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");

  // The lists belong to the last good load, so they are stale after a failure.
  const problems = $derived(load_error ? [] : (vimrc?.problems ?? []));
  const errors = $derived(problems.filter((p) => p.severity === "error"));
  const skipped = $derived(problems.filter((p) => p.severity === "skipped"));

  const lines = (count: number) => `${count} ${count === 1 ? "line" : "lines"}`;

  const status = $derived.by(() => {
    if (load_error) return `Could not read: ${load_error}`;
    if (!vimrc) return "Not loaded yet";
    if (!vimrc.exists) return "Not created yet";
    const parts = ["Applied"];
    if (errors.length > 0) parts.push(`${lines(errors.length)} not applied`);
    if (skipped.length > 0)
      parts.push(
        errors.length > 0
          ? `${skipped.length} skipped`
          : `${lines(skipped.length)} skipped`,
      );
    return parts.join(", ");
  });
</script>

<div class="flex flex-col">
  <div class="flex items-center justify-between gap-4 border-b py-4">
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-sm font-medium text-foreground">Vim mode</span>
      <span class="text-xs leading-snug text-muted-foreground"
        >Modal editing in notes and text files. Open document windows pick this
        up the next time they open.</span
      >
    </div>
    <Switch.Root
      aria-label="Vim mode"
      checked={enabled}
      onCheckedChange={on_toggle}
    />
  </div>

  {#if is_mac}
    <div class="flex items-center justify-between gap-4 border-b py-4">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-medium text-foreground">Repeat held keys</span
        >
        <span class="text-xs leading-snug text-muted-foreground"
          >Holding a letter repeats it, so holding l keeps moving right. This
          turns off the macOS accent menu in Otterly while Vim mode is on. If
          held keys still open the menu, restart Otterly.</span
        >
      </div>
      <Switch.Root
        aria-label="Repeat held keys"
        checked={repeat_held_keys}
        disabled={!enabled}
        onCheckedChange={on_toggle_repeat_held_keys}
      />
    </div>
  {/if}

  <div class="flex flex-col gap-3 py-4">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-medium text-foreground">vimrc</span>
      <span class="text-xs leading-snug text-muted-foreground"
        >Key maps and options, applied while Vim mode is on and again whenever
        you come back to this window.</span
      >
    </div>

    {#if vimrc}
      <code
        class="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-text"
        >{vimrc.path}</code
      >
    {/if}
    <p
      role="status"
      class="text-sm {load_error
        ? 'text-destructive'
        : 'text-muted-foreground'}"
    >
      {status}
    </p>

    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={on_open_vimrc}>
        Open vimrc
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={on_reload_vimrc}
        disabled={is_loading}
      >
        Reload
      </Button>
    </div>

    {#if errors.length > 0}
      <ul class="flex flex-col gap-2" aria-label="vimrc lines not applied">
        {#each errors as problem, index (index)}
          <li class="rounded-md border px-3 py-2">
            <div class="text-sm text-foreground">
              Line {problem.line}: {problem.message}
            </div>
            <div class="font-mono text-xs break-all text-muted-foreground">
              {problem.text}
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if skipped.length > 0}
      <details>
        <summary class="cursor-pointer text-xs text-muted-foreground"
          >{lines(skipped.length)} skipped (Vimscript and terminal Vim settings)</summary
        >
        <ul class="mt-2 flex flex-col gap-2" aria-label="vimrc lines skipped">
          {#each skipped as problem, index (index)}
            <li class="text-xs text-muted-foreground">
              <div>
                Line {problem.line}:
                <span class="font-mono break-all">{problem.text}</span>
              </div>
              <div>{problem.message}</div>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>

  <div class="flex flex-col gap-2 border-t py-4">
    <span class="text-sm font-medium text-foreground">Good to know</span>
    <ul
      class="flex list-disc flex-col gap-1 pl-4 text-xs leading-snug text-muted-foreground"
    >
      <li>
        <code class="font-mono">:w</code> saves the note,
        <code class="font-mono">:q</code> closes its tab (it asks first when
        there are unsaved changes), and <code class="font-mono">:wq</code> does
        both. On a new note, <code class="font-mono">:wq</code> opens the save dialog
        and keeps the tab open.
      </li>
      <li>
        {#if is_mac}
          Cmd shortcuts work in every mode. Ctrl keys go to Vim.
        {:else}
          Ctrl shortcuts of the app win over Vim's Ctrl keys.
        {/if}
      </li>
      <li>
        <code class="font-mono">"+y</code> and
        <code class="font-mono">"+p</code> use the system clipboard. Add
        <code class="font-mono">set clipboard=unnamed</code> to your vimrc to use
        it for every yank and put.
      </li>
      <li>Search ignores case unless the pattern has a capital letter.</li>
      <li>
        Space, comma and other leader maps wait one second for the next key (<code
          class="font-mono">set timeoutlen=500</code
        > to shorten it).
      </li>
    </ul>
  </div>
</div>

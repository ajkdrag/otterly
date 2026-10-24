<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button";
  import type { VimrcStatus } from "$lib/features/vim/types/vimrc";

  type Props = {
    enabled: boolean;
    // null until the first load, which only runs while Vim mode is on or
    // after Reload.
    vimrc: VimrcStatus | null;
    // The last load failed. The previous vimrc stays applied.
    load_error: string | null;
    is_loading: boolean;
    on_toggle: (enabled: boolean) => void;
    on_open_vimrc: () => void;
    on_reload_vimrc: () => void;
  };

  let {
    enabled,
    vimrc,
    load_error,
    is_loading,
    on_toggle,
    on_open_vimrc,
    on_reload_vimrc,
  }: Props = $props();

  const status = $derived.by(() => {
    if (load_error) return `Could not read: ${load_error}`;
    if (!vimrc) return "Not loaded yet";
    if (!vimrc.exists) return "Not created yet";
    const count = vimrc.problems.length;
    if (count === 0) return "Applied";
    return `Applied, ${count} ${count === 1 ? "line" : "lines"} not applied`;
  });
  // The list belongs to the last good load, so it is stale after a failure.
  const problems = $derived(load_error ? [] : (vimrc?.problems ?? []));
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
      class="text-sm {load_error ? 'text-destructive' : 'text-muted-foreground'}"
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

    {#if problems.length > 0}
      <ul class="flex flex-col gap-2" aria-label="vimrc lines not applied">
        {#each problems as problem, index (index)}
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
  </div>
</div>

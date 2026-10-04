<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { Button } from "$lib/components/ui/button";
  import { Copy, RefreshCw, Trash2, X } from "@lucide/svelte";
  const { stores, action_registry } = use_app_context();
  const snapshot = $derived(stores.editor.diagnostics);
  const layout = $derived(
    snapshot
      ? JSON.stringify(
          {
            parser: snapshot.details?.parser,
            scroll: snapshot.scroll,
            blocks: snapshot.blocks,
          },
          null,
          2,
        )
      : "",
  );
  const selection = $derived(
    snapshot
      ? JSON.stringify(
          {
            source_selection: snapshot.details?.selection,
            focus: snapshot.focus,
            dom_selection: snapshot.dom_selection,
          },
          null,
          2,
        )
      : "",
  );
</script>

<aside
  class="bg-background text-foreground flex h-full min-h-0 flex-col border-l"
  aria-label="Editor diagnostics"
>
  <header class="flex items-center justify-between gap-2 border-b px-3 py-2">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold">Editor diagnostics</h2>
      <p class="text-muted-foreground text-xs">
        Local to this window. Includes note contents.
      </p>
    </div>
    <Button
      variant="ghost"
      size="icon"
      aria-label="Close editor diagnostics"
      onclick={() =>
        void action_registry.execute(ACTION_IDS.editor_toggle_diagnostics)}
      ><X class="size-4" /></Button
    >
  </header>
  <div class="flex flex-wrap items-center gap-1 border-b p-2">
    <Button
      variant={stores.editor.engine === "source" ? "secondary" : "ghost"}
      size="sm"
      disabled={stores.editor.engine_switching || !stores.editor.open_note}
      aria-pressed={stores.editor.engine === "source"}
      onclick={() => void action_registry.execute(ACTION_IDS.editor_use_source)}
      >Source</Button
    >
    <Button
      variant={stores.editor.engine === "milkdown" ? "secondary" : "ghost"}
      size="sm"
      disabled={stores.editor.engine_switching || !stores.editor.open_note}
      aria-pressed={stores.editor.engine === "milkdown"}
      onclick={() =>
        void action_registry.execute(ACTION_IDS.editor_use_milkdown)}
      >Milkdown</Button
    >
    <span class="flex-1"></span>
    <Button
      variant="ghost"
      size="icon"
      aria-label="Refresh editor diagnostics"
      onclick={() =>
        void action_registry.execute(ACTION_IDS.editor_refresh_diagnostics)}
      ><RefreshCw class="size-4" /></Button
    >
    <Button
      variant="ghost"
      size="icon"
      aria-label="Copy editor diagnostics"
      disabled={!snapshot}
      onclick={() =>
        void action_registry.execute(ACTION_IDS.editor_copy_diagnostics)}
      ><Copy class="size-4" /></Button
    >
    <Button
      variant="ghost"
      size="icon"
      aria-label="Clear editor input trace"
      onclick={() =>
        void action_registry.execute(ACTION_IDS.editor_clear_diagnostics)}
      ><Trash2 class="size-4" /></Button
    >
  </div>
  <div class="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-xs">
    {#if stores.editor.engine_switching}<p
        class="text-muted-foreground"
        role="status"
      >
        Switching editor…
      </p>{/if}
    {#if snapshot}
      <div class="text-muted-foreground break-words">
        {snapshot.note_path}<br />{snapshot.captured_at}
      </div>
      <details open>
        <summary class="cursor-pointer py-1 font-medium"
          >Selection and focus</summary
        >
        <pre
          class="bg-muted mt-1 overflow-auto rounded-md p-2 text-xs">{selection}</pre>
      </details>
      <details open>
        <summary class="cursor-pointer py-1 font-medium"
          >Live source · {snapshot.source.length.toLocaleString()} characters</summary
        >
        <pre
          class="bg-muted mt-1 max-h-64 overflow-auto rounded-md p-2 text-xs">{snapshot.source}</pre>
      </details>
      <details>
        <summary class="cursor-pointer py-1 font-medium"
          >Parser, viewport and block geometry</summary
        >
        <p class="text-muted-foreground py-1">
          Up to 120 visible blocks. Parser coverage is available in the source
          editor.
        </p>
        <pre
          class="bg-muted mt-1 max-h-80 overflow-auto rounded-md p-2 text-xs">{layout}</pre>
      </details>
      <details open>
        <summary class="cursor-pointer py-1 font-medium"
          >Recent input · {snapshot.trace.length}/100</summary
        >
        <ol
          class="bg-muted mt-1 max-h-72 space-y-1 overflow-auto rounded-md p-2 font-mono"
        >
          {#each snapshot.trace.slice().reverse() as event}
            <li class="break-words">
              <span class="text-muted-foreground">{event.time}</span>
              {event.event}
              {event.detail}<br /><span class="text-muted-foreground"
                >{event.target}</span
              >
              <pre class="overflow-auto">{JSON.stringify({
                  selection: event.selection,
                  caret: event.caret,
                  scroll: event.scroll,
                })}</pre>
            </li>
          {/each}
        </ol>
      </details>
    {:else}
      <p class="text-muted-foreground">Open a note to inspect its editor.</p>
    {/if}
  </div>
</aside>

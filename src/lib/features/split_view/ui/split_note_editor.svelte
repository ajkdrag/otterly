<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OpenNoteState } from "$lib/shared/types/editor";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "$lib/components/ui/button";

  const { stores, action_registry } = use_app_context();

  const secondary_note = $derived(stores.split_view.secondary_note);

  function mount_editor(node: HTMLDivElement, note: OpenNoteState) {
    void action_registry.execute(ACTION_IDS.split_view_mount, node, note);

    return {
      destroy() {
        void action_registry.execute(ACTION_IDS.split_view_unmount);
      },
    };
  }

  function handle_close() {
    void action_registry.execute(ACTION_IDS.split_view_close);
  }

  function handle_focus() {
    void action_registry.execute(
      ACTION_IDS.split_view_set_active_pane,
      "secondary",
    );
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="SplitNoteEditor" onclick={handle_focus}>
  <div class="SplitNoteEditor__header">
    <span class="SplitNoteEditor__title">
      {secondary_note?.meta.title ?? "Split View"}
    </span>
    <Button variant="ghost" size="icon" onclick={handle_close}>
      <XIcon />
    </Button>
  </div>
  {#if secondary_note}
    <div
      use:mount_editor={secondary_note}
      class="SplitNoteEditor__content"
    ></div>
  {:else}
    <div class="SplitNoteEditor__empty">
      <p>No file open in split view</p>
    </div>
  {/if}
</div>

<style>
  .SplitNoteEditor {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .SplitNoteEditor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    min-height: calc(var(--space-8) + var(--space-1));
  }

  .SplitNoteEditor__title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SplitNoteEditor__content {
    flex: 1;
    overflow-y: auto;
    width: 100%;
  }

  .SplitNoteEditor__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>

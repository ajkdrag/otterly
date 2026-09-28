<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OpenNoteState } from "$lib/shared/types/editor";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { HotkeyKey } from "$lib/features/hotkey";
  import { Button } from "$lib/components/ui/button";

  const { stores, action_registry } = use_app_context();

  const open_note = $derived(stores.editor.open_note);

  const create_note_hotkey = $derived(
    stores.ui.hotkeys_config.bindings.find(
      (b) => b.action_id === ACTION_IDS.note_create,
    )?.key ?? null,
  );

  function mount_editor(node: HTMLDivElement, note: OpenNoteState) {
    void action_registry.execute(ACTION_IDS.app_editor_mount, node, note);

    return {
      destroy() {
        void action_registry.execute(ACTION_IDS.app_editor_unmount);
      },
    };
  }
</script>

<div class="NoteEditor">
  {#if open_note}
    <div use:mount_editor={open_note} class="NoteEditor__content"></div>
  {:else}
    <div class="NoteEditor__empty">
      <div class="NoteEditor__empty-content">
        <div class="NoteEditor__empty-icon">
          <FileTextIcon />
        </div>
        <p class="NoteEditor__empty-title">No note open</p>
        <p class="NoteEditor__empty-hint">
          Select a note from the sidebar or create a new one
        </p>
        <div class="NoteEditor__empty-actions">
          <Button
            variant="default"
            size="sm"
            onclick={() => void action_registry.execute(ACTION_IDS.note_create)}
          >
            <PlusIcon />
            New note
          </Button>
          {#if create_note_hotkey}
            <span class="NoteEditor__empty-shortcut-label">or press</span>
            <HotkeyKey hotkey={create_note_hotkey} />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .NoteEditor {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .NoteEditor__content {
    width: 100%;
  }

  .NoteEditor__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
  }

  .NoteEditor__empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
    padding: var(--space-6);
  }

  .NoteEditor__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-icon-lg) * 2);
    height: calc(var(--size-icon-lg) * 2);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  :global(.NoteEditor__empty-icon svg) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
  }

  .NoteEditor__empty-title {
    font-family: var(--font-heading, var(--font-sans));
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--foreground);
  }

  .NoteEditor__empty-hint {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    max-width: calc(var(--space-6) * 10);
  }

  .NoteEditor__empty-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .NoteEditor__empty-shortcut-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }
</style>

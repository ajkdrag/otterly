<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { use_document_window_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_keyboard_shortcuts } from "$lib/hooks/use_keyboard_shortcuts.svelte";
  import { EditorStatusBar } from "$lib/features/editor";
  import { FindInFileBar } from "$lib/features/search";
  import { reveal_in_file_manager_label } from "$lib/shared/utils/file_manager_label";

  const { stores, action_registry } = use_document_window_context();
  const document = stores.document;

  const keyboard = use_keyboard_shortcuts({
    hotkeys_config: () => stores.ui.hotkeys_config,
    is_enabled: () => document.load_state === "ready",
    is_blocked: () =>
      stores.ui.document_close_confirm.open || stores.ui.help_dialog.open,
    is_omnibar_topmost: () => false,
    is_vault_switcher_open: () => false,
    is_hotkey_recorder_open: () => false,
    is_vim_enabled: () => stores.ui.editor_settings.vim_mode_enabled,
    vim_mode: () => document.vim_status?.mode ?? null,
    has_tabs: () => false,
    action_registry,
    on_close_vault_switcher: () => {},
    on_select_pinned_vault: () => {},
    on_switch_to_tab: () => {},
  });

  const run = (id: string, ...args: unknown[]) =>
    void action_registry.execute(id, ...args);

  function mount_editor(node: HTMLDivElement) {
    run(ACTION_IDS.document_editor_mount, node);
    return {
      destroy() {
        run(ACTION_IDS.document_editor_unmount);
      },
    };
  }
</script>

<svelte:window
  onkeydowncapture={keyboard.handle_keydown_capture}
  onkeydown={keyboard.handle_keydown}
/>

<div class="DocumentWindow">
  {#if document.has_conflict}
    <div class="DocumentWindow__banner" role="alert">
      <span>This file changed on disk while you were editing it.</span>
      <Button
        size="sm"
        variant="outline"
        onclick={() => run(ACTION_IDS.document_reload)}>Reload from disk</Button
      >
      <Button size="sm" onclick={() => run(ACTION_IDS.document_overwrite)}
        >Keep my version</Button
      >
    </div>
  {/if}

  {#if document.load_state === "ready"}
    <FindInFileBar
      open={stores.ui.find_in_file.open}
      query={stores.ui.find_in_file.query}
      replacement={stores.ui.find_in_file.replacement}
      replace_open={stores.ui.find_in_file.replace_open}
      regex={stores.ui.find_in_file.regex}
      case_sensitive={stores.ui.find_in_file.case_sensitive}
      whole_word={stores.ui.find_in_file.whole_word}
      matches={stores.search.in_file_matches}
      selected_match_index={stores.ui.find_in_file.selected_match_index}
      on_query_change={(query: string) =>
        run(ACTION_IDS.find_in_file_set_query, query)}
      on_replacement_change={(replacement: string) =>
        run(ACTION_IDS.find_in_file_set_replacement, replacement)}
      on_options_change={(options) =>
        run(ACTION_IDS.find_in_file_set_options, options)}
      on_toggle_replace={() => run(ACTION_IDS.find_in_file_toggle_replace)}
      on_replace={() => run(ACTION_IDS.find_in_file_replace)}
      on_replace_all={() => run(ACTION_IDS.find_in_file_replace_all)}
      on_next={() => run(ACTION_IDS.find_in_file_next)}
      on_prev={() => run(ACTION_IDS.find_in_file_prev)}
      on_close={() => run(ACTION_IDS.find_in_file_close)}
    />
    <div use:mount_editor class="DocumentWindow__editor"></div>
  {:else if document.load_state === "error"}
    <div class="DocumentWindow__message">
      <p>Could not open this file.</p>
      <p class="DocumentWindow__hint">{document.load_error}</p>
    </div>
  {:else}
    <div class="DocumentWindow__message"></div>
  {/if}

  <EditorStatusBar
    cursor_info={document.cursor}
    has_open_file={document.load_state === "ready"}
    view_mode={document.view_mode}
    vim_status={document.vim_status}
    is_dirty={document.is_dirty}
    last_saved_at={document.last_saved_at}
    on_view_mode_click={() => run(ACTION_IDS.editor_toggle_source_mode)}
  >
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        {#snippet child({ props })}
          <!-- rtl puts the ellipsis on the left, so the file name stays
               visible. The inner span keeps the path itself left to right. -->
          <span
            {...props}
            class="DocumentWindow__path"
            title={document.file?.path}
          >
            <span dir="ltr">{document.file?.path ?? ""}</span>
          </span>
        {/snippet}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>
          <ContextMenu.Item onSelect={() => run(ACTION_IDS.note_copy_markdown)}>
            Copy Markdown
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => run(ACTION_IDS.document_copy_path)}>
            Copy File Path
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            onSelect={() => run(ACTION_IDS.document_reveal_in_file_manager)}
          >
            {reveal_in_file_manager_label()}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  </EditorStatusBar>
</div>

<Dialog.Root
  open={stores.ui.document_close_confirm.open}
  onOpenChange={(value: boolean) => {
    if (!value) run(ACTION_IDS.document_cancel_close);
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Save changes to {document.file?.name}?</Dialog.Title>
      <Dialog.Description>
        Your changes are lost if you close without saving.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => run(ACTION_IDS.document_cancel_close)}>Cancel</Button
      >
      <Button
        variant="outline"
        onclick={() => run(ACTION_IDS.document_confirm_close, false)}
        >Don't save</Button
      >
      <Button onclick={() => run(ACTION_IDS.document_confirm_close, true)}
        >Save</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .DocumentWindow {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
  }

  .DocumentWindow__banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--warning-bg, var(--muted));
    font-size: var(--text-sm);
  }

  .DocumentWindow__banner > span {
    flex: 1;
  }

  .DocumentWindow__editor {
    flex: 1;
    min-height: 0;
  }

  .DocumentWindow__message {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    color: var(--muted-foreground);
  }

  .DocumentWindow__hint {
    font-size: var(--text-sm);
  }

  /* The path sits where the vault window shows the vault name, just before
     the Rich/Source toggle, with the same width cap. */
  .DocumentWindow__path {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
</style>

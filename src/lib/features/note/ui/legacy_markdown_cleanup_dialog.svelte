<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import type { LegacyCleanupPreview } from "$lib/features/note";
  import type { MarkdownCleanupBackupInfo } from "$lib/features/note/ports";

  type Props = {
    open: boolean;
    is_loading: boolean;
    error: string | null;
    preview: LegacyCleanupPreview | null;
    backup: MarkdownCleanupBackupInfo | null;
    compact_simple_lists: boolean;
    applied_count: number;
    restored_count: number;
    skipped_restore_count: number;
    operation_label: string;
    on_options: (compact: boolean) => void;
    on_apply: () => void;
    on_restore: () => void;
    on_cancel: () => void;
  };

  let {
    open,
    is_loading,
    error,
    preview,
    backup,
    compact_simple_lists,
    applied_count,
    restored_count,
    skipped_restore_count,
    operation_label,
    on_options,
    on_apply,
    on_restore,
    on_cancel,
  }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={(value: boolean) => !value && on_cancel()}>
  <Dialog.Content class="max-h-[85vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Clean up legacy Markdown</Dialog.Title>
      <Dialog.Description>
        Preview spacing changes across this vault. Notes with unsaved editor
        changes are skipped so their editor buffers cannot overwrite cleanup.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={compact_simple_lists}
          disabled={is_loading}
          class="size-4 accent-primary"
          onchange={(event) => on_options(event.currentTarget.checked)}
        />
        Compact simple list items
      </label>

      {#if is_loading}
        <p class="text-sm text-muted-foreground">{operation_label}</p>
      {/if}
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
      {#if applied_count > 0}
        <p role="status" class="text-sm">
          Cleaned {applied_count} notes. A backup is saved in this vault.
        </p>
      {/if}
      {#if restored_count > 0 || skipped_restore_count > 0}
        <p role="status" class="text-sm">
          Restored {restored_count} notes.
          {#if skipped_restore_count > 0}
            Skipped {skipped_restore_count} notes with newer or unsaved edits.
          {/if}
        </p>
      {/if}

      {#if preview}
        <p class="text-sm">
          Scanned {preview.scanned_count} notes. {preview.changed_count} would change.
          Skipped {preview.skipped_open_count} notes with unsaved editor changes.
        </p>
        {#if preview.changed_count === 0}
          <p class="text-sm text-muted-foreground">No changes found.</p>
        {:else}
          <div class="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
            {#each preview.notes as note (note.note_id)}
              <section class="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                <h3 class="text-sm font-medium">{note.title}</h3>
                <p class="text-xs text-muted-foreground">
                  {note.line_count_before} → {note.line_count_after} lines;
                  {note.blank_lines_removed} blank lines (including
                  {note.list_separators_removed} list gaps),
                  {note.standalone_breaks_removed} standalone breaks removed
                </p>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-muted-foreground">Before</span>
                    <pre
                      class="overflow-x-auto rounded bg-muted p-2">{note.before_example}</pre>
                  </div>
                  <div>
                    <span class="text-muted-foreground">After</span>
                    <pre
                      class="overflow-x-auto rounded bg-muted p-2">{note.after_example}</pre>
                  </div>
                </div>
                <details class="text-xs">
                  <summary class="cursor-pointer text-muted-foreground">
                    Review full note changes
                  </summary>
                  <div class="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <span class="text-muted-foreground">Before</span>
                      <pre
                        class="max-h-64 overflow-auto rounded bg-muted p-2">{note.before_markdown}</pre>
                    </div>
                    <div>
                      <span class="text-muted-foreground">After</span>
                      <pre
                        class="max-h-64 overflow-auto rounded bg-muted p-2">{note.after_markdown}</pre>
                    </div>
                  </div>
                </details>
              </section>
            {/each}
          </div>
        {/if}
      {/if}

      <p class="text-xs text-muted-foreground">
        Code and frontmatter are left alone. Only standalone break lines and
        redundant blank spacing are changed. Inline breaks stay as written.
      </p>
    </div>

    <Dialog.Footer>
      {#if backup || preview?.backup}
        <Button variant="outline" disabled={is_loading} onclick={on_restore}>
          Restore latest backup
        </Button>
      {/if}
      <Button variant="outline" disabled={is_loading} onclick={on_cancel}>
        Close
      </Button>
      {#if preview && preview.changed_count > 0}
        <Button disabled={is_loading} onclick={on_apply}>Apply cleanup</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

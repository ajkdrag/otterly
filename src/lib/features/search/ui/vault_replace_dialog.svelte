<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    open: boolean;
    // The query the shown results came from. It is what gets replaced, even
    // if the find box changed a moment ago.
    query: string;
    match_count: number;
    file_count: number;
    replacement: string;
    unsaved_paths: string[];
    // The vault is a git repo, so Replace All makes a checkpoint first.
    will_checkpoint: boolean;
    is_replacing: boolean;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let {
    open,
    query,
    match_count,
    file_count,
    replacement,
    unsaved_paths,
    will_checkpoint,
    is_replacing,
    on_confirm,
    on_cancel,
  }: Props = $props();

  const matches_label = $derived(
    `${String(match_count)} ${match_count === 1 ? "match" : "matches"}`,
  );
  const files_label = $derived(
    `${String(file_count)} ${file_count === 1 ? "file" : "files"}`,
  );
  const unsaved_label = $derived(
    `${String(unsaved_paths.length)} ${unsaved_paths.length === 1 ? "file has" : "files have"}`,
  );
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_replacing) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Replace all in vault?</Dialog.Title>
      <Dialog.Description>
        Replace {matches_label} of
        <code class="bg-muted rounded-sm px-1 break-all">{query}</code>
        in {files_label} with
        {#if replacement}
          <code class="bg-muted rounded-sm px-1 break-all">{replacement}</code>
        {:else}
          nothing{/if}.
      </Dialog.Description>
    </Dialog.Header>

    <ul class="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
      {#if will_checkpoint}
        <li>
          A git checkpoint is created first. Restore it from version history.
        </li>
      {:else}
        <li class="text-destructive">
          This vault is not a git repo, so you cannot undo this.
        </li>
      {/if}
      {#if unsaved_paths.length > 0}
        <li>{unsaved_label} unsaved changes and will be skipped.</li>
      {/if}
    </ul>

    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel} disabled={is_replacing}>
        Cancel
      </Button>
      <Button onclick={on_confirm} disabled={is_replacing}>
        {#if is_replacing}
          Replacing...
        {:else}
          Replace all
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

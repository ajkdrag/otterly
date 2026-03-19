<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    open: boolean;
    is_switching: boolean;
    unsaved_note_label?: string | null;
    error?: string | null;
    on_save_and_switch: () => void;
    on_discard_and_switch: () => void;
    on_cancel: () => void;
  }

  let {
    open,
    is_switching,
    unsaved_note_label = null,
    error = null,
    on_save_and_switch,
    on_discard_and_switch,
    on_cancel,
  }: Props = $props();

  const note_display = $derived(
    unsaved_note_label ? `"${unsaved_note_label}"` : "one or more open notes",
  );
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_switching) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Unsaved Changes</Dialog.Title>
      <Dialog.Description>
        {note_display} has unsaved changes. Do you want to save before switching vaults?
      </Dialog.Description>
    </Dialog.Header>
    {#if error}
      <p class="text-sm text-destructive">{error}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel} disabled={is_switching}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onclick={on_discard_and_switch}
        disabled={is_switching}
      >
        Don't Save
      </Button>
      <Button onclick={on_save_and_switch} disabled={is_switching}>
        {#if is_switching}
          Saving...
        {:else}
          Save & Switch
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

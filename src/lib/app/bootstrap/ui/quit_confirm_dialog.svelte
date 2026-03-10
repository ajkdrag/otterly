<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    open: boolean;
    is_quitting: boolean;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let { open, is_quitting, on_confirm, on_cancel }: Props = $props();
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_quitting) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Quit Otterly?</Dialog.Title>
      <Dialog.Description>
        Your current workspace session will be restored the next time you open
        this vault.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel} disabled={is_quitting}>
        Cancel
      </Button>
      <Button onclick={on_confirm} disabled={is_quitting}>
        {#if is_quitting}
          Quitting...
        {:else}
          Quit
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { create_document_window_ports } from "$lib/app/create_prod_ports";
  import { create_document_window_context } from "$lib/app/di/create_document_window_context";
  import { provide_document_window_context } from "$lib/app/context/app_context.svelte";
  import { DocumentWindow } from "$lib/features/document";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import HelpDialog from "$lib/app/bootstrap/ui/help_dialog.svelte";

  let { window_label }: { window_label: string } = $props();

  // svelte-ignore state_referenced_locally
  const context = create_document_window_context({
    ports: create_document_window_ports(window_label),
  });
  provide_document_window_context(context);

  onMount(() => {
    void context.start();
  });

  onDestroy(() => {
    context.destroy();
  });
</script>

<DocumentWindow />

<HelpDialog
  open={context.stores.ui.help_dialog.open}
  hotkeys_config={context.stores.ui.hotkeys_config}
  on_close={() => void context.action_registry.execute(ACTION_IDS.help_close)}
/>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { create_document_window_ports } from "$lib/app/create_prod_ports";
  import { create_document_window_context } from "$lib/app/di/create_document_window_context";
  import { provide_document_window_context } from "$lib/app/context/app_context.svelte";
  import { DocumentWindow } from "$lib/features/document";

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

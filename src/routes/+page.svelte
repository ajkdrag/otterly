<script lang="ts">
  import { current_document_window_label } from "$lib/app/window_kind";
  import AppRoot from "$lib/app/bootstrap/ui/app_root.svelte";
  import DocumentWindowRoot from "$lib/app/bootstrap/ui/document_window_root.svelte";

  const document_window_label = current_document_window_label();
</script>

{#if document_window_label}
  <DocumentWindowRoot window_label={document_window_label} />
{:else}
  <AppRoot />
{/if}

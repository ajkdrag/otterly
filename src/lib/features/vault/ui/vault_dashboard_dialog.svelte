<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import type { NoteMeta } from "$lib/shared/types/note";
  import VaultDashboardContent from "./vault_dashboard_content.svelte";

  interface Props {
    open: boolean;
    vault_name: string | null;
    vault_path: string | null;
    stats_status: "idle" | "loading" | "ready" | "error";
    note_count: number | null;
    folder_count: number | null;
    recent_notes: NoteMeta[];
    created_at: number | null;
    last_opened_at: number | null;
    is_available: boolean | null;
    on_open_change: (open: boolean) => void;
    on_open_note: (note_path: string) => void;
    on_new_note: () => void;
    on_search_vault: () => void;
    on_open_recent: () => void;
  }

  let {
    open,
    vault_name,
    vault_path,
    stats_status,
    note_count,
    folder_count,
    recent_notes,
    created_at,
    last_opened_at,
    is_available,
    on_open_change,
    on_open_note,
    on_new_note,
    on_search_vault,
    on_open_recent,
  }: Props = $props();

  function run_and_close(action: () => void) {
    action();
    on_open_change(false);
  }
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="VaultDashboard">
    <Dialog.Header class="border-b border-border pb-4 pr-8">
      <Dialog.Title class="VaultDashboard__title">
        {vault_name ?? "Vault"}
      </Dialog.Title>
      <Dialog.Description class="VaultDashboard__subtitle">
        Dashboard overview
      </Dialog.Description>
    </Dialog.Header>

    <VaultDashboardContent
      {vault_name}
      {vault_path}
      {stats_status}
      {note_count}
      {folder_count}
      {recent_notes}
      {created_at}
      {last_opened_at}
      {is_available}
      on_open_note={(path) => run_and_close(() => on_open_note(path))}
      on_new_note={() => run_and_close(on_new_note)}
      on_search_vault={() => run_and_close(on_search_vault)}
      on_open_recent={() => run_and_close(on_open_recent)}
    />

    <Dialog.Footer class="border-t border-border pt-4">
      <Button variant="outline" onclick={() => on_open_change(false)}>
        Close
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.VaultDashboard) {
    max-width: var(--size-dialog-lg);
    max-height: calc(100vh - 3rem);
    display: flex;
    flex-direction: column;
  }

  :global(.VaultDashboard__title) {
    font-family: var(--font-heading, var(--font-sans));
    font-size: var(--text-xl);
    font-weight: 600;
  }

  :global(.VaultDashboard__subtitle) {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }
</style>

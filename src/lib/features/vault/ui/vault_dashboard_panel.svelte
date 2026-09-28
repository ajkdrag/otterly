<script lang="ts">
  import type { NoteMeta } from "$lib/shared/types/note";
  import VaultDashboardContent from "./vault_dashboard_content.svelte";

  type Props = {
    stats_status: "idle" | "loading" | "ready" | "error";
    note_count: number | null;
    folder_count: number | null;
    recent_notes: NoteMeta[];
    vault_name: string;
    vault_path: string;
    created_at: number | null;
    last_opened_at: number | null;
    is_available: boolean | null;
    on_note_click: (path: string) => void;
    on_new_note: () => void;
    on_search: () => void;
    on_open_recent: () => void;
    on_reindex: () => void;
  };

  let {
    stats_status,
    note_count,
    folder_count,
    recent_notes,
    vault_name,
    vault_path,
    created_at,
    last_opened_at,
    is_available,
    on_note_click,
    on_new_note,
    on_search,
    on_open_recent,
    on_reindex,
  }: Props = $props();
</script>

<div class="DashboardPanel">
  <header class="DashboardPanel__header">
    <h2 class="DashboardPanel__title">{vault_name}</h2>
    <p class="DashboardPanel__subtitle">Dashboard overview</p>
  </header>
  <VaultDashboardContent
    compact
    {vault_name}
    {vault_path}
    {stats_status}
    {note_count}
    {folder_count}
    {recent_notes}
    {created_at}
    {last_opened_at}
    {is_available}
    on_open_note={on_note_click}
    {on_new_note}
    on_search_vault={on_search}
    {on_open_recent}
    {on_reindex}
  />
</div>

<style>
  .DashboardPanel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .DashboardPanel__header {
    padding: var(--space-4) var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .DashboardPanel__title {
    font-family: var(--font-heading, var(--font-sans));
    font-size: var(--text-xl);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .DashboardPanel__subtitle {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }
</style>

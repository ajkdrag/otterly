<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import TagsIcon from "@lucide/svelte/icons/tags";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleXIcon from "@lucide/svelte/icons/circle-x";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import type { NoteMeta } from "$lib/shared/types/note";

  interface Props {
    compact?: boolean;
    vault_name: string | null;
    vault_path: string | null;
    stats_status: "idle" | "loading" | "ready" | "error";
    note_count: number | null;
    folder_count: number | null;
    recent_notes: NoteMeta[];
    created_at: number | null;
    last_opened_at: number | null;
    is_available: boolean | null;
    on_open_note: (note_path: string) => void;
    on_new_note: () => void;
    on_search_vault: () => void;
    on_open_recent: () => void;
    on_reindex?: () => void;
  }

  let {
    compact = false,
    vault_name,
    vault_path,
    stats_status,
    note_count,
    folder_count,
    recent_notes,
    created_at,
    last_opened_at,
    is_available,
    on_open_note,
    on_new_note,
    on_search_vault,
    on_open_recent,
    on_reindex,
  }: Props = $props();

  const capped_recent = $derived(recent_notes.slice(0, 5));
  const stats_loading = $derived(
    stats_status === "loading" || stats_status === "idle",
  );
  const notes_display = $derived(
    note_count === null || stats_loading ? "—" : String(note_count),
  );
  const folders_display = $derived(
    folder_count === null || stats_loading ? "—" : String(folder_count),
  );

  function format_date(timestamp: number | null): string {
    if (timestamp === null) return "—";
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<div
  class="VaultDashboardContent"
  class:VaultDashboardContent--compact={compact}
>
  <section class="VaultDashboardContent__section">
    <h3 class="VaultDashboardContent__section-header">Overview</h3>
    <div class="VaultDashboardContent__stats">
      <div class="VaultDashboardContent__stat">
        <FileTextIcon class="VaultDashboardContent__stat-icon" />
        <span class="VaultDashboardContent__stat-value">{notes_display}</span>
        <span class="VaultDashboardContent__stat-label">
          {note_count === 1 && !stats_loading ? "note" : "notes"}
        </span>
      </div>
      <div class="VaultDashboardContent__stat">
        <FolderIcon class="VaultDashboardContent__stat-icon" />
        <span class="VaultDashboardContent__stat-value">{folders_display}</span>
        <span class="VaultDashboardContent__stat-label">
          {folder_count === 1 && !stats_loading ? "folder" : "folders"}
        </span>
      </div>
    </div>
  </section>

  <Separator />

  <section class="VaultDashboardContent__section">
    <h3 class="VaultDashboardContent__section-header">Quick Actions</h3>
    <div class="VaultDashboardContent__actions">
      <Button variant="outline" size="sm" onclick={on_new_note}>
        <PlusIcon />
        New note
      </Button>
      <Button variant="outline" size="sm" onclick={on_search_vault}>
        <SearchIcon />
        Search vault
      </Button>
      <Button variant="outline" size="sm" onclick={on_open_recent}>
        <ClockIcon />
        Resume last note
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled
        class="VaultDashboardContent__action--placeholder"
      >
        <TagsIcon />
        View all tags
      </Button>
    </div>
  </section>

  <Separator />

  <section class="VaultDashboardContent__section">
    <h3 class="VaultDashboardContent__section-header">Recent Activity</h3>
    {#if capped_recent.length > 0}
      <ul class="VaultDashboardContent__recent-list">
        {#each capped_recent as note (note.id)}
          <li>
            <button
              type="button"
              class="VaultDashboardContent__recent-item"
              onclick={() => on_open_note(note.path)}
            >
              <FileTextIcon class="VaultDashboardContent__recent-icon" />
              <span class="VaultDashboardContent__recent-title"
                >{note.title}</span
              >
              <span class="VaultDashboardContent__recent-path">{note.path}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="VaultDashboardContent__empty">
        <InboxIcon class="VaultDashboardContent__empty-icon" />
        <span class="VaultDashboardContent__empty-text"
          >No recent notes yet</span
        >
      </div>
    {/if}
  </section>

  {#if vault_path}
    <Separator />

    <section
      class="VaultDashboardContent__section VaultDashboardContent__section--info"
    >
      <h3 class="VaultDashboardContent__section-header">Vault Info</h3>
      <div class="VaultDashboardContent__info-grid">
        <span class="VaultDashboardContent__info-label">Name</span>
        <span class="VaultDashboardContent__info-value"
          >{vault_name ?? "—"}</span
        >
        <span class="VaultDashboardContent__info-label">Path</span>
        <span
          class="VaultDashboardContent__info-value VaultDashboardContent__info-value--mono"
          >{vault_path}</span
        >
        <span class="VaultDashboardContent__info-label">Notes</span>
        <span class="VaultDashboardContent__info-value">{notes_display}</span>
        <span class="VaultDashboardContent__info-label">Folders</span>
        <span class="VaultDashboardContent__info-value">{folders_display}</span>
        <span class="VaultDashboardContent__info-label">Created</span>
        <span class="VaultDashboardContent__info-value"
          >{format_date(created_at)}</span
        >
        <span class="VaultDashboardContent__info-label">Last Opened</span>
        <span class="VaultDashboardContent__info-value"
          >{format_date(last_opened_at)}</span
        >
        <span class="VaultDashboardContent__info-label">Status</span>
        <span
          class="VaultDashboardContent__info-value VaultDashboardContent__info-status"
        >
          {#if is_available === null}
            —
          {:else if is_available}
            <CircleCheckIcon
              class="VaultDashboardContent__info-status-icon VaultDashboardContent__info-status-icon--ok"
            />
            Available
          {:else}
            <CircleXIcon
              class="VaultDashboardContent__info-status-icon VaultDashboardContent__info-status-icon--unavailable"
            />
            Unavailable
          {/if}
        </span>
      </div>
      {#if on_reindex}
        <Button
          variant="ghost"
          size="sm"
          class="VaultDashboardContent__reindex"
          onclick={on_reindex}
        >
          <RefreshCwIcon />
          Reindex vault
        </Button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .VaultDashboardContent {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-2) 0;
    overflow-y: auto;
    min-height: 0;
    min-width: 0;
  }

  .VaultDashboardContent__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .VaultDashboardContent__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .VaultDashboardContent__stats {
    display: flex;
    gap: 0;
    border-block: 1px solid var(--border);
  }

  .VaultDashboardContent__stat {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding: var(--space-3);
    background-color: var(--sidebar);
  }

  .VaultDashboardContent__stat + .VaultDashboardContent__stat {
    border-inline-start: 1px solid var(--border);
  }

  :global(.VaultDashboardContent__stat-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .VaultDashboardContent__stat-value {
    font-family: var(--font-heading, var(--font-sans));
    font-size: var(--text-xl);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--foreground);
    line-height: 1;
  }

  .VaultDashboardContent__stat-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    line-height: 1;
  }

  .VaultDashboardContent__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .VaultDashboardContent__recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .VaultDashboardContent__recent-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    min-height: 2.5rem;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .VaultDashboardContent__recent-item:hover {
    background-color: var(--muted);
  }

  .VaultDashboardContent__recent-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  :global(.VaultDashboardContent__recent-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .VaultDashboardContent__recent-title {
    font-size: var(--text-sm);
    color: var(--foreground);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultDashboardContent__recent-path {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-family: var(--font-mono);
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: right;
  }

  .VaultDashboardContent__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
  }

  :global(.VaultDashboardContent__empty-icon) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
    color: var(--muted-foreground);
    opacity: 0.5;
  }

  .VaultDashboardContent__empty-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .VaultDashboardContent__section--info {
    padding-bottom: var(--space-2);
  }

  .VaultDashboardContent__info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    align-items: baseline;
  }

  .VaultDashboardContent__info-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .VaultDashboardContent__info-value {
    font-size: var(--text-sm);
    color: var(--foreground);
    min-width: 0;
    word-break: break-all;
  }

  .VaultDashboardContent__info-value--mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .VaultDashboardContent__info-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  :global(.VaultDashboardContent__info-status-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  :global(.VaultDashboardContent__info-status-icon--ok) {
    color: var(--interactive);
  }

  :global(.VaultDashboardContent__info-status-icon--unavailable) {
    color: var(--muted-foreground);
  }

  :global(.VaultDashboardContent__action--placeholder) {
    opacity: 0.5;
  }

  :global(.VaultDashboardContent__reindex) {
    align-self: flex-start;
    margin-top: var(--space-2);
    color: var(--muted-foreground);
  }

  .VaultDashboardContent--compact {
    gap: var(--space-4);
    padding: var(--space-4) var(--space-3);
    height: 100%;
  }

  .VaultDashboardContent--compact .VaultDashboardContent__stats {
    flex-direction: column;
  }

  .VaultDashboardContent--compact
    .VaultDashboardContent__stat
    + .VaultDashboardContent__stat {
    border-inline-start: 0;
    border-block-start: 1px solid var(--border);
  }

  .VaultDashboardContent--compact .VaultDashboardContent__actions {
    flex-direction: column;
    align-items: stretch;
  }

  :global(
    .VaultDashboardContent--compact .VaultDashboardContent__actions > button
  ) {
    justify-content: flex-start;
  }

  .VaultDashboardContent--compact .VaultDashboardContent__recent-item {
    display: grid;
    grid-template-columns: var(--size-icon-sm) minmax(0, 1fr);
    gap: 0 var(--space-2);
  }

  :global(.VaultDashboardContent--compact .VaultDashboardContent__recent-icon) {
    grid-row: span 2;
  }

  .VaultDashboardContent--compact .VaultDashboardContent__recent-path {
    grid-column: 2;
    max-width: 100%;
    text-align: left;
    direction: ltr;
  }
</style>

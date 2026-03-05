<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
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

  interface RecentNote {
    id: string;
    title: string;
    path: string;
  }

  interface Props {
    open: boolean;
    vault_name: string | null;
    vault_path: string | null;
    stats_status: "idle" | "loading" | "ready" | "error";
    note_count: number | null;
    folder_count: number | null;
    recent_notes: RecentNote[];
    created_at: number | null;
    last_opened_at: number | null;
    is_available: boolean | null;
    on_open_change: (open: boolean) => void;
    on_open_note: (note_path: string) => void;
    on_new_note: () => void;
    on_search_vault: () => void;
    on_open_recent: () => void;
    on_view_all_tags: () => void;
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
    on_view_all_tags,
  }: Props = $props();

  const capped_recent = $derived(recent_notes.slice(0, 5));
  const has_recent = $derived(capped_recent.length > 0);
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

  function handle_note_click(path: string) {
    on_open_note(path);
    on_open_change(false);
  }

  function handle_action(action: () => void) {
    action();
    on_open_change(false);
  }
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="VaultDashboard">
    <Dialog.Header>
      <Dialog.Title class="VaultDashboard__title">
        {vault_name ?? "Vault"}
      </Dialog.Title>
      <Dialog.Description class="VaultDashboard__subtitle">
        Dashboard overview
      </Dialog.Description>
    </Dialog.Header>

    <div class="VaultDashboard__body">
      <section class="VaultDashboard__section">
        <h3 class="VaultDashboard__section-header">Overview</h3>
        <div class="VaultDashboard__stats">
          <div class="VaultDashboard__stat">
            <FileTextIcon class="VaultDashboard__stat-icon" />
            <span class="VaultDashboard__stat-value">{notes_display}</span>
            <span class="VaultDashboard__stat-label">
              {note_count === 1 && !stats_loading ? "note" : "notes"}
            </span>
          </div>
          <div class="VaultDashboard__stat">
            <FolderIcon class="VaultDashboard__stat-icon" />
            <span class="VaultDashboard__stat-value">{folders_display}</span>
            <span class="VaultDashboard__stat-label">
              {folder_count === 1 && !stats_loading ? "folder" : "folders"}
            </span>
          </div>
        </div>
      </section>

      <Separator />

      <section class="VaultDashboard__section">
        <h3 class="VaultDashboard__section-header">Quick Actions</h3>
        <div class="VaultDashboard__actions">
          <Button
            variant="outline"
            size="sm"
            onclick={() => handle_action(on_new_note)}
          >
            <PlusIcon />
            New Note
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => handle_action(on_search_vault)}
          >
            <SearchIcon />
            Search Vault
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => handle_action(on_open_recent)}
          >
            <ClockIcon />
            Open Recent
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled
            class="VaultDashboard__action--placeholder"
            onclick={() => on_view_all_tags()}
          >
            <TagsIcon />
            View All Tags
          </Button>
        </div>
      </section>

      <Separator />

      <section class="VaultDashboard__section">
        <h3 class="VaultDashboard__section-header">Recent Activity</h3>
        {#if has_recent}
          <ul class="VaultDashboard__recent-list">
            {#each capped_recent as note (note.id)}
              <li>
                <button
                  class="VaultDashboard__recent-item"
                  onclick={() => handle_note_click(note.path)}
                >
                  <FileTextIcon class="VaultDashboard__recent-icon" />
                  <span class="VaultDashboard__recent-title">{note.title}</span>
                  <span class="VaultDashboard__recent-path">{note.path}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="VaultDashboard__empty">
            <InboxIcon class="VaultDashboard__empty-icon" />
            <span class="VaultDashboard__empty-text">
              No recent notes yet
            </span>
          </div>
        {/if}
      </section>

      {#if vault_path}
        <Separator />

        <section class="VaultDashboard__section VaultDashboard__section--info">
          <h3 class="VaultDashboard__section-header">Vault Info</h3>
          <div class="VaultDashboard__info-grid">
            <span class="VaultDashboard__info-label">Name</span>
            <span class="VaultDashboard__info-value">
              {vault_name ?? "—"}
            </span>
            <span class="VaultDashboard__info-label">Path</span>
            <span
              class="VaultDashboard__info-value VaultDashboard__info-value--mono"
            >
              {vault_path}
            </span>
            <span class="VaultDashboard__info-label">Notes</span>
            <span class="VaultDashboard__info-value">
              {notes_display}
            </span>
            <span class="VaultDashboard__info-label">Folders</span>
            <span class="VaultDashboard__info-value">
              {folders_display}
            </span>
            <span class="VaultDashboard__info-label">Created</span>
            <span class="VaultDashboard__info-value">
              {format_date(created_at)}
            </span>
            <span class="VaultDashboard__info-label">Last Opened</span>
            <span class="VaultDashboard__info-value">
              {format_date(last_opened_at)}
            </span>
            <span class="VaultDashboard__info-label">Status</span>
            <span
              class="VaultDashboard__info-value VaultDashboard__info-status"
            >
              {#if is_available === null}
                —
              {:else if is_available}
                <CircleCheckIcon
                  class="VaultDashboard__info-status-icon VaultDashboard__info-status-icon--ok"
                />
                Available
              {:else}
                <CircleXIcon
                  class="VaultDashboard__info-status-icon VaultDashboard__info-status-icon--unavailable"
                />
                Unavailable
              {/if}
            </span>
          </div>
        </section>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => on_open_change(false)}>
        Close
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.VaultDashboard) {
    max-width: var(--size-dialog-lg);
  }

  .VaultDashboard__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-2) 0;
    min-width: 0;
  }

  :global(.VaultDashboard__title) {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  :global(.VaultDashboard__subtitle) {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .VaultDashboard__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .VaultDashboard__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  /* -- Overview stats -- */

  .VaultDashboard__stats {
    display: flex;
    gap: var(--space-3);
  }

  .VaultDashboard__stat {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius);
    background-color: var(--muted);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  :global(.VaultDashboard__stat-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .VaultDashboard__stat-value {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--foreground);
    line-height: 1;
  }

  .VaultDashboard__stat-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    line-height: 1;
  }

  /* -- Recent activity -- */

  .VaultDashboard__recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .VaultDashboard__recent-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .VaultDashboard__recent-item:hover {
    background-color: var(--muted);
  }

  .VaultDashboard__recent-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  :global(.VaultDashboard__recent-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .VaultDashboard__recent-title {
    font-size: var(--text-base);
    color: var(--foreground);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultDashboard__recent-path {
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

  /* -- Empty state -- */

  .VaultDashboard__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    border-radius: var(--radius);
    background-color: var(--muted);
  }

  :global(.VaultDashboard__empty-icon) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
    color: var(--muted-foreground);
    opacity: 0.5;
  }

  .VaultDashboard__empty-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  /* -- Quick actions -- */

  .VaultDashboard__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* -- Vault info -- */

  .VaultDashboard__section--info {
    opacity: 0.85;
  }

  .VaultDashboard__info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    align-items: baseline;
  }

  .VaultDashboard__info-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .VaultDashboard__info-value {
    font-size: var(--text-sm);
    color: var(--foreground);
    word-break: break-all;
  }

  .VaultDashboard__info-value--mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .VaultDashboard__info-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  :global(.VaultDashboard__info-status-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  :global(.VaultDashboard__info-status-icon--ok) {
    color: var(--interactive);
  }

  :global(.VaultDashboard__info-status-icon--unavailable) {
    color: var(--muted-foreground);
  }

  :global(.VaultDashboard__action--placeholder) {
    opacity: 0.5;
  }
</style>

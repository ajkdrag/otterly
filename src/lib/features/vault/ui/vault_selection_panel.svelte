<script lang="ts">
  import type { Vault } from "$lib/shared/types/vault";
  import type { VaultId } from "$lib/shared/types/ids";
  import * as Card from "$lib/components/ui/card";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { search_vaults } from "$lib/features/vault/domain/search_vaults";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import {
    clamp_vault_selection,
    duplicate_vault_names,
    move_vault_selection,
  } from "$lib/features/vault/domain/vault_switcher";
  import { onMount } from "svelte";
  import { Plus, Check, Pin, Trash2, X } from "@lucide/svelte";

  interface Props {
    recent_vaults: Vault[];
    pinned_vault_ids: VaultId[];
    current_vault_id: VaultId | null;
    is_loading?: boolean;
    error?: string | null;
    on_choose_vault_dir: () => void;
    on_select_vault: (vault_id: VaultId) => void;
    on_toggle_pin_vault: (vault_id: VaultId) => void;
    on_remove_vault: (vault_id: VaultId) => void;
    on_close?: () => void;
    is_dialog?: boolean;
    hide_choose_vault_button?: boolean;
  }

  let {
    recent_vaults,
    pinned_vault_ids,
    current_vault_id,
    is_loading = false,
    error = null,
    on_choose_vault_dir,
    on_select_vault,
    on_toggle_pin_vault,
    on_remove_vault,
    on_close,
    is_dialog = false,
    hide_choose_vault_button = false,
  }: Props = $props();
  let vault_query = $state("");
  let selected_vault_index = $state(0);
  let search_input_ref: HTMLInputElement | null = $state(null);
  let sections_ref: HTMLDivElement | null = $state(null);

  const filtered_recent_vaults = $derived(
    search_vaults(recent_vaults, vault_query),
  );

  const pinned_ids_set = $derived(new Set(pinned_vault_ids));

  const pinned_vaults = $derived(
    filtered_recent_vaults.filter((v) => pinned_ids_set.has(v.id)),
  );

  const unpinned_vaults = $derived(
    filtered_recent_vaults.filter((v) => !pinned_ids_set.has(v.id)),
  );

  const visible_vaults = $derived([...pinned_vaults, ...unpinned_vaults]);

  const has_sections = $derived(
    pinned_vaults.length > 0 && unpinned_vaults.length > 0,
  );

  const duplicate_names = $derived(duplicate_vault_names(recent_vaults));

  $effect(() => {
    selected_vault_index = clamp_vault_selection(
      selected_vault_index,
      visible_vaults.length,
    );
  });

  onMount(() => {
    if (is_dialog && search_input_ref) {
      setTimeout(() => search_input_ref?.focus(), 0);
    }
  });

  function handle_choose_vault(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    on_choose_vault_dir();
  }

  function handle_select_vault(vault: Vault, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!is_vault_available(vault)) {
      return;
    }
    on_select_vault(vault.id);
  }

  function handle_toggle_pin(vault_id: VaultId, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    on_toggle_pin_vault(vault_id);
  }

  function handle_remove_vault(vault_id: VaultId, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    on_remove_vault(vault_id);
  }

  function open_selected_vault() {
    if (selected_vault_index < 0) {
      return;
    }
    const selected_vault = visible_vaults[selected_vault_index];
    if (!selected_vault) {
      return;
    }
    if (
      is_loading ||
      selected_vault.id === current_vault_id ||
      !is_vault_available(selected_vault)
    ) {
      return;
    }
    on_select_vault(selected_vault.id);
  }

  function handle_search_keydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        visible_vaults.length,
        1,
      );
      scroll_selected_vault_into_view();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        visible_vaults.length,
        -1,
      );
      scroll_selected_vault_into_view();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      open_selected_vault();
      return;
    }
    if (event.key === "Escape" && on_close) {
      event.preventDefault();
      on_close();
    }
  }

  function scroll_selected_vault_into_view() {
    requestAnimationFrame(() => {
      sections_ref
        ?.querySelector<HTMLElement>(".VaultPanel__vault-item--highlighted")
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function flat_index_of(vault: Vault): number {
    return visible_vaults.indexOf(vault);
  }

  function format_path(path: string, vault_name: string): string {
    if (duplicate_names.has(vault_name)) {
      return path;
    }
    const parts = path.split(/[/\\\\]/);
    if (parts.length > 3) {
      return `.../${parts.slice(-2).join("/")}`;
    }
    return path;
  }

  function format_last_opened(vault: Vault): string {
    if (!vault.last_opened_at) {
      return "--";
    }
    return format_relative_time(vault.last_opened_at, Date.now());
  }

  function format_note_count(vault: Vault): string {
    if (typeof vault.note_count !== "number") {
      return "-- notes";
    }
    const suffix = vault.note_count === 1 ? "note" : "notes";
    return `${vault.note_count} ${suffix}`;
  }

  function is_vault_available(vault: Vault): boolean {
    return vault.is_available !== false;
  }
</script>

{#if is_dialog}
  <div class="VaultPanel">
    <div class="VaultPanel__dialog-header">
      {#if on_close}
        <button
          type="button"
          onclick={on_close}
          disabled={is_loading}
          class="VaultPanel__close-btn"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </button>
      {/if}
      <div class="space-y-1.5 pr-8">
        <Dialog.Title>Select a vault</Dialog.Title>
        <Dialog.Description>
          Choose a vault directory or select from recent vaults
        </Dialog.Description>
      </div>
    </div>
    <div class="VaultPanel__body">
      {@render content()}
    </div>
  </div>
{:else}
  <div class="p-0">
    <Card.Root
      class="gap-0 rounded-none border border-border bg-card p-5 shadow-none"
    >
      <Card.Header class="mb-4 p-0">
        <Card.Title class="font-heading text-xl font-medium tracking-tight">
          Select a vault
        </Card.Title>
        <Card.Description
          >Choose a vault directory or select from recent vaults</Card.Description
        >
      </Card.Header>
      <Card.Content class="p-0">
        <div class="VaultPanel__body">
          {@render content()}
        </div>
      </Card.Content>
    </Card.Root>
  </div>
{/if}

{#snippet vault_row(vault: Vault)}
  {@const index = flat_index_of(vault)}
  <div
    class="VaultPanel__vault-item"
    class:VaultPanel__vault-item--active={current_vault_id === vault.id}
    class:VaultPanel__vault-item--highlighted={index === selected_vault_index}
    class:VaultPanel__vault-item--unavailable={!is_vault_available(vault)}
    data-disabled={is_loading ||
      current_vault_id === vault.id ||
      !is_vault_available(vault)}
  >
    <button
      type="button"
      onclick={(e) => {
        handle_select_vault(vault, e);
      }}
      onmouseenter={() => {
        selected_vault_index = index;
      }}
      disabled={is_loading ||
        current_vault_id === vault.id ||
        !is_vault_available(vault)}
      class="VaultPanel__vault-select-btn"
    >
      <div class="VaultPanel__vault-info">
        <div class="VaultPanel__vault-name-row">
          <span class="VaultPanel__vault-name">{vault.name}</span>
          {#if !is_vault_available(vault)}
            <span class="VaultPanel__badge VaultPanel__badge--unavailable"
              >Unavailable</span
            >
          {/if}
        </div>
        <div
          class="VaultPanel__vault-path"
          class:VaultPanel__vault-path--disambiguated={duplicate_names.has(
            vault.name,
          )}
        >
          {format_path(vault.path, vault.name)}
        </div>
        <div
          class="VaultPanel__vault-meta"
          class:VaultPanel__vault-meta--dimmed={!is_vault_available(vault)}
        >
          <span>Opened {format_last_opened(vault)}</span>
          <span class="VaultPanel__meta-sep" aria-hidden="true">·</span>
          <span>{format_note_count(vault)}</span>
        </div>
      </div>
    </button>
    <div class="VaultPanel__vault-actions">
      <button
        type="button"
        class="VaultPanel__icon-btn"
        class:VaultPanel__icon-btn--active={pinned_ids_set.has(vault.id)}
        onclick={(event) => {
          handle_toggle_pin(vault.id, event);
        }}
        disabled={is_loading}
        aria-label={`Pin ${vault.name}`}
        aria-pressed={pinned_ids_set.has(vault.id)}
      >
        <Pin />
      </button>
      <button
        type="button"
        class="VaultPanel__icon-btn"
        onclick={(event) => {
          handle_remove_vault(vault.id, event);
        }}
        disabled={is_loading || current_vault_id === vault.id}
        aria-label={`Remove ${vault.name} from recent vaults`}
      >
        <Trash2 />
      </button>
      {#if current_vault_id === vault.id}
        <Check class="VaultPanel__check-icon" />
      {/if}
    </div>
  </div>
{/snippet}

{#snippet content()}
  {#if !hide_choose_vault_button}
    <Button
      onclick={(e: MouseEvent) => {
        handle_choose_vault(e);
      }}
      disabled={is_loading}
      class="VaultPanel__action-btn rounded-none"
    >
      <Plus />
      Choose vault directory
    </Button>
  {/if}

  {#if error}
    <div class="VaultPanel__error">
      {error}
    </div>
  {/if}

  {#if recent_vaults.length > 0}
    <div class="VaultPanel__recent">
      <div class="VaultPanel__search">
        <Input
          bind:ref={search_input_ref}
          type="text"
          value={vault_query}
          oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
            vault_query = event.currentTarget.value;
            selected_vault_index = 0;
          }}
          onkeydown={handle_search_keydown}
          placeholder="Search vaults..."
          aria-label="Search vaults"
        />
      </div>
      <div
        class="VaultPanel__sections"
        bind:this={sections_ref}
        class:VaultPanel__sections--dialog={is_dialog}
      >
        {#if pinned_vaults.length > 0}
          <div class="VaultPanel__section">
            <h3 class="VaultPanel__section-title">
              <Pin class="VaultPanel__section-icon" />
              Pinned
            </h3>
            <div class="VaultPanel__list">
              {#each pinned_vaults as vault (vault.id)}
                {@render vault_row(vault)}
              {/each}
            </div>
          </div>
        {/if}

        {#if has_sections}
          <div class="VaultPanel__divider" role="separator"></div>
        {/if}

        {#if unpinned_vaults.length > 0}
          <div class="VaultPanel__section">
            <h3 class="VaultPanel__section-title">Recent</h3>
            <div class="VaultPanel__list">
              {#each unpinned_vaults as vault (vault.id)}
                {@render vault_row(vault)}
              {/each}
            </div>
          </div>
        {/if}
      </div>
      {#if filtered_recent_vaults.length === 0}
        <div class="VaultPanel__empty-filter">No vaults match your search</div>
      {/if}
    </div>
  {:else}
    <div class="VaultPanel__empty">
      <p class="VaultPanel__empty-title">No recent vaults</p>
      <p class="VaultPanel__empty-desc">
        Choose a vault directory to get started
      </p>
    </div>
  {/if}
{/snippet}

<style>
  .VaultPanel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .VaultPanel__dialog-header {
    position: relative;
  }

  .VaultPanel__close-btn {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch);
    height: var(--size-touch);
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .VaultPanel__close-btn:hover:not(:disabled) {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .VaultPanel__close-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .VaultPanel__close-btn:disabled {
    opacity: 0.5;
  }

  .VaultPanel__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  :global(.VaultPanel__action-btn) {
    width: 100%;
  }

  .VaultPanel__error {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    background-color: var(--muted);
    font-size: var(--text-base);
    color: var(--destructive);
  }

  .VaultPanel__recent {
    display: flex;
    flex-direction: column;
  }

  .VaultPanel__search {
    margin-bottom: var(--space-3);
  }

  .VaultPanel__sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: var(--size-dialog-list-height-lg);
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  .VaultPanel__sections--dialog {
    max-height: none;
    overflow: visible;
  }

  .VaultPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .VaultPanel__section-title {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    padding-left: var(--space-1);
  }

  :global(.VaultPanel__section-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    opacity: 0.7;
  }

  .VaultPanel__divider {
    height: 1px;
    background-color: var(--border);
    margin: 0 var(--space-1);
  }

  .VaultPanel__list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
  }

  .VaultPanel__empty-filter {
    margin-top: var(--space-3);
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .VaultPanel__vault-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2-5) var(--space-3);
    border: 0;
    border-bottom: 1px solid var(--border);
    background-color: transparent;
    text-align: left;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .VaultPanel__vault-item:not([data-disabled="true"]):hover {
    background-color: var(--muted);
  }

  .VaultPanel__vault-item[data-disabled="true"] {
    cursor: not-allowed;
  }

  .VaultPanel__vault-item[data-disabled="true"]:not(
      .VaultPanel__vault-item--active
    ) {
    opacity: 0.5;
  }

  .VaultPanel__vault-item--unavailable {
    border-style: dashed;
    opacity: 0.7;
  }

  .VaultPanel__vault-item--unavailable[data-disabled="true"]:not(
      .VaultPanel__vault-item--active
    ) {
    opacity: 0.7;
  }

  .VaultPanel__vault-item--active {
    background-color: var(--interactive-bg);
    box-shadow: inset 2px 0 0 var(--interactive);
  }

  .VaultPanel__vault-item--highlighted:not(.VaultPanel__vault-item--active) {
    background-color: var(--muted);
  }

  .VaultPanel__vault-item--active:not([data-disabled="true"]):hover {
    background-color: var(--interactive-bg-hover);
  }

  .VaultPanel__vault-info {
    flex: 1;
    min-width: 0;
  }

  .VaultPanel__vault-select-btn {
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .VaultPanel__vault-select-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .VaultPanel__vault-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .VaultPanel__vault-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultPanel__badge {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: 0;
  }

  .VaultPanel__badge--unavailable {
    color: var(--destructive);
    background-color: color-mix(in oklch, var(--destructive) 10%, transparent);
    border: 1px solid color-mix(in oklch, var(--destructive) 20%, transparent);
  }

  .VaultPanel__vault-path {
    margin-top: var(--space-0-5);
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultPanel__vault-path--disambiguated {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: break-word;
  }

  .VaultPanel__vault-meta {
    margin-top: var(--space-1);
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .VaultPanel__vault-meta--dimmed {
    opacity: 0.6;
  }

  .VaultPanel__meta-sep {
    color: var(--border);
    font-weight: 700;
    user-select: none;
  }

  .VaultPanel__vault-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: var(--space-4);
  }

  .VaultPanel__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch);
    height: var(--size-touch);
    border: 1px solid transparent;
    border-radius: 0;
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .VaultPanel__icon-btn:hover:not(:disabled) {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .VaultPanel__icon-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .VaultPanel__icon-btn--active {
    color: var(--interactive);
    background-color: var(--interactive-bg);
    border-color: color-mix(in oklch, var(--interactive) 30%, transparent);
  }

  .VaultPanel__icon-btn--active:hover:not(:disabled) {
    background-color: var(--interactive-bg-hover);
  }

  .VaultPanel__icon-btn:disabled {
    opacity: 0.5;
  }

  :global(.VaultPanel__icon-btn svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }

  :global(.VaultPanel__check-icon) {
    flex-shrink: 0;
    width: var(--size-icon-md);
    height: var(--size-icon-md);
    color: var(--interactive);
  }

  .VaultPanel__empty {
    padding: var(--space-12) var(--space-6);
    text-align: center;
  }

  .VaultPanel__empty-title {
    margin-bottom: var(--space-2);
    font-size: var(--text-md);
    font-weight: 500;
    color: var(--foreground);
  }

  .VaultPanel__empty-desc {
    font-size: var(--text-base);
    color: var(--muted-foreground);
  }
</style>

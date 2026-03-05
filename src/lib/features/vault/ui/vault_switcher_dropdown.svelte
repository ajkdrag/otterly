<script lang="ts">
  import type { Vault } from "$lib/shared/types/vault";
  import type { VaultId } from "$lib/shared/types/ids";
  import type { VaultGitInfo } from "$lib/features/vault/state/vault_store.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { Separator } from "$lib/components/ui/separator";
  import { Input } from "$lib/components/ui/input";
  import { search_vaults } from "$lib/features/vault/domain/search_vaults";
  import {
    clamp_vault_selection,
    duplicate_vault_names,
    format_vault_path,
    move_vault_selection,
  } from "$lib/features/vault/domain/vault_switcher";
  import {
    ChevronDown,
    Check,
    Pin,
    Plus,
    Settings,
    Trash2,
    FolderOpen,
    GitBranch,
  } from "@lucide/svelte";

  interface Props {
    recent_vaults: Vault[];
    pinned_vault_ids: VaultId[];
    current_vault_id: VaultId | null;
    current_vault_name: string;
    open: boolean;
    git_cache: Map<VaultId, VaultGitInfo>;
    on_select_vault: (vault_id: VaultId) => void;
    on_choose_vault: () => void;
    on_manage_vaults: () => void;
    on_toggle_pin: (vault_id: VaultId) => void;
    on_remove_vault: (vault_id: VaultId) => void;
    on_reveal_vault: (vault_path: string) => void;
    on_dropdown_opened: () => void;
    on_select_folder: () => void;
  }

  let {
    recent_vaults,
    pinned_vault_ids,
    current_vault_id,
    current_vault_name,
    open = $bindable(false),
    git_cache,
    on_select_vault,
    on_choose_vault,
    on_manage_vaults,
    on_toggle_pin,
    on_remove_vault,
    on_reveal_vault,
    on_dropdown_opened,
    on_select_folder,
  }: Props = $props();

  let vault_query = $state("");
  let selected_vault_index = $state(0);
  let search_input_ref: HTMLInputElement | null = $state(null);

  const filtered_vaults = $derived(search_vaults(recent_vaults, vault_query));
  const pinned_ids_set = $derived(new Set(pinned_vault_ids));
  const pinned_vaults = $derived(
    filtered_vaults.filter((v) => pinned_ids_set.has(v.id)),
  );
  const unpinned_vaults = $derived(
    filtered_vaults.filter((v) => !pinned_ids_set.has(v.id)),
  );
  const has_sections = $derived(
    pinned_vaults.length > 0 && unpinned_vaults.length > 0,
  );
  const dup_names = $derived(duplicate_vault_names(recent_vaults));

  $effect(() => {
    selected_vault_index = clamp_vault_selection(
      selected_vault_index,
      filtered_vaults.length,
    );
  });

  $effect(() => {
    if (open) {
      vault_query = "";
      selected_vault_index = 0;
      on_dropdown_opened();
      setTimeout(() => search_input_ref?.focus(), 0);
    }
  });

  function handle_select(vault: Vault) {
    if (vault.id === current_vault_id || vault.is_available === false) return;
    on_select_vault(vault.id);
    open = false;
  }

  function handle_keydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        filtered_vaults.length,
        1,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        filtered_vaults.length,
        -1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const vault = filtered_vaults[selected_vault_index];
      if (vault) handle_select(vault);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      open = false;
    }
  }

  function vault_initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  function flat_index(vault: Vault): number {
    return filtered_vaults.indexOf(vault);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="VaultSwitcher__trigger"
        aria-label="Switch vault"
        onclick={(e: MouseEvent) => {
          if (!open) {
            on_select_folder();
          }
          const handler = props.onclick as
            | ((e: MouseEvent) => void)
            | undefined;
          handler?.(e);
        }}
      >
        <span class="VaultSwitcher__trigger-name">{current_vault_name}</span>
        <ChevronDown class="VaultSwitcher__chevron" />
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content class="VaultSwitcher__content" align="start" sideOffset={4}>
    <div class="VaultSwitcher__search">
      <Input
        bind:ref={search_input_ref}
        type="text"
        value={vault_query}
        oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
          vault_query = event.currentTarget.value;
          selected_vault_index = 0;
        }}
        onkeydown={handle_keydown}
        placeholder="Search vaults..."
        aria-label="Search vaults"
        class="VaultSwitcher__search-input"
      />
    </div>

    <div class="VaultSwitcher__list">
      {#if pinned_vaults.length > 0}
        <div class="VaultSwitcher__section">
          <div class="VaultSwitcher__section-label">
            <Pin class="VaultSwitcher__section-icon" />
            Pinned
          </div>
          {#each pinned_vaults as vault (vault.id)}
            {@render vault_item(vault)}
          {/each}
        </div>
      {/if}

      {#if has_sections}
        <Separator />
      {/if}

      {#if unpinned_vaults.length > 0}
        <div class="VaultSwitcher__section">
          <div class="VaultSwitcher__section-label">Recent</div>
          {#each unpinned_vaults as vault (vault.id)}
            {@render vault_item(vault)}
          {/each}
        </div>
      {/if}

      {#if filtered_vaults.length === 0}
        <div class="VaultSwitcher__empty">No vaults match your search</div>
      {/if}
    </div>

    <Separator />

    <div class="VaultSwitcher__footer">
      <button
        type="button"
        class="VaultSwitcher__footer-action"
        onclick={() => {
          open = false;
          on_choose_vault();
        }}
      >
        <Plus class="VaultSwitcher__footer-icon" />
        Add Vault
      </button>
      <button
        type="button"
        class="VaultSwitcher__footer-action"
        onclick={() => {
          open = false;
          on_manage_vaults();
        }}
      >
        <Settings class="VaultSwitcher__footer-icon" />
        Manage Vaults
      </button>
    </div>
  </Popover.Content>
</Popover.Root>

{#snippet vault_item(vault: Vault)}
  {@const idx = flat_index(vault)}
  {@const is_active = vault.id === current_vault_id}
  {@const is_unavailable = vault.is_available === false}
  {@const git_info = git_cache.get(vault.id)}
  <ContextMenu.Root>
    <ContextMenu.Trigger class="w-full">
      <button
        type="button"
        class="VaultSwitcher__item"
        class:VaultSwitcher__item--active={is_active}
        class:VaultSwitcher__item--highlighted={idx === selected_vault_index}
        class:VaultSwitcher__item--unavailable={is_unavailable}
        disabled={is_active || is_unavailable}
        onclick={() => handle_select(vault)}
        onmouseenter={() => {
          selected_vault_index = idx;
        }}
      >
        <div class="VaultSwitcher__avatar">
          {vault_initial(vault.name)}
        </div>
        <div class="VaultSwitcher__item-info">
          <div class="VaultSwitcher__item-name-row">
            <span class="VaultSwitcher__item-name">{vault.name}</span>
            {#if git_info}
              <span class="VaultSwitcher__git-badge">
                <GitBranch class="VaultSwitcher__git-icon" />
                {git_info.branch}
                {#if git_info.is_dirty}
                  <span class="VaultSwitcher__git-dirty">*</span>
                {/if}
              </span>
            {/if}
          </div>
          <span class="VaultSwitcher__item-path">
            {format_vault_path(vault.path, vault.name, dup_names)}
          </span>
        </div>
        {#if is_active}
          <Check class="VaultSwitcher__check" />
        {/if}
      </button>
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content>
        <ContextMenu.Item onSelect={() => on_toggle_pin(vault.id)}>
          <Pin class="VaultSwitcher__ctx-icon" />
          {pinned_ids_set.has(vault.id) ? "Unpin" : "Pin"}
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => on_reveal_vault(vault.path)}>
          <FolderOpen class="VaultSwitcher__ctx-icon" />
          Reveal in Finder
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          onSelect={() => on_remove_vault(vault.id)}
          disabled={is_active}
        >
          <Trash2 class="VaultSwitcher__ctx-icon" />
          Remove from list
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>
{/snippet}

<style>
  .VaultSwitcher__trigger {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-weight: 600;
    font-size: var(--text-sm);
    cursor: pointer;
    background: transparent;
    border: none;
    color: inherit;
    padding: 0;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .VaultSwitcher__trigger:hover {
    color: var(--foreground);
  }

  .VaultSwitcher__trigger-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.VaultSwitcher__chevron) {
    flex-shrink: 0;
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    opacity: 0.6;
    transition: transform var(--duration-fast) var(--ease-default);
  }

  :global(.VaultSwitcher__content) {
    width: 320px;
    max-height: 420px;
    display: flex;
    flex-direction: column;
    padding: var(--space-2) !important;
  }

  .VaultSwitcher__search {
    margin-bottom: var(--space-2);
  }

  :global(.VaultSwitcher__search-input) {
    height: var(--size-touch-sm) !important;
    font-size: var(--text-sm) !important;
  }

  .VaultSwitcher__list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    max-height: 280px;
  }

  .VaultSwitcher__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .VaultSwitcher__section-label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-1-5);
  }

  :global(.VaultSwitcher__section-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    opacity: 0.7;
  }

  .VaultSwitcher__empty {
    padding: var(--space-4);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .VaultSwitcher__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    text-align: left;
    color: inherit;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .VaultSwitcher__item:hover:not(:disabled) {
    background-color: var(--muted);
  }

  .VaultSwitcher__item--active {
    background-color: var(--interactive-bg);
    border-color: color-mix(in oklch, var(--interactive) 30%, transparent);
    cursor: default;
  }

  .VaultSwitcher__item--highlighted:not(.VaultSwitcher__item--active) {
    background-color: color-mix(in oklch, var(--muted) 80%, transparent);
    border-color: color-mix(in oklch, var(--interactive) 20%, transparent);
  }

  .VaultSwitcher__item--unavailable {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .VaultSwitcher__item:disabled {
    cursor: not-allowed;
  }

  .VaultSwitcher__avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background-color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--muted-foreground);
  }

  .VaultSwitcher__item--active .VaultSwitcher__avatar {
    background-color: var(--interactive);
    color: var(--interactive-foreground);
  }

  .VaultSwitcher__item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .VaultSwitcher__item-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .VaultSwitcher__item-name {
    font-size: var(--text-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultSwitcher__git-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-0-5);
    font-size: 10px;
    line-height: 1;
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background-color: color-mix(in oklch, var(--muted) 80%, transparent);
    color: var(--muted-foreground);
    border: 1px solid var(--border);
  }

  :global(.VaultSwitcher__git-icon) {
    width: 10px;
    height: 10px;
  }

  .VaultSwitcher__git-dirty {
    color: var(--warning, var(--destructive));
    font-weight: 700;
  }

  .VaultSwitcher__item-path {
    font-size: 11px;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.VaultSwitcher__check) {
    flex-shrink: 0;
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--interactive);
  }

  .VaultSwitcher__footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    padding-top: var(--space-1);
  }

  .VaultSwitcher__footer-action {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .VaultSwitcher__footer-action:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  :global(.VaultSwitcher__footer-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
  }

  :global(.VaultSwitcher__ctx-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    margin-right: var(--space-2);
  }
</style>

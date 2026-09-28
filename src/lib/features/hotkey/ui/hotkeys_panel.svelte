<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import HotkeyKey from "$lib/features/hotkey/ui/hotkey_key.svelte";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import XIcon from "@lucide/svelte/icons/x";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type {
    HotkeyBinding,
    HotkeyConfig,
    HotkeyCategory,
  } from "$lib/features/hotkey/types/hotkey_config";
  import { DEFAULT_HOTKEYS } from "$lib/features/hotkey/domain/default_hotkeys";
  import { format_hotkey_for_display } from "$lib/features/hotkey/domain/hotkey_validation";

  type Props = {
    config: HotkeyConfig;
    on_edit: (binding: HotkeyBinding) => void;
    on_clear: (action_id: string) => void;
    on_reset_single: (action_id: string) => void;
    on_reset_all: () => void;
  };

  let { config, on_edit, on_clear, on_reset_single, on_reset_all }: Props =
    $props();

  let search_query = $state("");

  const default_keys = $derived.by(() => {
    const m = new Map<string, string | null>();
    for (const b of DEFAULT_HOTKEYS) {
      m.set(b.action_id, b.key);
    }
    return m;
  });

  const category_order: HotkeyCategory[] = [
    "general",
    "navigation",
    "tabs",
    "editing",
    "git",
  ];

  const category_labels: Record<HotkeyCategory, string> = {
    general: "General",
    navigation: "Navigation",
    tabs: "Tabs",
    editing: "Editing",
    git: "Git",
  };

  const filtered_bindings = $derived.by(() => {
    const q = search_query.toLowerCase().trim();
    if (!q) return config.bindings;

    return config.bindings.filter((b) => {
      const display_key =
        b.key !== null ? format_hotkey_for_display(b.key).toLowerCase() : "";
      return (
        b.label.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        (b.key !== null && b.key.toLowerCase().includes(q)) ||
        display_key.includes(q)
      );
    });
  });

  const grouped = $derived.by(() => {
    const groups = new Map<HotkeyCategory, HotkeyBinding[]>();
    for (const b of filtered_bindings) {
      const list = groups.get(b.category) ?? [];
      list.push(b);
      groups.set(b.category, list);
    }
    return groups;
  });

  const conflicting_keys = $derived.by(() => {
    const key_counts = new Map<string, number>();
    for (const b of config.bindings) {
      if (b.key === null) continue;
      const compound = `${b.key}:${b.phase}`;
      key_counts.set(compound, (key_counts.get(compound) ?? 0) + 1);
    }
    const conflicts = new Set<string>();
    for (const [compound, count] of key_counts) {
      if (count > 1) conflicts.add(compound);
    }
    return conflicts;
  });

  function is_modified(binding: HotkeyBinding): boolean {
    const default_key = default_keys.get(binding.action_id);
    if (default_key === undefined) return false;
    return binding.key !== default_key;
  }

  function has_conflict(binding: HotkeyBinding): boolean {
    if (binding.key === null) return false;
    return conflicting_keys.has(`${binding.key}:${binding.phase}`);
  }

  const has_any_modifications = $derived(
    config.bindings.some((b) => is_modified(b)),
  );
</script>

<div class="HotkeysPanel">
  <div class="HotkeysPanel__toolbar">
    <div class="HotkeysPanel__search-wrapper">
      <SearchIcon class="HotkeysPanel__search-icon" />
      <Input
        type="text"
        placeholder="Filter hotkeys..."
        value={search_query}
        oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
          search_query = e.currentTarget.value;
        }}
        class="HotkeysPanel__search"
      />
    </div>
    {#if has_any_modifications}
      <Button
        variant="ghost"
        size="sm"
        class="HotkeysPanel__reset-all transition-colors"
        onclick={on_reset_all}
      >
        <RotateCcwIcon />
        Reset All
      </Button>
    {/if}
  </div>

  <div class="HotkeysPanel__list">
    {#each category_order as cat (cat)}
      {#if grouped.has(cat)}
        <div class="HotkeysPanel__section">
          <div class="HotkeysPanel__section-header">
            {category_labels[cat]}
          </div>

          <div class="HotkeysPanel__section-content">
            {#each grouped.get(cat) ?? [] as binding (binding.action_id)}
              {@const modified = is_modified(binding)}
              {@const conflict = has_conflict(binding)}
              <div
                class="HotkeysPanel__row"
                class:HotkeysPanel__row--modified={modified && !conflict}
                class:HotkeysPanel__row--conflict={conflict}
              >
                <div class="HotkeysPanel__label-group">
                  <span class="HotkeysPanel__label">
                    {binding.label}
                    {#if conflict}
                      <TriangleAlertIcon class="HotkeysPanel__conflict-icon" />
                    {/if}
                  </span>
                  <span class="HotkeysPanel__description"
                    >{binding.description}</span
                  >
                </div>

                <div class="HotkeysPanel__controls">
                  {#if modified}
                    <button
                      type="button"
                      class="HotkeysPanel__icon-btn"
                      aria-label={`Reset ${binding.label} hotkey to default`}
                      onclick={() => {
                        on_reset_single(binding.action_id);
                      }}
                      title="Reset to default"
                    >
                      <RotateCcwIcon />
                    </button>
                  {/if}

                  {#if binding.key !== null}
                    <button
                      type="button"
                      class="HotkeysPanel__icon-btn"
                      aria-label={`Clear ${binding.label} hotkey`}
                      onclick={() => {
                        on_clear(binding.action_id);
                      }}
                      title="Clear hotkey"
                    >
                      <XIcon />
                    </button>
                  {/if}

                  <button
                    class="HotkeysPanel__key-btn"
                    onclick={() => {
                      on_edit(binding);
                    }}
                    title="Click to change hotkey"
                  >
                    {#if binding.key !== null}
                      <HotkeyKey hotkey={binding.key} />
                    {:else}
                      <span class="HotkeysPanel__unbound">Not bound</span>
                    {/if}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if filtered_bindings.length === 0}
      <div class="HotkeysPanel__empty">
        No hotkeys matching "{search_query}"
      </div>
    {/if}
  </div>
</div>

<style>
  .HotkeysPanel {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    height: 100%;
    min-height: 0;
  }

  .HotkeysPanel__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .HotkeysPanel__search-wrapper {
    position: relative;
    flex: 1;
  }

  :global(.HotkeysPanel__search-icon) {
    position: absolute;
    left: var(--space-2-5);
    top: 50%;
    transform: translateY(-50%);
    width: var(--size-icon-sm) !important;
    height: var(--size-icon-sm) !important;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  :global(.HotkeysPanel__search) {
    width: 100%;
    padding-left: var(--space-8) !important;
  }

  :global(.HotkeysPanel__reset-all) {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-size: var(--text-xs);
  }

  :global(.HotkeysPanel__reset-all svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .HotkeysPanel__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .HotkeysPanel__section {
    display: flex;
    flex-direction: column;
  }

  .HotkeysPanel__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-1);
  }

  .HotkeysPanel__section-content {
    display: flex;
    flex-direction: column;
  }

  .HotkeysPanel__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .HotkeysPanel__row:hover {
    background-color: var(--muted);
  }

  .HotkeysPanel__row--modified {
    position: relative;
    padding-left: var(--space-5);
  }

  .HotkeysPanel__row--modified::before {
    content: "";
    position: absolute;
    inset-block: var(--space-1-5);
    inset-inline-start: var(--space-1);
    width: 2px;
    background-color: var(--interactive);
    border-radius: 1px;
  }

  .HotkeysPanel__row--conflict {
    position: relative;
    padding-left: var(--space-5);
  }

  .HotkeysPanel__row--conflict::before {
    content: "";
    position: absolute;
    inset-block: var(--space-1-5);
    inset-inline-start: var(--space-1);
    width: 2px;
    background-color: var(--destructive);
    border-radius: 1px;
  }

  .HotkeysPanel__label-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }

  .HotkeysPanel__label {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  :global(.HotkeysPanel__conflict-icon) {
    width: var(--size-icon-sm) !important;
    height: var(--size-icon-sm) !important;
    color: var(--destructive) !important;
    flex-shrink: 0;
  }

  .HotkeysPanel__description {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .HotkeysPanel__controls {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .HotkeysPanel__key-btn {
    display: flex;
    align-items: center;
    padding: var(--space-1) var(--space-1-5);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .HotkeysPanel__key-btn:hover {
    background-color: var(--interactive-bg);
  }

  .HotkeysPanel__key-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .HotkeysPanel__unbound {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-style: italic;
    padding: var(--space-0-5) var(--space-1);
  }

  .HotkeysPanel__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    color: transparent;
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .HotkeysPanel__row:hover .HotkeysPanel__icon-btn {
    color: var(--muted-foreground);
  }

  .HotkeysPanel__icon-btn:hover {
    color: var(--foreground);
  }

  .HotkeysPanel__icon-btn:focus-visible {
    color: var(--foreground);
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  :global(.HotkeysPanel__icon-btn svg) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .HotkeysPanel__empty {
    text-align: center;
    padding: var(--space-8) var(--space-4);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>

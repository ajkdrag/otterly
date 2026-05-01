<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input";
  import { HotkeyKey } from "$lib/features/hotkey";
  import { Button } from "$lib/components/ui/button";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import HashIcon from "@lucide/svelte/icons/hash";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SearchIcon from "@lucide/svelte/icons/search";
  import {
    EDITOR_SHORTCUTS,
    MARKDOWN_SYNTAX,
  } from "$lib/app/orchestration/help_data";
  import { format_hotkey_for_display } from "$lib/features/hotkey";
  import type { HotkeyConfig, HotkeyCategory } from "$lib/features/hotkey";

  type HelpCategory = "shortcuts" | "markdown" | "update";

  type Props = {
    open: boolean;
    hotkeys_config: HotkeyConfig;
    on_close: () => void;
    on_check_update?: () => void;
  };

  let { open, hotkeys_config, on_close, on_check_update = () => {} }: Props = $props();

  let active_category = $state<HelpCategory>("shortcuts");
  let search_query = $state("");

  const categories: {
    id: HelpCategory;
    label: string;
    icon: typeof KeyboardIcon;
  }[] = [
    { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
    { id: "markdown", label: "Markdown", icon: HashIcon },
    { id: "update", label: "检查更新", icon: RefreshCwIcon },
  ];

  const app_category_order: HotkeyCategory[] = [
    "general",
    "navigation",
    "tabs",
    "editing",
    "git",
  ];

  const app_category_labels: Record<HotkeyCategory, string> = {
    general: "General",
    navigation: "Navigation",
    tabs: "Tabs",
    editing: "Editing",
    git: "Git",
  };

  const filtered_app_bindings = $derived.by(() => {
    const q = search_query.toLowerCase().trim();
    if (!q) return hotkeys_config.bindings;
    return hotkeys_config.bindings.filter((b) => {
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

  const app_grouped = $derived.by(() => {
    const groups = new Map<HotkeyCategory, typeof filtered_app_bindings>();
    for (const b of filtered_app_bindings) {
      const list = groups.get(b.category) ?? [];
      list.push(b);
      groups.set(b.category, list);
    }
    return groups;
  });

  const filtered_editor_shortcuts = $derived.by(() => {
    const q = search_query.toLowerCase().trim();
    if (!q) return EDITOR_SHORTCUTS;
    return EDITOR_SHORTCUTS.filter((s) => {
      const display_key = format_hotkey_for_display(s.key).toLowerCase();
      return (
        s.label.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        display_key.includes(q)
      );
    });
  });

  const filtered_markdown = $derived.by(() => {
    const q = search_query.toLowerCase().trim();
    if (!q) return MARKDOWN_SYNTAX;
    return MARKDOWN_SYNTAX.filter(
      (m) =>
        m.label.toLowerCase().includes(q) || m.syntax.toLowerCase().includes(q),
    );
  });

  function handle_open_change(value: boolean) {
    if (!value) {
      on_close();
      search_query = "";
      active_category = "shortcuts";
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handle_open_change}>
  <Dialog.Content class="HelpDialog">
    <Dialog.Header class="sr-only">
      <Dialog.Title>Help</Dialog.Title>
      <Dialog.Description
        >Keyboard shortcuts and markdown syntax</Dialog.Description
      >
    </Dialog.Header>

    <div class="HelpDialog__panels">
      <nav class="HelpDialog__nav">
        <div class="HelpDialog__nav-header">Help</div>
        {#each categories as cat (cat.id)}
          <button
            class="HelpDialog__nav-item"
            class:HelpDialog__nav-item--selected={active_category === cat.id}
            onclick={() => {
              active_category = cat.id;
              search_query = "";
            }}
          >
            <cat.icon />
            <span>{cat.label}</span>
          </button>
        {/each}
      </nav>

      <div class="HelpDialog__content">
        {#if active_category === "shortcuts"}
          <h2 class="HelpDialog__content-header">Keyboard Shortcuts</h2>

          <div class="HelpDialog__search-wrapper">
            <SearchIcon class="HelpDialog__search-icon" />
            <Input
              type="text"
              placeholder="Filter shortcuts..."
              value={search_query}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                search_query = e.currentTarget.value;
              }}
              class="HelpDialog__search"
            />
          </div>

          <div class="HelpDialog__shortcut-list">
            {#each app_category_order as cat (cat)}
              {#if app_grouped.has(cat)}
                <div class="HelpDialog__section">
                  <div class="HelpDialog__section-header">
                    {app_category_labels[cat]}
                  </div>
                  <div class="HelpDialog__section-content">
                    {#each app_grouped.get(cat) ?? [] as binding (binding.action_id)}
                      <div class="HelpDialog__shortcut-row">
                        <span class="HelpDialog__shortcut-label"
                          >{binding.label}</span
                        >
                        {#if binding.key !== null}
                          <HotkeyKey hotkey={binding.key} />
                        {:else}
                          <span class="HelpDialog__unbound">Not bound</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}

            {#if filtered_editor_shortcuts.length > 0}
              <div class="HelpDialog__section">
                <div class="HelpDialog__section-header">Editor</div>
                <div class="HelpDialog__section-content">
                  {#each filtered_editor_shortcuts as shortcut (shortcut.label)}
                    <div class="HelpDialog__shortcut-row">
                      <span class="HelpDialog__shortcut-label"
                        >{shortcut.label}</span
                      >
                      <HotkeyKey hotkey={shortcut.key} />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if filtered_app_bindings.length === 0 && filtered_editor_shortcuts.length === 0}
              <div class="HelpDialog__empty">
                No shortcuts matching "{search_query}"
              </div>
            {/if}
          </div>
        {:else if active_category === "markdown"}
          <h2 class="HelpDialog__content-header">Markdown Syntax</h2>

          <div class="HelpDialog__search-wrapper">
            <SearchIcon class="HelpDialog__search-icon" />
            <Input
              type="text"
              placeholder="Filter syntax..."
              value={search_query}
              oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                search_query = e.currentTarget.value;
              }}
              class="HelpDialog__search"
            />
          </div>

          <div class="HelpDialog__markdown-list">
            {#each filtered_markdown as entry (entry.label)}
              <div class="HelpDialog__markdown-row">
                <code class="HelpDialog__markdown-syntax">{entry.syntax}</code>
                <span class="HelpDialog__markdown-label">{entry.label}</span>
              </div>
            {/each}

            {#if filtered_markdown.length === 0}
              <div class="HelpDialog__empty">
                No syntax matching "{search_query}"
              </div>
            {/if}
          </div>
        {:else if active_category === "update"}
          <h2 class="HelpDialog__content-header">🔄 检查更新</h2>
          <div class="HelpDialog__update-section">
            <p class="HelpDialog__update-desc">检查是否有新版本的 LeapGrowNotes 可用。</p>
            <Button onclick={() => { on_check_update(); on_close(); }}>
              🔄 检查更新
            </Button>
            <p class="HelpDialog__update-hint">当前版本: v1.0.0</p>
          </div>
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.HelpDialog) {
    max-width: 52rem;
    width: 52rem;
    height: 80vh;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    gap: 0;
    overflow: hidden;
  }

  .HelpDialog__panels {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .HelpDialog__nav {
    display: flex;
    flex-direction: column;
    width: 12rem;
    min-width: 12rem;
    padding: var(--space-3);
    gap: var(--space-0-5);
    border-inline-end: 1px solid var(--border);
    overflow-y: auto;
  }

  .HelpDialog__nav-header {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  .HelpDialog__nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2-5);
    width: 100%;
    min-height: var(--size-touch);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .HelpDialog__nav-item:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .HelpDialog__nav-item--selected {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .HelpDialog__nav-item--selected:hover {
    background-color: var(--interactive-bg-hover);
    color: var(--interactive);
  }

  .HelpDialog__nav-item :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
  }

  .HelpDialog__content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .HelpDialog__content-header {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
  }

  .HelpDialog__search-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  :global(.HelpDialog__search-icon) {
    position: absolute;
    left: var(--space-2-5);
    top: 50%;
    transform: translateY(-50%);
    width: var(--size-icon-sm) !important;
    height: var(--size-icon-sm) !important;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  :global(.HelpDialog__search) {
    width: 100%;
    padding-left: var(--space-8) !important;
  }

  .HelpDialog__shortcut-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .HelpDialog__section {
    display: flex;
    flex-direction: column;
  }

  .HelpDialog__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-1);
  }

  .HelpDialog__section-content {
    display: flex;
    flex-direction: column;
  }

  .HelpDialog__shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .HelpDialog__shortcut-row:hover {
    background-color: var(--muted);
  }

  .HelpDialog__shortcut-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .HelpDialog__unbound {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-style: italic;
  }

  .HelpDialog__markdown-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .HelpDialog__markdown-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .HelpDialog__markdown-row:hover {
    background-color: var(--muted);
  }

  .HelpDialog__markdown-syntax {
    flex-shrink: 0;
    min-width: 12rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-sm);
    color: var(--interactive);
    white-space: pre;
  }

  .HelpDialog__markdown-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .HelpDialog__empty {
    text-align: center;
    padding: var(--space-8) var(--space-4);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .HelpDialog__update-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }

  .HelpDialog__update-desc {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    margin: 0;
  }

  .HelpDialog__update-hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    margin: 0;
    font-family: var(--font-mono, monospace);
  }
</style>

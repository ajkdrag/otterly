<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import SearchIcon from "@lucide/svelte/icons/search";
  import FileIcon from "@lucide/svelte/icons/file-text";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CommandIcon from "@lucide/svelte/icons/terminal";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import LibraryIcon from "@lucide/svelte/icons/library";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import BookmarkIcon from "@lucide/svelte/icons/bookmark";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import LinkIcon from "@lucide/svelte/icons/link";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import type {
    OmnibarItem,
    OmnibarQueryTarget,
    OmnibarScope,
  } from "$lib/shared/types/search";
  import type { NoteMeta } from "$lib/shared/types/note";
  import type { CommandIcon as CommandIconType } from "$lib/features/search/types/command_palette";
  import type { EditorSettings } from "$lib/shared/types/editor_settings";
  import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
  import { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";
  import {
    parse_search_query,
    set_search_query_target,
  } from "$lib/features/search/domain/search_query_parser";
  import { format_hotkey_for_display } from "$lib/features/hotkey";
  import { ACTION_IDS } from "$lib/app";
  import type { HotkeyConfig } from "$lib/features/hotkey";
  import type { Component } from "svelte";

  const COMMAND_ICONS: Record<CommandIconType, Component> = {
    "file-plus": FilePlusIcon,
    "folder-open": FolderOpenIcon,
    settings: SettingsIcon,
    keyboard: KeyboardIcon,
    "git-branch": GitBranchIcon,
    history: HistoryIcon,
    bookmark: BookmarkIcon,
    link: LinkIcon,
    "refresh-cw": RefreshCwIcon,
  };

  const NOTE_FILTERS: Array<{
    label: string;
    target: OmnibarQueryTarget;
  }> = [
    { label: "All", target: "all" },
    { label: "Files", target: "files" },
    { label: "Content", target: "content" },
  ];

  type Props = {
    open: boolean;
    query: string;
    selected_index: number;
    is_searching: boolean;
    scope: OmnibarScope;
    items: OmnibarItem[];
    recent_notes: NoteMeta[];
    recent_command_ids: string[];
    available_action_ids: string[];
    editor_settings: EditorSettings;
    hotkeys_config: HotkeyConfig;
    has_multiple_vaults: boolean;
    on_open_change: (open: boolean) => void;
    on_query_change: (query: string) => void;
    on_selected_index_change: (index: number) => void;
    on_scope_change: (scope: OmnibarScope) => void;
    on_confirm: (item: OmnibarItem) => void;
  };

  let {
    open,
    query,
    selected_index,
    is_searching,
    scope,
    items,
    recent_notes,
    recent_command_ids,
    available_action_ids,
    editor_settings,
    hotkeys_config,
    has_multiple_vaults,
    on_open_change,
    on_query_change,
    on_selected_index_change,
    on_scope_change,
    on_confirm,
  }: Props = $props();

  let input_ref: HTMLInputElement | null = $state(null);
  let dialog_ref: HTMLElement | null = $state(null);
  let focus_before_open: HTMLElement | null = null;
  let mouse_moved = $state(false);

  $effect(() => {
    if (open) {
      mouse_moved = false;
    }
  });

  const active_query = $derived.by(() => parse_search_query(query));
  const is_command_mode = $derived(active_query.domain === "commands");
  const has_query = $derived(
    query.trim().length > 0 && (!is_command_mode || query.trim().length > 1),
  );
  const is_all_vaults = $derived(
    scope === "all_vaults" && active_query.domain === "notes",
  );
  const show_scope_toggle = $derived(
    has_multiple_vaults && active_query.domain === "notes",
  );
  const show_note_filters = $derived(active_query.domain === "notes");

  type VaultGroup = {
    vault_name: string;
    vault_id: string;
    items: OmnibarItem[];
    vault_note_count: number | null;
    vault_last_opened_at: number | null;
    vault_is_available: boolean;
  };

  type NoteSearchItem =
    | Extract<OmnibarItem, { kind: "note" }>
    | Extract<OmnibarItem, { kind: "cross_vault_note" }>;

  function format_relative_time(timestamp_ms: number): string {
    const delta = Date.now() - timestamp_ms;
    const seconds = Math.floor(delta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ago`;
    if (months > 0) return `${months}mo ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  }

  const vault_groups: VaultGroup[] = $derived.by(() => {
    if (!is_all_vaults || !has_query) return [];

    const groups = new Map<string, VaultGroup>();
    for (const item of items) {
      if (item.kind !== "cross_vault_note") continue;
      let group = groups.get(item.vault_id);
      if (!group) {
        group = {
          vault_name: item.vault_name,
          vault_id: item.vault_id,
          items: [],
          vault_note_count: item.vault_note_count ?? null,
          vault_last_opened_at: item.vault_last_opened_at ?? null,
          vault_is_available: item.vault_is_available !== false,
        };
        groups.set(item.vault_id, group);
      }
      group.items.push(item);
    }
    return Array.from(groups.values());
  });

  const sorted_commands = $derived.by(() => {
    const available_actions = new Set(available_action_ids);
    const available_commands = COMMANDS_REGISTRY.filter((command) =>
      available_actions.has(COMMAND_TO_ACTION_ID[command.id]),
    );
    const mru_index = new Map(recent_command_ids.map((id, i) => [id, i]));
    return [...available_commands].sort((a, b) => {
      const a_idx = mru_index.get(a.id);
      const b_idx = mru_index.get(b.id);
      if (a_idx !== undefined && b_idx !== undefined) return a_idx - b_idx;
      if (a_idx !== undefined) return -1;
      if (b_idx !== undefined) return 1;
      return 0;
    });
  });

  const display_items: OmnibarItem[] = $derived.by(() => {
    if (has_query) {
      const available_actions = new Set(available_action_ids);
      return items.filter(
        (item) =>
          item.kind !== "command" ||
          available_actions.has(COMMAND_TO_ACTION_ID[item.command.id]),
      );
    }

    if (is_command_mode) {
      return sorted_commands.map((command) => ({
        kind: "command" as const,
        command,
        score: 0,
      }));
    }

    if (is_all_vaults) return [];

    const recent: OmnibarItem[] = recent_notes.map((note) => ({
      kind: "recent_note" as const,
      note,
    }));
    return recent;
  });

  type QuerySection = {
    id: string;
    label: string;
    items: NoteSearchItem[];
  };

  const query_sections: QuerySection[] = $derived.by(() => {
    if (!has_query || is_all_vaults || active_query.domain !== "notes") {
      return [];
    }

    const note_items = display_items.filter(
      (item): item is NoteSearchItem =>
        item.kind === "note" || item.kind === "cross_vault_note",
    );

    if (active_query.target === "all") {
      const file_items = note_items.filter(
        (item) => item.match_kind === "file",
      );
      const content_items = note_items.filter(
        (item) => item.match_kind !== "file",
      );
      const sections: QuerySection[] = [];
      if (file_items.length > 0) {
        sections.push({ id: "files", label: "Files", items: file_items });
      }
      if (content_items.length > 0) {
        sections.push({
          id: "content",
          label: "Content",
          items: content_items,
        });
      }
      return sections;
    }

    const label =
      active_query.target === "content"
        ? "Content"
        : active_query.target === "path"
          ? "Paths"
          : active_query.target === "title"
            ? "Titles"
            : "Files";
    return note_items.length > 0
      ? [{ id: active_query.target, label, items: note_items }]
      : [];
  });

  const visible_items = $derived(
    is_all_vaults && has_query
      ? vault_groups.flatMap((group) => group.items)
      : query_sections.length > 0
        ? query_sections.flatMap((section) => section.items)
        : display_items,
  );

  $effect(() => {
    const last_index = visible_items.length - 1;
    const clamped_index = Math.max(0, Math.min(selected_index, last_index));
    if (clamped_index !== selected_index) {
      on_selected_index_change(clamped_index);
    }
  });

  const action_id_to_key = $derived.by(() => {
    const map = new Map<string, string>();
    for (const b of hotkeys_config.bindings) {
      if (b.key !== null) map.set(b.action_id, b.key);
    }
    return map;
  });

  const scope_shortcut = $derived(
    action_id_to_key.get(
      is_all_vaults
        ? ACTION_IDS.omnibar_open
        : ACTION_IDS.omnibar_open_all_vaults,
    ),
  );

  const show_recent_header = $derived(
    !has_query && !is_command_mode && !is_all_vaults && recent_notes.length > 0,
  );
  function get_item_id(item: OmnibarItem): string {
    switch (item.kind) {
      case "note":
        return `omni-note-${item.note.id}`;
      case "cross_vault_note":
        return `omni-xv-${item.vault_id}-${item.note.id}`;
      case "planned_note":
        return `omni-planned-${encodeURIComponent(item.target_path)}`;
      case "recent_note":
        return `omni-recent-${item.note.id}`;
      case "command":
        return `omni-cmd-${item.command.id}`;
      case "setting":
        return `omni-setting-${item.setting.key}`;
    }
  }

  function format_setting_value(
    key: keyof EditorSettings,
    settings: EditorSettings,
  ): string {
    switch (key) {
      case "attachment_folder":
        return settings.attachment_folder;
      case "store_attachments_with_note":
      case "show_hidden_files":
      case "autosave_enabled":
      case "git_autocommit_enabled":
      case "show_vault_dashboard_on_open":
        return settings[key] ? "On" : "Off";
      case "autosave_delay_ms":
        return `${settings.autosave_delay_ms} ms`;
      case "max_open_tabs":
        return `${settings.max_open_tabs} tabs`;
      case "editor_max_width_ch":
        return `${settings.editor_max_width_ch} ch`;
    }
  }

  function remember_focus_before_open() {
    const active_element = document.activeElement;
    focus_before_open =
      active_element instanceof HTMLElement ? active_element : null;
  }

  function restore_focus_after_close(event: Event) {
    const active_element = document.activeElement;
    const focus_is_in_omnibar =
      active_element instanceof HTMLElement &&
      dialog_ref?.contains(active_element);
    const focus_is_empty =
      active_element === document.body ||
      active_element === document.documentElement;

    if (!focus_is_in_omnibar && !focus_is_empty) {
      event.preventDefault();
      return;
    }

    const target = focus_before_open;
    if (!target?.isConnected) return;

    event.preventDefault();
    const closing_dialog = dialog_ref;
    requestAnimationFrame(() => {
      const current_focus = document.activeElement;
      const another_target_has_focus =
        current_focus !== document.body &&
        current_focus !== document.documentElement &&
        current_focus instanceof HTMLElement &&
        !closing_dialog?.contains(current_focus);
      if (another_target_has_focus) return;
      target.focus({ preventScroll: true });
    });
  }

  function apply_note_filter(target: OmnibarQueryTarget) {
    on_query_change(set_search_query_target(query, target));
    input_ref?.focus({ preventScroll: true });
  }

  function match_badge_label(item: OmnibarItem): string | null {
    if (item.kind !== "note" && item.kind !== "cross_vault_note") {
      return null;
    }

    switch (item.match_detail) {
      case "filename":
        return "Filename";
      case "title":
        return "Title";
      case "path":
        return "Path";
      case "content":
        return "Content";
      default:
        return item.match_kind === "file" ? "File" : null;
    }
  }

  function handle_keydown(event: KeyboardEvent) {
    if (!open || event.isComposing) return;
    // Tab reaches the scope, filter and command controls normally.
    if (event.defaultPrevented || event.target !== input_ref) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (visible_items.length > 0) {
          on_selected_index_change((selected_index + 1) % visible_items.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (visible_items.length > 0) {
          on_selected_index_change(
            (selected_index - 1 + visible_items.length) % visible_items.length,
          );
        }
        break;
      case "Enter":
        event.preventDefault();
        if (visible_items[selected_index]) {
          on_confirm(visible_items[selected_index]);
        }
        break;
    }
  }

  $effect(() => {
    if (!open) return;
    const ref = input_ref;
    if (!ref) return;
    setTimeout(() => {
      ref.focus({ preventScroll: true });
    }, 0);
  });

  $effect(() => {
    if (!open) return;
    const selected_item = visible_items[selected_index];
    if (!selected_item) return;
    document
      .getElementById(get_item_id(selected_item))
      ?.scrollIntoView?.({ block: "nearest" });
  });
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content
    bind:ref={dialog_ref}
    class="Omnibar"
    showCloseButton={false}
    onOpenAutoFocus={remember_focus_before_open}
    onCloseAutoFocus={restore_focus_after_close}
  >
    <Dialog.Header class="sr-only">
      <Dialog.Title>Search and commands</Dialog.Title>
      <Dialog.Description
        >Find notes, run commands, and customize your workspace.</Dialog.Description
      >
    </Dialog.Header>
    <div class="Omnibar__search">
      <SearchIcon />
      <Input
        bind:ref={input_ref}
        id="omnibar-input"
        type="text"
        role="combobox"
        aria-label="Search notes, commands, and settings"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="omnibar-results"
        aria-activedescendant={visible_items[selected_index]
          ? get_item_id(visible_items[selected_index])
          : undefined}
        placeholder={is_all_vaults
          ? "Search every vault by file, path, or content"
          : is_command_mode
            ? "Search commands and settings"
            : "Search notes…"}
        value={query}
        oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
          on_query_change(e.currentTarget.value);
        }}
        class="h-12 min-w-0 border-0 bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      {#if is_searching}
        <div class="Omnibar__spinner" aria-hidden="true"></div>
      {/if}
    </div>

    {#if show_scope_toggle || show_note_filters}
      <div class="Omnibar__toolbar">
        {#if show_scope_toggle}
          <Select.Root
            type="single"
            value={scope}
            onValueChange={(value) => {
              if (value === "current_vault" || value === "all_vaults")
                on_scope_change(value);
            }}
          >
            <Select.Trigger
              aria-label="Search scope"
              class="h-8 w-auto gap-2 border-0 bg-transparent dark:bg-transparent px-2 shadow-none"
              title={scope_shortcut
                ? `Switch scope (${format_hotkey_for_display(scope_shortcut)})`
                : "Search scope"}
            >
              <LibraryIcon class="size-3.5 text-muted-foreground" />
              {is_all_vaults ? "All vaults" : "This vault"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="current_vault" label="This vault"
                >This vault</Select.Item
              >
              <Select.Item value="all_vaults" label="All vaults"
                >All vaults</Select.Item
              >
            </Select.Content>
          </Select.Root>
        {/if}

        {#if show_note_filters}
          <div
            class="Omnibar__filter-strip"
            role="group"
            aria-label="Search in"
          >
            {#each NOTE_FILTERS as filter}
              <button
                class="Omnibar__filter-btn"
                class:Omnibar__filter-btn--active={active_query.target ===
                  filter.target}
                aria-pressed={active_query.target === filter.target}
                onclick={() => apply_note_filter(filter.target)}
              >
                {filter.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div
      id="omnibar-results"
      role="listbox"
      tabindex="-1"
      aria-label="Search results"
      class="Omnibar__list"
      onmousemove={() => {
        mouse_moved = true;
      }}
    >
      {#if is_all_vaults && has_query}
        {#if vault_groups.length > 0}
          {#each vault_groups as group, group_idx}
            <div role="group" aria-label={group.vault_name}>
              <div
                class="Omnibar__vault-facet"
                title={`${group.vault_note_count ?? "Unknown"} notes · ${group.vault_last_opened_at ? `Opened ${format_relative_time(group.vault_last_opened_at)}` : "Not opened yet"}`}
                class:Omnibar__vault-facet--bordered={group_idx > 0}
                class:Omnibar__vault-facet--unavailable={!group.vault_is_available}
              >
                <div class="Omnibar__vault-facet-header">
                  <LibraryIcon />
                  <span class="Omnibar__vault-facet-name"
                    >{group.vault_name}</span
                  >
                  {#if !group.vault_is_available}
                    <span class="Omnibar__vault-facet-unavailable"
                      >Unavailable</span
                    >
                  {/if}
                  <span class="Omnibar__vault-facet-count"
                    >{group.items.length}</span
                  >
                </div>
              </div>
              {#each group.items as item (get_item_id(item))}
                {@const vis_index = visible_items.indexOf(item)}
                <button
                  id={get_item_id(item)}
                  role="option"
                  tabindex="-1"
                  aria-selected={vis_index === selected_index}
                  class="Omnibar__item"
                  class:Omnibar__item--selected={vis_index === selected_index}
                  onmouseenter={() => {
                    if (!mouse_moved) return;
                    on_selected_index_change(vis_index);
                  }}
                  onclick={() => {
                    on_confirm(item);
                  }}
                >
                  {#if item.kind === "cross_vault_note"}
                    <div class="Omnibar__item-row">
                      <FileIcon />
                      <div class="Omnibar__item-content">
                        <span class="Omnibar__item-title"
                          >{item.note.title}</span
                        >
                        <span class="Omnibar__item-path">{item.note.path}</span>
                        {#if item.snippet && item.match_kind !== "file"}
                          <span class="Omnibar__item-snippet"
                            >{item.snippet}</span
                          >
                        {/if}
                      </div>
                      <div class="Omnibar__item-meta">
                        {#if match_badge_label(item)}
                          <span class="Omnibar__badge"
                            >{match_badge_label(item)}</span
                          >
                        {/if}
                      </div>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {:else if !is_searching}
          <div class="Omnibar__empty" aria-hidden="true">
            No results across vaults
          </div>
        {/if}
      {:else if query_sections.length > 0}
        {#each query_sections as section, section_index}
          <div role="group" aria-label={section.label}>
            <div
              class="Omnibar__header"
              role="presentation"
              class:Omnibar__header--bordered={section_index > 0}
            >
              <FileIcon />
              <span>{section.label}</span>
            </div>

            {#each section.items as item (get_item_id(item))}
              {@const section_item_index = visible_items.indexOf(item)}
              <button
                id={get_item_id(item)}
                role="option"
                tabindex="-1"
                aria-selected={section_item_index === selected_index}
                class="Omnibar__item"
                class:Omnibar__item--selected={section_item_index ===
                  selected_index}
                class:Omnibar__item--file={item.match_kind === "file"}
                onmouseenter={() => {
                  if (!mouse_moved) return;
                  on_selected_index_change(section_item_index);
                }}
                onclick={() => {
                  on_confirm(item);
                }}
              >
                {#if item.kind === "note"}
                  <div class="Omnibar__item-row">
                    <FileIcon />
                    <div class="Omnibar__item-content">
                      <span class="Omnibar__item-title">{item.note.title}</span>
                      <span class="Omnibar__item-path">{item.note.path}</span>
                      {#if item.snippet && item.match_kind !== "file"}
                        <span class="Omnibar__item-snippet">{item.snippet}</span
                        >
                      {/if}
                    </div>
                    {#if match_badge_label(item)}
                      <span class="Omnibar__badge"
                        >{match_badge_label(item)}</span
                      >
                    {/if}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/each}
      {:else}
        {#if show_recent_header && recent_notes.length > 0}
          <div class="Omnibar__header" role="presentation">
            <ClockIcon />
            <span>Recent</span>
          </div>
        {/if}

        {#each display_items as item, index (get_item_id(item))}
          <button
            id={get_item_id(item)}
            role="option"
            tabindex="-1"
            aria-selected={index === selected_index}
            class="Omnibar__item"
            class:Omnibar__item--selected={index === selected_index}
            onmouseenter={() => {
              if (!mouse_moved) return;
              on_selected_index_change(index);
            }}
            onclick={() => {
              on_confirm(item);
            }}
          >
            {#if item.kind === "note"}
              <div class="Omnibar__item-row">
                <FileIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title">{item.note.title}</span>
                  <span class="Omnibar__item-path">{item.note.path}</span>
                  {#if item.snippet}
                    <span class="Omnibar__item-snippet">{item.snippet}</span>
                  {/if}
                </div>
                {#if match_badge_label(item)}
                  <span class="Omnibar__badge">{match_badge_label(item)}</span>
                {/if}
              </div>
            {:else if item.kind === "recent_note"}
              <div class="Omnibar__item-row">
                <FileIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title" title={item.note.path}
                    >{item.note.name}</span
                  >
                  {#if item.note.path !== `${item.note.name}.md` && item.note.path !== item.note.name}
                    <span class="Omnibar__item-path">{item.note.path}</span>
                  {/if}
                </div>
              </div>
            {:else if item.kind === "command"}
              {@const IconComponent = COMMAND_ICONS[item.command.icon]}
              {@const command_key = action_id_to_key.get(
                COMMAND_TO_ACTION_ID[item.command.id],
              )}
              <div class="Omnibar__item-row">
                <span class="Omnibar__item-icon"><IconComponent /></span>
                <span class="Omnibar__item-title">{item.command.label}</span>
                {#if command_key}
                  <span class="Omnibar__item-shortcut"
                    >{format_hotkey_for_display(command_key)}</span
                  >
                {/if}
              </div>
              <div class="Omnibar__item-desc">{item.command.description}</div>
            {:else if item.kind === "setting"}
              <div class="Omnibar__item-row">
                <SettingsIcon />
                <span class="Omnibar__item-title">{item.setting.label}</span>
                <span class="Omnibar__badge">{item.setting.category}</span>
                <span class="Omnibar__badge"
                  >{format_setting_value(
                    item.setting.key,
                    editor_settings,
                  )}</span
                >
              </div>
              <div class="Omnibar__item-desc">{item.setting.description}</div>
            {:else if item.kind === "planned_note"}
              <div class="Omnibar__item-row">
                <LinkIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title">{item.target_path}</span>
                  <span class="Omnibar__item-path">{item.ref_count} refs</span>
                </div>
                <span class="Omnibar__badge">Planned</span>
              </div>
            {/if}
          </button>
        {/each}

        {#if display_items.length === 0 && !(is_all_vaults && !has_query)}
          <div class="Omnibar__empty" aria-hidden="true">
            {#if has_query}
              No results found
            {:else}
              No recent notes
            {/if}
          </div>
        {/if}
      {/if}

      {#if is_all_vaults && !has_query && !is_searching}
        <div class="Omnibar__empty" aria-hidden="true">
          Type to search across all vaults
        </div>
      {/if}
    </div>

    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {is_searching
        ? "Searching…"
        : visible_items.length > 0
          ? `${visible_items.length} results`
          : is_all_vaults && !has_query
            ? "Type to search across all vaults"
            : has_query
              ? "No results found"
              : "No recent notes"}
    </div>
    <div class="Omnibar__footer">
      <span class="Omnibar__hint"><kbd>↑ ↓</kbd> Navigate</span>
      <span class="Omnibar__hint"
        ><kbd>↵</kbd> {is_all_vaults ? "Open vault" : "Choose"}</span
      >
      <span class="Omnibar__hint"><kbd>Esc</kbd> Close</span>
      {#if show_scope_toggle && scope_shortcut}
        <button
          type="button"
          class="Omnibar__scope-hint"
          onclick={() =>
            on_scope_change(is_all_vaults ? "current_vault" : "all_vaults")}
        >
          <kbd>{format_hotkey_for_display(scope_shortcut)}</kbd>
          {is_all_vaults ? "This vault" : "All vaults"}
        </button>
      {/if}
      {#if !is_command_mode}
        <button
          type="button"
          class="Omnibar__commands"
          onclick={() => {
            on_query_change(">");
            input_ref?.focus({ preventScroll: true });
          }}
          ><CommandIcon class="size-3.5" /><span>Commands</span><kbd>&gt;</kbd
          ></button
        >
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<svelte:window onkeydown={handle_keydown} />

<style>
  :global(.Omnibar) {
    max-width: min(var(--size-dialog-xl), calc(100vw - 2rem));
    top: min(15vh, 8rem);
    translate: -50% 0;
    padding: 0 !important;
    overflow: hidden;
    gap: 0;
  }

  .Omnibar__search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 3.5rem;
    padding-inline: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  :global(.Omnibar__search svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .Omnibar__spinner {
    width: var(--size-icon);
    height: var(--size-icon);
    border: 2px solid var(--muted-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    flex-shrink: 0;
    animation: spin 1s linear infinite;
  }

  .Omnibar__filter-strip {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }

  .Omnibar__filter-btn {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__filter-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__filter-btn--active {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .Omnibar__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding: var(--space-1) var(--space-3);
    background: var(--background);
    border-bottom: 1px solid var(--border);
  }

  .Omnibar__list {
    min-height: 6rem;
    max-height: min(var(--size-dialog-list-height-lg), 55vh);
    scrollbar-gutter: stable;
    overflow-y: auto;
    padding-block: var(--space-2);
  }

  .Omnibar__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
    color: var(--muted-foreground);
  }

  .Omnibar__header--bordered {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  :global(.Omnibar__header svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .Omnibar__vault-facet {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    width: 100%;
    padding: var(--space-1-5) var(--space-3);
    text-align: left;
  }

  .Omnibar__vault-facet--bordered {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .Omnibar__vault-facet--unavailable {
    opacity: 0.6;
  }

  .Omnibar__vault-facet-header {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--interactive);
  }

  .Omnibar__vault-facet--unavailable .Omnibar__vault-facet-header {
    color: var(--muted-foreground);
  }

  :global(.Omnibar__vault-facet-header svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
  }

  .Omnibar__vault-facet-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__vault-facet-count {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--interactive-bg);
    color: var(--interactive);
    text-transform: none;
    letter-spacing: normal;
  }

  .Omnibar__vault-facet--unavailable .Omnibar__vault-facet-count {
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  .Omnibar__vault-facet-unavailable {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--destructive);
    color: var(--destructive-foreground);
    text-transform: none;
    letter-spacing: normal;
  }

  .Omnibar__item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
    flex-shrink: 0;
  }

  .Omnibar__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    width: 100%;
    min-height: 2.25rem;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    border-inline-start: 2px solid transparent;
    text-align: left;
    border-radius: 0;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__item:focus {
    outline: none;
  }

  .Omnibar__item--selected {
    border-inline-start-color: var(--primary);
    background-color: var(--interactive-bg);
  }

  .Omnibar__item--selected .Omnibar__item-title {
    color: var(--interactive);
  }

  .Omnibar__item-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .Omnibar__item-shortcut {
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  :global(.Omnibar__item-row svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .Omnibar__item--selected :global(.Omnibar__item-row svg) {
    color: var(--interactive);
  }

  .Omnibar__item-icon {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  :global(.Omnibar__item-icon svg) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .Omnibar__item--selected .Omnibar__item-icon {
    color: var(--interactive);
  }

  .Omnibar__item-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .Omnibar__item-title {
    font-weight: 500;
    font-size: var(--text-sm);
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__item-path,
  .Omnibar__item-snippet {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__item-desc {
    padding-inline-start: calc(var(--size-icon) + var(--space-2));
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .Omnibar__badge {
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  .Omnibar__empty {
    padding: var(--space-8) var(--space-3);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .Omnibar__footer {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
    background: var(--background);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .Omnibar__hint kbd {
    font-family: inherit;
    font-size: var(--text-xs);
    padding: 0;
    color: var(--foreground);
  }

  .Omnibar__scope-hint,
  .Omnibar__commands {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2rem;
    padding-inline: var(--space-2);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__commands {
    margin-left: auto;
  }

  .Omnibar__scope-hint kbd {
    font-family: var(--font-mono);
    color: var(--foreground);
  }

  .Omnibar__scope-hint:hover,
  .Omnibar__commands:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__filter-btn:focus-visible,
  .Omnibar__scope-hint:focus-visible,
  .Omnibar__commands:focus-visible,
  .Omnibar__item:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>

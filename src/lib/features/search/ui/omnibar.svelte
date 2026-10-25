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
  import CodeIcon from "@lucide/svelte/icons/code";
  import HashIcon from "@lucide/svelte/icons/hash";
  import TagIcon from "@lucide/svelte/icons/tag";
  import TextSearchIcon from "@lucide/svelte/icons/text-search";
  import CaseSensitiveIcon from "@lucide/svelte/icons/case-sensitive";
  import WholeWordIcon from "@lucide/svelte/icons/whole-word";
  import RegexIcon from "@lucide/svelte/icons/regex";
  import ReplaceIcon from "@lucide/svelte/icons/replace";
  import ReplaceAllIcon from "@lucide/svelte/icons/replace-all";
  import type {
    OmnibarItem,
    OmnibarMode,
    OmnibarScope,
    OmnibarTarget,
  } from "$lib/shared/types/search";
  import type { NoteMeta } from "$lib/shared/types/note";
  import { TagChip, TagExcerpt } from "$lib/features/tags";
  import type { TagMatch } from "$lib/features/tags";
  import type { CommandIcon as CommandIconType } from "$lib/features/search/types/command_palette";
  import type { EditorSettings } from "$lib/shared/types/editor_settings";
  import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
  import { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";
  import { parse_search_query } from "$lib/features/search/domain/search_query_parser";
  import {
    build_vault_find_request,
    vault_find_match_key,
    vault_find_request_key,
    type VaultFindInputs,
  } from "$lib/features/search/domain/vault_find_request";
  import {
    find_option_for_shortcut,
    type FindOption,
  } from "$lib/features/search/domain/find_option_shortcut";
  import type { VaultFindResults } from "$lib/features/search/state/search_store.svelte";
  import type {
    VaultFindMatchRow,
    VaultFindRow,
    VaultFindSelection,
  } from "$lib/features/search/types/vault_find";
  import OmnibarFindResults from "$lib/features/search/ui/omnibar_find_results.svelte";
  import { format_hotkey_for_display, HotkeyKey } from "$lib/features/hotkey";
  import { ACTION_IDS } from "$lib/app";
  import type { HotkeyConfig } from "$lib/features/hotkey";
  import { picker_shortcut_step } from "$lib/shared/utils/picker_navigation";
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
    code: CodeIcon,
    tag: TagIcon,
    "text-search": TextSearchIcon,
  };

  const TARGETS: Array<{ label: string; target: OmnibarTarget }> = [
    { label: "All", target: "all" },
    { label: "Files", target: "files" },
    { label: "Text", target: "text" },
  ];

  const FIND_OPTIONS: Array<{
    option: FindOption;
    label: string;
    keys: string;
    Icon: Component;
  }> = [
    {
      option: "case_sensitive",
      label: "Match case",
      keys: "Alt+C",
      Icon: CaseSensitiveIcon,
    },
    {
      option: "whole_word",
      label: "Match whole word",
      keys: "Alt+W",
      Icon: WholeWordIcon,
    },
    {
      option: "regex",
      label: "Use regular expression",
      keys: "Alt+R",
      Icon: RegexIcon,
    },
  ];

  // Key labels: glyphs on macOS, words elsewhere.
  const REPLACE_FILE_KEYS = format_hotkey_for_display("CmdOrCtrl+Shift+↵");
  const REPLACE_ALL_KEYS = format_hotkey_for_display("CmdOrCtrl+↵");

  // UIStore.vault_find, the Text mode inputs.
  type FindInputs = VaultFindInputs & {
    replacement: string;
    focus_nonce: number;
    selected_match: VaultFindSelection | null;
  };

  const TAG_MATCH_OPTIONS: Array<{ mode: TagMatch; label: string }> = [
    { mode: "all", label: "All tags" },
    { mode: "any", label: "Any tag" },
  ];

  type Props = {
    open: boolean;
    mode: OmnibarMode;
    // The tag picker was opened from Text mode and goes back there.
    return_to_find: boolean;
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
    // Tag filter chips and how they combine.
    tags: string[];
    tag_match: TagMatch;
    // The tagged notes search found more than it shows.
    truncated: boolean;
    // The tagged notes search failed, so an empty list means nothing.
    failed: boolean;
    is_indexing: boolean;
    find_inputs: FindInputs;
    find_results: VaultFindResults;
    is_replacing: boolean;
    git_enabled: boolean;
    on_open_change: (open: boolean) => void;
    on_query_change: (query: string) => void;
    on_selected_index_change: (index: number) => void;
    on_scope_change: (scope: OmnibarScope) => void;
    on_confirm: (item: OmnibarItem) => void;
    on_confirm_tag_suggestion: () => void;
    on_remove_tag: (tag: string) => void;
    on_tag_match_change: (mode: TagMatch) => void;
    on_open_tags: () => void;
    on_target_change: (target: OmnibarTarget) => void;
    // Options, replacement, globs and selection: ephemeral, written straight
    // into UIStore.vault_find. The pattern goes through on_query_change.
    on_find_inputs_change: (
      patch: Partial<Omit<FindInputs, "query" | "focus_nonce">>,
    ) => void;
    on_open_match: (row: VaultFindMatchRow) => void;
    on_replace_match: (row: VaultFindMatchRow) => void;
    on_replace_file: (row: VaultFindMatchRow) => void;
    on_replace_all: () => void;
  };

  let {
    open,
    mode,
    return_to_find,
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
    tags,
    tag_match,
    truncated,
    failed,
    is_indexing,
    find_inputs,
    find_results,
    is_replacing,
    git_enabled,
    on_open_change,
    on_query_change,
    on_selected_index_change,
    on_scope_change,
    on_confirm,
    on_confirm_tag_suggestion,
    on_remove_tag,
    on_tag_match_change,
    on_open_tags,
    on_target_change,
    on_find_inputs_change,
    on_open_match,
    on_replace_match,
    on_replace_file,
    on_replace_all,
  }: Props = $props();

  let input_ref: HTMLInputElement | null = $state(null);
  let replace_ref: HTMLInputElement | null = $state(null);
  // Which control has focus decides the footer, and the replace input
  // turns the preview on.
  let focused_control = $state<"main" | "replace" | "other">("main");
  let dialog_ref: HTMLElement | null = $state(null);
  let focus_before_open: HTMLElement | null = null;
  let mouse_moved = $state(false);

  $effect(() => {
    if (open) {
      mouse_moved = false;
    }
  });

  // Text mode: the input holds a raw find pattern (UIStore.vault_find.query),
  // the notes query is empty, and the find reactor searches.
  const is_find_mode = $derived(mode === "find");
  const active_query = $derived.by(() => parse_search_query(query));
  const is_command_mode = $derived(active_query.domain === "commands");
  const has_query = $derived(
    query.trim().length > 0 && (!is_command_mode || query.trim().length > 1),
  );
  const is_all_vaults = $derived(
    scope === "all_vaults" && active_query.domain === "notes",
  );
  // Picking a tag: the last token of the query starts with `#`.
  const is_tag_suggestions = $derived(active_query.domain === "tags");
  // Notes carrying the chip tags, narrowed by the query text.
  const is_tag_mode = $derived(
    !is_find_mode && tags.length > 0 && active_query.domain === "notes",
  );
  const show_scope_toggle = $derived(
    !is_find_mode &&
      has_multiple_vaults &&
      active_query.domain === "notes" &&
      tags.length === 0,
  );
  const show_target_strip = $derived(
    is_find_mode || active_query.domain === "notes",
  );
  const active_target = $derived(is_find_mode ? "text" : active_query.target);
  // Text walks one vault, so the all vaults scope does not offer it.
  const visible_targets = $derived(
    is_all_vaults ? TARGETS.filter(({ target }) => target !== "text") : TARGETS,
  );
  // The chips only do something in tag mode, in tag suggestions and in Text
  // mode.
  const show_tag_match = $derived(
    tags.length > 1 && (is_tag_mode || is_tag_suggestions || is_find_mode),
  );

  // "#a", "#a and #b", "#a, #b and #c".
  const tag_list_label = $derived.by(() => {
    const names = tags.map((tag) => `#${tag}`);
    const last = names.pop();
    if (names.length === 0) return last ?? "";
    return `${names.join(", ")} ${tag_match === "all" ? "and" : "or"} ${last}`;
  });
  // After a mode switch the old rows stay for one round trip to the index.
  // Each tag state keeps only its own kind, so Enter and the counts never use
  // a leftover row.
  const tag_items = $derived(items.filter((item) => item.kind === "tag"));
  const tagged_note_items = $derived(
    items.filter((item) => item.kind === "note"),
  );
  const tag_mode_count = $derived(
    truncated
      ? `${String(tagged_note_items.length)}+`
      : String(tagged_note_items.length),
  );

  // Text mode. The request the inputs ask for, and the one behind the rows on
  // screen. While a new search waits for its debounce they differ, and the
  // rows on screen are stale.
  const find_request_key = $derived.by(() => {
    if (!is_find_mode) return null;
    const request = build_vault_find_request(find_inputs, { tags, tag_match });
    return request && vault_find_request_key(request);
  });
  const results_request_key = $derived(
    find_results.request ? vault_find_request_key(find_results.request) : null,
  );
  const find_rows_stale = $derived(find_request_key !== results_request_key);
  const find_is_busy = $derived(
    find_results.status === "searching" || find_rows_stale,
  );

  // Flattened once per batch. A match row knows its position, and the map
  // finds the selected match without scanning up to 10,000 rows.
  const find_rows = $derived.by(() => {
    const rows: VaultFindRow[] = [];
    const match_rows = new Map<string, VaultFindMatchRow>();
    for (const file of find_results.files) {
      rows.push({
        kind: "file",
        key: `file:${file.path}`,
        row_index: rows.length,
        file,
      });
      for (const match of file.matches) {
        const row: VaultFindMatchRow = {
          kind: "match",
          key: vault_find_match_key(file.path, match.index),
          row_index: rows.length,
          file,
          match,
        };
        rows.push(row);
        match_rows.set(row.key, row);
      }
    }
    return { rows, match_rows };
  });

  // The selection is a match key, so it stays on its match while batches
  // insert files above it. It falls back to the first match when the key is
  // missing or belongs to other results (a new pattern, say).
  const selected_find_row = $derived.by((): VaultFindMatchRow | null => {
    const selection = find_inputs.selected_match;
    if (selection && selection.request_key === results_request_key) {
      const row = find_rows.match_rows.get(
        vault_find_match_key(selection.path, selection.index),
      );
      if (row) return row;
    }
    return (
      find_rows.rows.find(
        (row): row is VaultFindMatchRow => row.kind === "match",
      ) ?? null
    );
  });

  const find_preview_on = $derived(
    find_inputs.replacement !== "" || focused_control === "replace",
  );
  const find_query_invalid = $derived(
    find_results.error?.kind === "invalid_query",
  );
  const find_glob_invalid = $derived(
    find_results.error?.kind === "invalid_glob",
  );
  const find_option_id = $derived(
    selected_find_row
      ? `omnibar-find-row-${String(selected_find_row.row_index)}`
      : undefined,
  );

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
      active_query.target === "path"
        ? "Paths"
        : active_query.target === "title"
          ? "Titles"
          : "Files";
    return note_items.length > 0
      ? [{ id: active_query.target, label, items: note_items }]
      : [];
  });

  const visible_items = $derived(
    is_tag_suggestions
      ? tag_items
      : is_tag_mode
        ? tagged_note_items
        : is_all_vaults && has_query
          ? vault_groups.flatMap((group) => group.items)
          : query_sections.length > 0
            ? query_sections.flatMap((section) => section.items)
            : display_items,
  );

  $effect(() => {
    if (is_find_mode) return;
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

  const tags_shortcut = $derived(
    action_id_to_key.get(ACTION_IDS.omnibar_open_tags),
  );

  const find_shortcut = $derived(
    action_id_to_key.get(ACTION_IDS.omnibar_open_find),
  );

  // Text mode announces from its own list.
  const status_text = $derived.by(() => {
    if (is_find_mode) return "";
    if (is_searching) return "Searching…";
    if (is_tag_suggestions)
      return `${String(tag_items.length)} ${tag_items.length === 1 ? "tag" : "tags"}`;
    if (is_tag_mode && failed) return "Couldn't search tagged notes";
    if (is_tag_mode)
      return `${tag_mode_count} ${tagged_note_items.length === 1 ? "note" : "notes"} tagged ${tag_list_label}`;
    if (visible_items.length > 0)
      return `${String(visible_items.length)} results`;
    if (is_all_vaults && !has_query) return "Type to search across all vaults";
    return has_query ? "No results found" : "No recent notes";
  });

  const show_recent_header = $derived(
    !has_query && !is_command_mode && !is_all_vaults && recent_notes.length > 0,
  );

  const active_option_id = $derived.by(() => {
    if (is_find_mode) return find_option_id;
    const item = visible_items[selected_index];
    return item ? get_item_id(item) : undefined;
  });

  const main_input_placeholder = $derived.by(() => {
    if (is_find_mode) {
      return tags.length > 0 ? "Find in tagged notes" : "Find in vault";
    }
    if (is_all_vaults) return "Search every vault by file, path, or content";
    if (is_command_mode) return "Search commands and settings";
    if (tags.length > 0) return "Search within tagged notes";
    return "Search notes, or type # for tags";
  });
  function get_item_id(item: OmnibarItem): string {
    switch (item.kind) {
      case "note":
        return `omni-note-${item.note.id}`;
      case "cross_vault_note":
        return `omni-xv-${item.vault_id}-${item.note.id}`;
      case "planned_note":
        return `omni-planned-${encodeURIComponent(item.target_path)}`;
      case "tag":
        return `omni-tag-${encodeURIComponent(item.tag)}`;
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
      case "editor_zoom":
        return `${Math.round(settings.editor_zoom * 100)}%`;
      case "heading_filename_delimiter":
        return settings.heading_filename_delimiter === "hyphens"
          ? "Hyphens"
          : "Spaces";
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

  function choose_target(target: OmnibarTarget) {
    on_target_change(target);
    input_ref?.focus({ preventScroll: true });
  }

  function target_title(target: OmnibarTarget): string | undefined {
    if (target !== "text") return undefined;
    const title = "Find exact text, with regex and replace";
    return find_shortcut
      ? `${title} (${format_hotkey_for_display(find_shortcut)})`
      : title;
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

  function remove_tag_and_refocus(tag: string) {
    on_remove_tag(tag);
    input_ref?.focus({ preventScroll: true });
  }

  // The inputs are only one line tall. A press on the row padding, the icon
  // or a chip label would move focus out of them, so keep focus in the row's
  // input. Buttons and inputs handle their own presses.
  function keep_focus_in(get_input: () => HTMLInputElement | null) {
    return (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, input")
      ) {
        return;
      }
      event.preventDefault();
      get_input()?.focus({ preventScroll: true });
    };
  }

  function track_focus(event: FocusEvent) {
    focused_control =
      event.target === input_ref
        ? "main"
        : event.target === replace_ref
          ? "replace"
          : "other";
  }

  // Esc goes one step at a time: it drops the `#...` token while picking a
  // tag, then brings focus back to the main input from any other control,
  // then closes. preventDefault keeps bits-ui from closing the dialog.
  function handle_escape(event: KeyboardEvent) {
    if (is_tag_suggestions) {
      event.preventDefault();
      on_query_change(active_query.before_tag ?? "");
      return;
    }
    const active_element = document.activeElement;
    if (
      active_element instanceof HTMLElement &&
      active_element !== input_ref &&
      dialog_ref?.contains(active_element)
    ) {
      event.preventDefault();
      input_ref?.focus({ preventScroll: true });
    }
  }

  function handle_keydown(event: KeyboardEvent) {
    if (!open || event.isComposing || event.defaultPrevented) return;
    if (is_find_mode) {
      handle_find_keydown(event);
      return;
    }
    // Tab reaches the scope, filter and command controls normally.
    if (event.target !== input_ref) return;

    const is_plain_key =
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
    const last_tag = tags.at(-1);
    if (
      event.key === "Backspace" &&
      is_plain_key &&
      query === "" &&
      last_tag !== undefined
    ) {
      event.preventDefault();
      on_remove_tag(last_tag);
      return;
    }

    const shortcut_step = picker_shortcut_step(event);
    if (shortcut_step !== null) {
      event.preventDefault();
      move_selection(shortcut_step);
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move_selection(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move_selection(-1);
        break;
      case "Enter":
        event.preventDefault();
        if (is_tag_suggestions) {
          // Not the row on screen: it may belong to an older partial.
          on_confirm_tag_suggestion();
        } else if (visible_items[selected_index]) {
          on_confirm(visible_items[selected_index]);
        }
        break;
    }
  }

  function move_selection(step: 1 | -1) {
    if (visible_items.length === 0) return;
    on_selected_index_change(
      (selected_index + step + visible_items.length) % visible_items.length,
    );
  }

  // Text mode keys, in the pattern and in the replace input. Enter is "the
  // main thing for where you are": open in the pattern, replace in the
  // replace input. Replace keys only work there, where the preview is on, so
  // you only ever replace what you can see.
  function handle_find_keydown(event: KeyboardEvent) {
    const in_pattern = event.target === input_ref;
    const in_replace = event.target === replace_ref;
    if (!in_pattern && !in_replace) return;

    const option = find_option_for_shortcut(event);
    if (option) {
      event.preventDefault();
      on_find_inputs_change({ [option]: !find_inputs[option] });
      return;
    }

    const is_plain_key =
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
    const last_tag = tags.at(-1);
    if (
      in_pattern &&
      event.key === "Backspace" &&
      is_plain_key &&
      find_inputs.query === "" &&
      last_tag !== undefined
    ) {
      event.preventDefault();
      on_remove_tag(last_tag);
      return;
    }

    const step =
      picker_shortcut_step(event) ??
      (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null);
    if (step !== null) {
      event.preventDefault();
      move_find_selection(step);
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();
    // The rows on screen belong to an older request until the new search
    // starts. They are dimmed, and Enter waits.
    if (find_rows_stale) return;
    const row = selected_find_row;
    const is_mod = event.metaKey || event.ctrlKey;
    if (in_pattern) {
      if (row && !is_mod) on_open_match(row);
      return;
    }
    if (is_mod && event.shiftKey) {
      if (row) on_replace_file(row);
    } else if (is_mod) {
      on_replace_all();
    } else if (row) {
      on_replace_match(row);
    }
  }

  // Wraps around like the Notes list, and skips the file rows.
  function move_find_selection(step: 1 | -1) {
    const { rows } = find_rows;
    const from = selected_find_row;
    if (!from || results_request_key === null) return;
    let index = from.row_index;
    for (let tries = 0; tries < rows.length; tries += 1) {
      index = (index + step + rows.length) % rows.length;
      const row = rows[index];
      if (row?.kind !== "match") continue;
      on_find_inputs_change({
        selected_match: {
          request_key: results_request_key,
          path: row.file.path,
          index: row.match.index,
        },
      });
      return;
    }
  }

  // Focus the main input when the omnibar opens or the mode changes. Text
  // mode also selects the pattern, so typing replaces it: on open, on a
  // switch from Notes, and when Find in Vault asks again (focus_nonce).
  // Coming back from the tag picker keeps the caret instead, since you were
  // in the middle of that pattern.
  const input_mode = $derived(
    !open
      ? null
      : is_find_mode
        ? "find"
        : return_to_find
          ? "tag_picker_for_find"
          : "notes",
  );
  const find_focus_nonce = $derived(find_inputs.focus_nonce);
  let previous_input_mode: typeof input_mode = null;
  $effect(() => {
    const current = input_mode;
    void find_focus_nonce;
    const ref = input_ref;
    const previous = previous_input_mode;
    previous_input_mode = current;
    if (current === null || !ref) return;
    const select_pattern =
      current === "find" && previous !== "tag_picker_for_find";
    setTimeout(() => {
      ref.focus({ preventScroll: true });
      if (select_pattern) ref.select();
    }, 0);
  });

  // Past two lines of chips the field scrolls. Bring the input back into view
  // whenever a chip comes or goes. Every omnibar patch replaces the store
  // object, so reading tags.length here directly would rerun this, and force
  // a layout, on every keystroke. The $derived only changes with the count.
  const tag_count = $derived(tags.length);
  $effect(() => {
    if (tag_count === 0) return;
    input_ref?.scrollIntoView({ block: "nearest" });
  });

  $effect(() => {
    if (!open || is_find_mode) return;
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
    onEscapeKeydown={handle_escape}
    onfocusin={track_focus}
  >
    <Dialog.Header class="sr-only">
      <Dialog.Title>Search and commands</Dialog.Title>
      <Dialog.Description
        >Find notes, run commands, and customize your workspace.</Dialog.Description
      >
    </Dialog.Header>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="Omnibar__search"
      class:Omnibar__search--with-replace={is_find_mode}
      onmousedown={keep_focus_in(() => input_ref)}
    >
      <SearchIcon />
      <div class="Omnibar__field">
        {#if tags.length > 0}
          <div class="contents" role="group" aria-label="Tag filters">
            {#each tags as tag, index (tag)}
              <!-- The join word wraps together with the chip after it, so a
                   line never ends on a lone "and" or "or". -->
              <span class="Omnibar__chip">
                {#if index > 0}
                  <span class="Omnibar__chip-join" aria-hidden="true"
                    >{tag_match === "all" ? "and" : "or"}</span
                  >
                {/if}
                <TagChip
                  {tag}
                  size="md"
                  on_remove={() => {
                    remove_tag_and_refocus(tag);
                  }}
                />
              </span>
            {/each}
          </div>
        {/if}
        <Input
          bind:ref={input_ref}
          id="omnibar-input"
          type="text"
          role="combobox"
          aria-label={is_find_mode
            ? "Find in vault"
            : "Search notes, commands, and settings"}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="omnibar-results"
          aria-activedescendant={active_option_id}
          aria-invalid={is_find_mode && find_query_invalid}
          autocomplete="off"
          autocorrect={is_find_mode ? "off" : undefined}
          autocapitalize={is_find_mode ? "off" : undefined}
          spellcheck={is_find_mode ? "false" : undefined}
          placeholder={main_input_placeholder}
          value={is_find_mode ? find_inputs.query : query}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            on_query_change(e.currentTarget.value);
          }}
          class="h-(--omnibar-line) min-w-0 flex-[1_1_12rem] border-0 bg-transparent dark:bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      {#if is_find_mode}
        <!-- Out of the Tab order: Tab goes from the pattern to Replace, and
             Alt+C/W/R flip them from either input. A press keeps focus in
             the input you were typing in. -->
        <div
          class="Omnibar__find-options"
          role="group"
          aria-label="Find options"
        >
          {#each FIND_OPTIONS as { option, label, keys, Icon } (option)}
            <button
              type="button"
              tabindex="-1"
              class="text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-foreground aria-pressed:ring-ring flex size-6 items-center justify-center rounded-sm aria-pressed:ring-1"
              aria-pressed={find_inputs[option]}
              aria-label={label}
              aria-keyshortcuts={keys}
              title={`${label} (${format_hotkey_for_display(keys)})`}
              onmousedown={(event) => {
                event.preventDefault();
              }}
              onclick={() => {
                on_find_inputs_change({ [option]: !find_inputs[option] });
              }}
            >
              <Icon class="size-4" />
            </button>
          {/each}
        </div>
      {/if}
      {#if show_tag_match}
        <div class="Omnibar__tag-match" role="group" aria-label="Tag match">
          {#each TAG_MATCH_OPTIONS as option (option.mode)}
            <button
              type="button"
              class="Omnibar__tag-match-btn"
              class:Omnibar__tag-match-btn--active={tag_match === option.mode}
              aria-pressed={tag_match === option.mode}
              onclick={() => {
                on_tag_match_change(option.mode);
                input_ref?.focus({ preventScroll: true });
              }}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
      <!-- Always in the row, so a search starting or ending does not change
           the field width and reflow the chips. -->
      <div
        class="Omnibar__spinner"
        class:Omnibar__spinner--active={is_find_mode
          ? find_is_busy
          : is_searching}
        aria-hidden="true"
      ></div>
    </div>

    {#if is_find_mode}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="Omnibar__search Omnibar__replace"
        onmousedown={keep_focus_in(() => replace_ref)}
      >
        <ReplaceIcon />
        <div class="Omnibar__field">
          <Input
            bind:ref={replace_ref}
            type="text"
            aria-label="Replace"
            aria-controls="omnibar-results"
            aria-activedescendant={find_option_id}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Replace"
            value={find_inputs.replacement}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
              on_find_inputs_change({ replacement: e.currentTarget.value });
            }}
            class="h-(--omnibar-line) min-w-0 flex-1 border-0 bg-transparent dark:bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 shrink-0 items-center justify-center rounded-sm disabled:opacity-50"
          aria-label="Replace all"
          title={find_results.stats?.truncated
            ? "Too many results to replace all. Narrow the search."
            : `Replace all (${REPLACE_ALL_KEYS})`}
          disabled={!find_results.can_replace_all ||
            is_replacing ||
            find_rows_stale}
          onmousedown={(event) => {
            event.preventDefault();
          }}
          onclick={on_replace_all}
        >
          <ReplaceAllIcon class="size-4" />
        </button>
      </div>
    {/if}

    {#if is_find_mode || show_scope_toggle || show_target_strip}
      <div class="Omnibar__toolbar">
        {#if is_find_mode}
          <Input
            type="text"
            aria-label="Files to include"
            aria-invalid={find_glob_invalid}
            autocomplete="off"
            spellcheck="false"
            placeholder="Include, e.g. *.md, daily"
            value={find_inputs.include}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
              on_find_inputs_change({ include: e.currentTarget.value });
            }}
            class="h-7 min-w-0 flex-1 text-xs md:text-xs"
          />
          <Input
            type="text"
            aria-label="Files to exclude"
            aria-invalid={find_glob_invalid}
            autocomplete="off"
            spellcheck="false"
            placeholder="Exclude, e.g. archive/**"
            value={find_inputs.exclude}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
              on_find_inputs_change({ exclude: e.currentTarget.value });
            }}
            class="h-7 min-w-0 flex-1 text-xs md:text-xs"
          />
        {:else if show_scope_toggle}
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

        {#if show_target_strip}
          <div
            class="Omnibar__filter-strip"
            role="group"
            aria-label="Search in"
          >
            {#each visible_targets as { label, target } (target)}
              <button
                type="button"
                class="Omnibar__filter-btn"
                class:Omnibar__filter-btn--active={active_target === target}
                aria-pressed={active_target === target}
                title={target_title(target)}
                onclick={() => {
                  choose_target(target);
                }}
              >
                {label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if is_find_mode}
      <OmnibarFindResults
        results={find_results}
        rows={find_rows.rows}
        selected_row={selected_find_row}
        stale={find_rows_stale}
        has_pattern={find_inputs.query !== ""}
        preview_on={find_preview_on}
        replacement={find_inputs.replacement}
        can_replace={!is_replacing && !find_rows_stale}
        {git_enabled}
        tag_list_label={tags.length > 0 ? tag_list_label : ""}
        include={find_inputs.include}
        {is_indexing}
        {on_open_match}
        {on_replace_match}
        {on_replace_file}
      />
    {:else}
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
        {#if is_tag_suggestions}
          {#if tag_items.length > 0}
            <div
              role="group"
              aria-label={active_query.text ? "Tags" : "Top tags"}
            >
              <div class="Omnibar__header" role="presentation">
                <HashIcon />
                <span>{active_query.text ? "Tags" : "Top tags"}</span>
              </div>
              {#each tag_items as item, index (get_item_id(item))}
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
                    input_ref?.focus({ preventScroll: true });
                  }}
                >
                  <div class="Omnibar__item-row">
                    <TagIcon />
                    <span class="Omnibar__item-title text-sm font-medium"
                      ><span class="text-muted-foreground">#</span
                      >{item.tag}</span
                    >
                    <span
                      class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
                      >{item.count}</span
                    >
                  </div>
                </button>
              {/each}
            </div>
          {:else if !is_searching}
            <div class="Omnibar__empty" aria-hidden="true">
              {#if is_indexing}
                Indexing notes. Tags show up when it finishes.
              {:else if active_query.text}
                <p>No tags match #{active_query.text}</p>
                <p class="text-xs">Press Space to search it as text</p>
              {:else}
                No tags yet. Type #tag in a note to add one.
              {/if}
            </div>
          {/if}
        {:else if is_tag_mode}
          <div role="group" aria-label={`Notes tagged ${tag_list_label}`}>
            <div class="Omnibar__header" role="presentation">
              <HashIcon />
              <span class="min-w-0 truncate">Notes tagged {tag_list_label}</span
              >
              {#if tagged_note_items.length > 0}
                <span class="ml-auto shrink-0 tabular-nums"
                  >{tag_mode_count}</span
                >
              {/if}
            </div>
            {#each tagged_note_items as item, index (get_item_id(item))}
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
                <div class="Omnibar__item-row">
                  <FileIcon />
                  <div class="Omnibar__item-content">
                    <span class="Omnibar__item-title">{item.note.title}</span>
                    <span class="Omnibar__item-path">{item.note.path}</span>
                    {#if item.snippet}
                      <span class="Omnibar__item-snippet"
                        ><TagExcerpt text={item.snippet} {tags} /></span
                      >
                    {/if}
                  </div>
                  {#if match_badge_label(item)}
                    <span class="Omnibar__badge">{match_badge_label(item)}</span
                    >
                  {/if}
                </div>
              </button>
            {/each}
          </div>
          {#if tagged_note_items.length === 0 && !is_searching}
            <div class="Omnibar__empty" aria-hidden="true">
              {#if failed}
                Couldn't search tagged notes. Try again.
              {:else if active_query.text}
                No tagged notes match "{active_query.text}"
              {:else if tag_match === "all" && tags.length > 1}
                <p>No notes have all of these tags</p>
                <p class="text-xs">Remove a tag with ⌫ or match any tag</p>
              {:else if tags.length === 1}
                No notes with #{tags[0]}
              {:else}
                No notes with these tags
              {/if}
            </div>
          {/if}
        {:else if is_all_vaults && has_query}
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
                          <span class="Omnibar__item-path"
                            >{item.note.path}</span
                          >
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
                    <span class="Omnibar__badge">{match_badge_label(item)}</span
                    >
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
                    <span class="Omnibar__item-shortcut">
                      <HotkeyKey hotkey={command_key} />
                    </span>
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
                    <span class="Omnibar__item-path">{item.ref_count} refs</span
                    >
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
    {/if}

    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {status_text}
    </div>
    <div class="Omnibar__footer">
      {#if !is_find_mode || focused_control !== "other"}
        <span class="Omnibar__hint"><kbd>↑ ↓</kbd> Navigate</span>
      {/if}
      {#if is_find_mode}
        <!-- The keys depend on where you are. Esc from any other control
             brings you back to the pattern. -->
        {#if focused_control === "replace"}
          <span class="Omnibar__hint"><kbd>↵</kbd> Replace</span>
          <span class="Omnibar__hint"
            ><kbd>{REPLACE_FILE_KEYS}</kbd> Replace in file</span
          >
          <span class="Omnibar__hint"
            ><kbd>{REPLACE_ALL_KEYS}</kbd> Replace all</span
          >
          <span class="Omnibar__hint"><kbd>Esc</kbd> Back</span>
          {#if !git_enabled}
            <span class="Omnibar__warning"
              >Not a git vault: this cannot be undone</span
            >
          {/if}
        {:else if focused_control === "main"}
          <span class="Omnibar__hint"><kbd>↵</kbd> Open</span>
          <span class="Omnibar__hint"><kbd>⇥</kbd> Replace</span>
          <span class="Omnibar__hint"><kbd>Esc</kbd> Close</span>
        {:else}
          <span class="Omnibar__hint"><kbd>Esc</kbd> Back</span>
        {/if}
      {:else if is_tag_suggestions}
        <span class="Omnibar__hint"><kbd>↵</kbd> Add tag</span>
        <span class="Omnibar__hint"><kbd>Esc</kbd> Cancel</span>
      {:else if is_tag_mode}
        <span class="Omnibar__hint"><kbd>↵</kbd> Open</span>
        <span class="Omnibar__hint"><kbd>⌫</kbd> Remove tag</span>
        <span class="Omnibar__hint"><kbd>Esc</kbd> Close</span>
      {:else}
        <span class="Omnibar__hint"
          ><kbd>↵</kbd> {is_all_vaults ? "Open vault" : "Choose"}</span
        >
        <span class="Omnibar__hint"><kbd>Esc</kbd> Close</span>
      {/if}
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
      {#if !is_command_mode && !is_tag_suggestions && !(is_find_mode && focused_control === "replace")}
        <button
          type="button"
          class="Omnibar__scope-hint Omnibar__tags-button"
          title={tags_shortcut
            ? `Filter by tag (${format_hotkey_for_display(tags_shortcut)})`
            : "Filter by tag"}
          onclick={() => {
            on_open_tags();
            input_ref?.focus({ preventScroll: true });
          }}
          ><HashIcon class="size-3.5" /><span>Tags</span>{#if tags_shortcut}<kbd
              >{format_hotkey_for_display(tags_shortcut)}</kbd
            >{/if}</button
        >
      {/if}
      {#if !is_find_mode && !is_command_mode && !is_tag_suggestions && !is_tag_mode}
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

  /* Every item in the search row is one line tall, the TagChip md height.
     The padding makes a one line row 3.5rem tall, with or without chips.
     The icon, the Match control and the spinner sit on the first line. */
  .Omnibar__search {
    --omnibar-line: 1.5rem;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  .Omnibar__search > :global(svg),
  .Omnibar__spinner {
    width: var(--size-icon);
    height: var(--size-icon);
    margin-block: calc((var(--omnibar-line) - var(--size-icon)) / 2);
    flex-shrink: 0;
  }

  .Omnibar__search > :global(svg) {
    color: var(--muted-foreground);
  }

  /* Chips and the input wrap in one box with one gap. Same height and font
     size, so the placeholder sits on the chip baseline. The input drops to
     its own line below 12rem instead of squeezing. Past two lines the box
     scrolls, so more chips never push the results down. */
  .Omnibar__field {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1-5);
    min-width: 0;
    max-height: calc(2 * var(--omnibar-line) + var(--space-1-5));
    overflow: hidden auto;
    /* The app styles its scrollbars, so WebKit gives them real width.
       Reserve it, so the chips do not reflow when a third line starts the
       scrollbar. */
    scrollbar-gutter: stable;
  }

  .Omnibar__chip {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    min-width: 0;
    max-width: 100%;
  }

  .Omnibar__chip-join {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  /* The replace row lines up under the find row: same padding, same icon
     column. The two rows read as one block. */
  .Omnibar__search--with-replace {
    padding-bottom: var(--space-2);
  }

  .Omnibar__replace {
    padding-top: 0;
  }

  .Omnibar__find-options {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--space-0-5);
    height: var(--omnibar-line);
  }

  .Omnibar__warning {
    color: var(--destructive);
  }

  .Omnibar__tags-button {
    margin-left: auto;
  }

  .Omnibar__tags-button kbd {
    font-family: var(--font-mono);
    color: var(--foreground);
  }

  .Omnibar__spinner {
    border: 2px solid var(--muted-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    visibility: hidden;
  }

  .Omnibar__spinner--active {
    visibility: visible;
    animation: spin 1s linear infinite;
  }

  .Omnibar__filter-strip {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }

  .Omnibar__filter-btn,
  .Omnibar__tag-match-btn {
    display: inline-flex;
    align-items: center;
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__filter-btn {
    min-height: 2rem;
    padding: var(--space-1) var(--space-2);
  }

  .Omnibar__filter-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__filter-btn--active {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  /* A segmented control one line tall. Neutral colors on purpose: the
     filter strip's active button has the same tint as the chips and would
     read as one more chip. */
  .Omnibar__tag-match {
    display: flex;
    flex-shrink: 0;
    height: var(--omnibar-line);
    padding: var(--space-0-5);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .Omnibar__tag-match-btn {
    padding-inline: var(--space-2);
  }

  .Omnibar__tag-match-btn:hover {
    color: var(--foreground);
  }

  .Omnibar__tag-match-btn--active {
    background-color: var(--muted);
    color: var(--foreground);
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
  }

  /* Palette rows are dense, so shrink the shared key caps one step. */
  .Omnibar__item-shortcut :global(.HotkeyKey__kbd) {
    font-size: var(--text-xs);
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
  .Omnibar__tag-match-btn:focus-visible,
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

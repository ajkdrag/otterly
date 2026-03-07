import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  ClosedTabEntry,
  Tab,
  TabEditorSnapshot,
  TabId,
} from "$lib/features/tab/types/tab";
import type { NotePath } from "$lib/shared/types/ids";
import { parent_folder_path } from "$lib/shared/utils/path";
import { toast } from "svelte-sonner";

function make_closed_tab_entry(
  tab: Tab,
  snapshot: TabEditorSnapshot | null,
): ClosedTabEntry {
  const base = {
    title: tab.title,
    scroll_top: snapshot?.scroll_top ?? 0,
    cursor: snapshot?.cursor ?? null,
  };
  if (tab.kind === "note") {
    return { ...base, kind: "note", note_path: tab.note_path };
  }
  return {
    ...base,
    kind: "document",
    file_path: tab.file_path,
    file_type: tab.file_type,
  };
}

export function ensure_tab_capacity(input: ActionRegistrationInput): boolean {
  const { stores, services } = input;
  const max = stores.ui.editor_settings.max_open_tabs;
  if (stores.tab.tabs.length < max) return true;

  const victim = stores.tab.find_evictable_tab();
  if (!victim) {
    toast.error("All tabs have unsaved changes. Save or close a tab first.");
    return false;
  }

  const snapshot = stores.tab.get_snapshot(victim.id);
  stores.tab.push_closed_history(make_closed_tab_entry(victim, snapshot));
  stores.tab.close_tab(victim.id);
  if (victim.kind === "note") {
    services.editor.close_buffer?.(victim.note_path);
  }
  return true;
}

export function try_open_tab(
  input: ActionRegistrationInput,
  note_path: NotePath,
  title: string,
): Tab | null {
  const { stores } = input;
  const existing = stores.tab.find_tab_by_path(note_path);
  if (existing) {
    stores.tab.activate_tab(existing.id);
    return existing;
  }
  if (!ensure_tab_capacity(input)) return null;
  return stores.tab.open_tab(note_path, title);
}

export async function capture_active_tab_snapshot(
  input: ActionRegistrationInput,
) {
  const { stores, services } = input;
  const active_id = stores.tab.active_tab_id;
  if (!active_id) return;

  const flushed = services.editor.flush();
  if (flushed) {
    stores.editor.set_markdown(flushed.note_id, flushed.markdown);
  }

  const cursor = stores.editor.cursor;
  stores.tab.set_snapshot(active_id, {
    scroll_top: services.editor.get_scroll_top(),
    cursor,
  });

  const open_note = stores.editor.open_note;
  if (open_note) {
    stores.tab.set_cached_note(active_id, open_note);
    stores.tab.set_dirty(active_id, open_note.is_dirty);
    if (open_note.is_dirty && stores.ui.editor_settings.autosave_enabled) {
      await services.note.save_note(null, true);
    }
  }
}

export async function open_active_tab_note(input: ActionRegistrationInput) {
  const { stores, services } = input;
  const active_tab = stores.tab.active_tab;
  if (!active_tab || active_tab.kind !== "note") {
    stores.editor.clear_open_note();
    stores.outline.clear();
    return;
  }

  const current_note = stores.editor.open_note;
  if (current_note && current_note.meta.path === active_tab.note_path) {
    return;
  }

  stores.ui.clear_selected_items();

  const snapshot = stores.tab.get_snapshot(active_tab.id);

  const cached = stores.tab.get_cached_note(active_tab.id);
  if (cached) {
    stores.editor.set_open_note(cached);
    const folder = parent_folder_path(active_tab.note_path);
    stores.ui.set_selected_folder_path(folder);
    services.editor.set_scroll_top(snapshot?.scroll_top ?? 0);
    return;
  }

  const result = await services.note.open_note(active_tab.note_path, false);
  if (result.status === "opened") {
    stores.ui.set_selected_folder_path(result.selected_folder_path);
    const open_note = stores.editor.open_note;
    if (open_note) {
      stores.tab.set_cached_note(active_tab.id, open_note);
    }
    services.editor.set_scroll_top(snapshot?.scroll_top ?? 0);
  }
}

export function reset_close_confirm(stores: ActionRegistrationInput["stores"]) {
  stores.ui.tab_close_confirm = {
    open: false,
    tab_id: null,
    tab_title: "",
    pending_dirty_tab_ids: [],
    close_mode: "single",
    keep_tab_id: null,
    apply_to_all: false,
  };
}

export function start_batch_close_confirm(
  stores: ActionRegistrationInput["stores"],
  dirty_tabs: Tab[],
  close_mode: "all" | "other" | "right",
  keep_tab_id: string | null,
) {
  const first = dirty_tabs[0];
  if (!first) return;
  stores.ui.tab_close_confirm = {
    open: true,
    tab_id: first.id,
    tab_title: first.title,
    pending_dirty_tab_ids: dirty_tabs.slice(1).map((t) => t.id),
    close_mode,
    keep_tab_id,
    apply_to_all: false,
  };
}

export async function save_dirty_tab(
  input: ActionRegistrationInput,
  tab_id: string,
): Promise<void> {
  const { stores, services } = input;

  if (stores.tab.active_tab_id === tab_id) {
    await services.note.save_note(null, true);
    return;
  }

  const cached = stores.tab.get_cached_note(tab_id);
  if (cached) {
    await services.note.write_note_content(cached.meta.path, cached.markdown);
    stores.tab.set_dirty(tab_id, false);
  }
}

export async function execute_batch_close(
  input: ActionRegistrationInput,
): Promise<void> {
  const { stores } = input;
  const { close_mode, keep_tab_id } = stores.ui.tab_close_confirm;

  reset_close_confirm(stores);

  switch (close_mode) {
    case "all": {
      stores.tab.close_all_tabs();
      stores.editor.clear_open_note();
      break;
    }
    case "other": {
      if (keep_tab_id) {
        stores.tab.close_other_tabs(keep_tab_id);
        await open_active_tab_note(input);
      }
      break;
    }
    case "right": {
      if (keep_tab_id) {
        stores.tab.close_tabs_to_right(keep_tab_id);
        await open_active_tab_note(input);
      }
      break;
    }
  }
}

export async function advance_or_finish_batch(
  input: ActionRegistrationInput,
): Promise<void> {
  const { stores } = input;
  const { pending_dirty_tab_ids } = stores.ui.tab_close_confirm;

  if (pending_dirty_tab_ids.length > 0) {
    const next_id = pending_dirty_tab_ids[0];
    const next_tab = stores.tab.tabs.find((t) => t.id === next_id);
    stores.ui.tab_close_confirm = {
      ...stores.ui.tab_close_confirm,
      tab_id: next_id ?? null,
      tab_title: next_tab?.title ?? "",
      pending_dirty_tab_ids: pending_dirty_tab_ids.slice(1),
      apply_to_all: false,
    };
    return;
  }

  await execute_batch_close(input);
}

export async function close_tab_immediate(
  input: ActionRegistrationInput,
  tab_id: TabId,
) {
  const { stores, services } = input;
  const tab = stores.tab.tabs.find((t) => t.id === tab_id);
  if (!tab) return;

  const snapshot = stores.tab.get_snapshot(tab_id);
  stores.tab.push_closed_history(make_closed_tab_entry(tab, snapshot));

  const was_active = stores.tab.active_tab_id === tab_id;
  stores.tab.close_tab(tab_id);
  if (tab.kind === "note") {
    services.editor.close_buffer?.(tab.note_path);
  }

  if (was_active) {
    await open_active_tab_note(input);
  }
}

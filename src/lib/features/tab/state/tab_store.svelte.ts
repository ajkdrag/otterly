import type { NotePath } from "$lib/shared/types/ids";
import type {
  Tab,
  TabId,
  TabEditorSnapshot,
  ClosedTabEntry,
} from "$lib/features/tab/types/tab";
import type { OpenNoteState } from "$lib/shared/types/editor";
import {
  note_name_from_path,
  paths_equal_ignore_case,
} from "$lib/shared/utils/path";

const MAX_CLOSED_HISTORY = 10;

export class TabStore {
  tabs = $state<Tab[]>([]);
  active_tab_id = $state<TabId | null>(null);
  closed_tab_history = $state<ClosedTabEntry[]>([]);
  editor_snapshots = $state<Map<TabId, TabEditorSnapshot>>(new Map());
  note_cache = $state<Map<TabId, OpenNoteState>>(new Map());
  mru_order = $state<TabId[]>([]);

  get active_tab(): Tab | null {
    if (!this.active_tab_id) return null;
    return this.tabs.find((t) => t.id === this.active_tab_id) ?? null;
  }

  get has_tabs(): boolean {
    return this.tabs.length > 0;
  }

  get active_tab_index(): number {
    if (!this.active_tab_id) return -1;
    return this.tabs.findIndex((t) => t.id === this.active_tab_id);
  }

  get mru_previous_tab_id(): TabId | null {
    return this.mru_order[1] ?? null;
  }

  private move_to_front_mru(tab_id: TabId) {
    const next = this.mru_order.filter((id) => id !== tab_id);
    this.mru_order = [tab_id, ...next];
  }

  find_tab_by_path(note_path: NotePath): Tab | null {
    return (
      this.tabs.find(
        (t) =>
          t.kind === "note" && paths_equal_ignore_case(t.note_path, note_path),
      ) ?? null
    );
  }

  open_tab(note_path: NotePath, title: string): Tab {
    const existing = this.find_tab_by_path(note_path);
    if (existing) {
      this.active_tab_id = existing.id;
      this.move_to_front_mru(existing.id);
      return existing;
    }

    const tab: Tab = {
      kind: "note",
      id: note_path,
      note_path,
      title,
      is_pinned: false,
      is_dirty: false,
    };

    this.tabs = [...this.tabs, tab];
    this.active_tab_id = tab.id;
    this.mru_order = [tab.id, ...this.mru_order];
    return tab;
  }

  open_document_tab(file_path: string, title: string, file_type: string): Tab {
    const existing = this.tabs.find(
      (t) => t.kind === "document" && t.file_path === file_path,
    );
    if (existing) {
      this.active_tab_id = existing.id;
      this.move_to_front_mru(existing.id);
      return existing;
    }

    const tab: Tab = {
      kind: "document",
      id: file_path,
      file_path,
      file_type,
      title,
      is_pinned: false,
      is_dirty: false,
    };

    this.tabs = [...this.tabs, tab];
    this.active_tab_id = tab.id;
    this.mru_order = [tab.id, ...this.mru_order];
    return tab;
  }

  activate_tab(tab_id: TabId) {
    const tab = this.tabs.find((t) => t.id === tab_id);
    if (!tab) return;
    this.active_tab_id = tab_id;
    this.move_to_front_mru(tab_id);
  }

  close_tab(tab_id: TabId): TabId | null {
    const index = this.tabs.findIndex((t) => t.id === tab_id);
    if (index === -1) return this.active_tab_id;

    this.editor_snapshots = new Map(
      [...this.editor_snapshots].filter(([id]) => id !== tab_id),
    );
    this.note_cache = new Map(
      [...this.note_cache].filter(([id]) => id !== tab_id),
    );

    this.mru_order = this.mru_order.filter((id) => id !== tab_id);

    const was_active = this.active_tab_id === tab_id;
    this.tabs = this.tabs.filter((t) => t.id !== tab_id);

    if (!was_active) return this.active_tab_id;

    if (this.tabs.length === 0) {
      this.active_tab_id = null;
      return null;
    }

    const mru_next = this.mru_order[0];
    const next_tab = mru_next ? this.tabs.find((t) => t.id === mru_next) : null;

    if (next_tab) {
      this.active_tab_id = next_tab.id;
    } else {
      const next_index = Math.min(index, this.tabs.length - 1);
      const fallback = this.tabs[next_index];
      this.active_tab_id = fallback?.id ?? null;
    }
    return this.active_tab_id;
  }

  close_other_tabs(keep_tab_id: TabId) {
    const kept = this.tabs.filter((t) => t.id === keep_tab_id || t.is_pinned);
    const removed_ids = new Set(
      this.tabs
        .filter((t) => t.id !== keep_tab_id && !t.is_pinned)
        .map((t) => t.id),
    );

    this.editor_snapshots = new Map(
      [...this.editor_snapshots].filter(([id]) => !removed_ids.has(id)),
    );
    this.note_cache = new Map(
      [...this.note_cache].filter(([id]) => !removed_ids.has(id)),
    );
    this.mru_order = this.mru_order.filter((id) => !removed_ids.has(id));
    this.tabs = kept;
    this.active_tab_id = keep_tab_id;
  }

  close_tabs_to_right(tab_id: TabId) {
    const index = this.tabs.findIndex((t) => t.id === tab_id);
    if (index === -1) return;

    const kept = this.tabs.filter((t, i) => i <= index || t.is_pinned);
    const removed_ids = new Set(
      this.tabs.filter((t, i) => i > index && !t.is_pinned).map((t) => t.id),
    );

    this.editor_snapshots = new Map(
      [...this.editor_snapshots].filter(([id]) => !removed_ids.has(id)),
    );
    this.note_cache = new Map(
      [...this.note_cache].filter(([id]) => !removed_ids.has(id)),
    );
    this.mru_order = this.mru_order.filter((id) => !removed_ids.has(id));
    this.tabs = kept;

    if (this.active_tab_id && removed_ids.has(this.active_tab_id)) {
      this.active_tab_id = tab_id;
    }
  }

  close_all_tabs() {
    this.tabs = [];
    this.active_tab_id = null;
    this.editor_snapshots = new Map();
    this.note_cache = new Map();
    this.mru_order = [];
  }

  set_dirty(tab_id: TabId, is_dirty: boolean) {
    const tab = this.tabs.find((t) => t.id === tab_id);
    if (!tab) return;
    if (tab.is_dirty === is_dirty) return;
    this.tabs = this.tabs.map((t) =>
      t.id === tab_id ? { ...t, is_dirty } : t,
    );
  }

  set_snapshot(tab_id: TabId, snapshot: TabEditorSnapshot) {
    const next = new Map(this.editor_snapshots);
    next.set(tab_id, snapshot);
    this.editor_snapshots = next;
  }

  get_snapshot(tab_id: TabId): TabEditorSnapshot | null {
    return this.editor_snapshots.get(tab_id) ?? null;
  }

  set_cached_note(tab_id: TabId, note: OpenNoteState) {
    const next = new Map(this.note_cache);
    next.set(tab_id, note);
    this.note_cache = next;
  }

  get_cached_note(tab_id: TabId): OpenNoteState | null {
    return this.note_cache.get(tab_id) ?? null;
  }

  clear_cached_note(tab_id: TabId) {
    if (!this.note_cache.has(tab_id)) return;
    const next = new Map([...this.note_cache].filter(([id]) => id !== tab_id));
    this.note_cache = next;
  }

  invalidate_cache_by_path(note_path: NotePath) {
    const tab_ids = this.tabs
      .filter(
        (t) =>
          t.kind === "note" && paths_equal_ignore_case(t.note_path, note_path),
      )
      .map((t) => t.id);
    if (tab_ids.length === 0) return;
    const ids_to_clear = new Set(tab_ids);
    this.note_cache = new Map(
      [...this.note_cache].filter(([id]) => !ids_to_clear.has(id)),
    );
  }

  pin_tab(tab_id: TabId) {
    const tab = this.tabs.find((t) => t.id === tab_id);
    if (!tab || tab.is_pinned) return;

    const updated = { ...tab, is_pinned: true };
    const others = this.tabs.filter((t) => t.id !== tab_id);
    const pinned = others.filter((t) => t.is_pinned);
    const unpinned = others.filter((t) => !t.is_pinned);
    this.tabs = [...pinned, updated, ...unpinned];
  }

  unpin_tab(tab_id: TabId) {
    const tab = this.tabs.find((t) => t.id === tab_id);
    if (!tab || !tab.is_pinned) return;

    const updated = { ...tab, is_pinned: false };
    const others = this.tabs.filter((t) => t.id !== tab_id);
    const pinned = others.filter((t) => t.is_pinned);
    const unpinned = others.filter((t) => !t.is_pinned);
    this.tabs = [...pinned, updated, ...unpinned];
  }

  update_tab_path(old_path: NotePath, new_path: NotePath) {
    const tab = this.find_tab_by_path(old_path);
    if (!tab || tab.kind !== "note") return;

    const new_title = note_name_from_path(new_path);
    this.tabs = this.tabs.map((t) =>
      t.id === tab.id && t.kind === "note"
        ? { ...t, id: new_path, note_path: new_path, title: new_title }
        : t,
    );

    if (this.active_tab_id === old_path) {
      this.active_tab_id = new_path;
    }

    const snapshot = this.editor_snapshots.get(old_path);
    if (snapshot) {
      const next = new Map(
        [...this.editor_snapshots].filter(([id]) => id !== old_path),
      );
      next.set(new_path, snapshot);
      this.editor_snapshots = next;
    }

    const cached_note = this.note_cache.get(old_path);
    if (cached_note) {
      const next = new Map(
        [...this.note_cache].filter(([id]) => id !== old_path),
      );
      next.set(new_path, cached_note);
      this.note_cache = next;
    }

    this.mru_order = this.mru_order.map((id) =>
      id === old_path ? new_path : id,
    );
  }

  update_tab_path_prefix(old_prefix: string, new_prefix: string) {
    let active_changed = false;
    let new_active_id = this.active_tab_id;
    const renames = new Map<string, string>();

    const lower_prefix = old_prefix.toLowerCase();
    this.tabs = this.tabs.map((t) => {
      if (t.kind !== "note") return t;
      const lower_path = t.note_path.toLowerCase();
      if (!lower_path.startsWith(lower_prefix)) return t;
      const new_path =
        `${new_prefix}${t.note_path.slice(old_prefix.length)}` as NotePath;
      const new_title = note_name_from_path(new_path);
      if (this.active_tab_id === t.id) {
        active_changed = true;
        new_active_id = new_path;
      }
      renames.set(t.id, new_path);
      return { ...t, id: new_path, note_path: new_path, title: new_title };
    });

    if (active_changed) {
      this.active_tab_id = new_active_id;
    }

    if (renames.size > 0) {
      const next = new Map(
        [...this.editor_snapshots].filter(([id]) => !renames.has(id)),
      );
      for (const [old_id, new_id] of renames) {
        const snapshot = this.editor_snapshots.get(old_id);
        if (snapshot) next.set(new_id, snapshot);
      }
      this.editor_snapshots = next;

      const next_cache = new Map(
        [...this.note_cache].filter(([id]) => !renames.has(id)),
      );
      for (const [old_id, new_id] of renames) {
        const cached = this.note_cache.get(old_id);
        if (cached) next_cache.set(new_id, cached);
      }
      this.note_cache = next_cache;

      this.mru_order = this.mru_order.map((id) => renames.get(id) ?? id);
    }
  }

  remove_tab_by_path(note_path: NotePath): TabId | null {
    const tab = this.find_tab_by_path(note_path);
    if (!tab) return this.active_tab_id;
    return this.close_tab(tab.id);
  }

  reorder_tab(from_index: number, to_index: number) {
    if (from_index === to_index) return;
    if (from_index < 0 || from_index >= this.tabs.length) return;
    if (to_index < 0 || to_index >= this.tabs.length) return;

    const from_tab = this.tabs[from_index];
    const to_tab = this.tabs[to_index];
    if (!from_tab || !to_tab) return;
    if (from_tab.is_pinned !== to_tab.is_pinned) return;

    const next = [...this.tabs];
    next.splice(from_index, 1);
    next.splice(to_index, 0, from_tab);
    this.tabs = next;
  }

  move_tab_left(tab_id: TabId) {
    const index = this.tabs.findIndex((t) => t.id === tab_id);
    if (index <= 0) return;
    this.reorder_tab(index, index - 1);
  }

  move_tab_right(tab_id: TabId) {
    const index = this.tabs.findIndex((t) => t.id === tab_id);
    if (index === -1 || index >= this.tabs.length - 1) return;
    this.reorder_tab(index, index + 1);
  }

  push_closed_history(entry: ClosedTabEntry) {
    this.closed_tab_history = [
      entry,
      ...this.closed_tab_history.slice(0, MAX_CLOSED_HISTORY - 1),
    ];
  }

  pop_closed_history(): ClosedTabEntry | null {
    if (this.closed_tab_history.length === 0) return null;
    const entry = this.closed_tab_history[0];
    if (!entry) return null;
    this.closed_tab_history = this.closed_tab_history.slice(1);
    return entry;
  }

  find_evictable_tab(): Tab | null {
    return (
      this.tabs.find(
        (t) => !t.is_pinned && !t.is_dirty && t.id !== this.active_tab_id,
      ) ?? null
    );
  }

  get_dirty_tabs(): Tab[] {
    return this.tabs.filter((t) => t.is_dirty);
  }

  restore_tabs(tabs: Tab[], active_tab_id: TabId | null) {
    this.tabs = tabs;
    const first_tab = tabs[0];
    const resolved_active_id =
      active_tab_id && tabs.some((t) => t.id === active_tab_id)
        ? active_tab_id
        : first_tab
          ? first_tab.id
          : null;
    this.active_tab_id = resolved_active_id;

    const tab_ids = tabs.map((t) => t.id);
    this.mru_order = resolved_active_id
      ? [
          resolved_active_id,
          ...tab_ids.filter((id) => id !== resolved_active_id),
        ]
      : tab_ids;
  }

  reset() {
    this.tabs = [];
    this.active_tab_id = null;
    this.closed_tab_history = [];
    this.editor_snapshots = new Map();
    this.note_cache = new Map();
    this.mru_order = [];
  }
}

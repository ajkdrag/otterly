import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  advance_or_finish_batch,
  capture_active_tab_snapshot,
  close_editor_buffers,
  close_tab_immediate,
  ensure_tab_capacity,
  execute_batch_close,
  list_tabs_for_batch_close,
  open_active_tab_note,
  record_closed_tabs,
  reset_close_confirm,
  save_dirty_tab,
  start_batch_close_confirm,
  try_open_tab,
} from "$lib/features/tab/application/tab_action_helpers";
import { toast } from "svelte-sonner";

export { capture_active_tab_snapshot, ensure_tab_capacity, try_open_tab };

export function register_tab_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  function find_tab(tab_id: string) {
    return stores.tab.tabs.find((tab) => tab.id === tab_id) ?? null;
  }

  async function activate_tab_and_open_note(tab_id: string) {
    await capture_active_tab_snapshot(input);
    stores.tab.activate_tab(tab_id);
    await open_active_tab_note(input);
  }

  function open_single_close_confirm(tab_id: string, tab_title: string) {
    stores.ui.tab_close_confirm = {
      open: true,
      tab_id,
      tab_title,
      pending_dirty_tab_ids: [],
      close_mode: "single",
      keep_tab_id: null,
      apply_to_all: false,
    };
  }

  registry.register({
    id: ACTION_IDS.tab_activate,
    label: "Activate Tab",
    when: () => stores.tab.has_tabs,
    execute: async (tab_id: unknown) => {
      const id = String(tab_id);
      if (!find_tab(id)) {
        return;
      }
      await activate_tab_and_open_note(id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_activate_by_index,
    label: "Switch to Tab by Number",
    when: () => stores.tab.has_tabs,
    execute: async (index: unknown) => {
      const i = Number(index);
      const tab = stores.tab.tabs[i];
      if (!tab) return;
      if (stores.tab.active_tab_id === tab.id) return;

      await activate_tab_and_open_note(tab.id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_close,
    label: "Close Tab",
    shortcut: "CmdOrCtrl+W",
    when: () => stores.tab.has_tabs,
    execute: async (tab_id_arg?: unknown) => {
      const tab_id =
        typeof tab_id_arg === "string" ? tab_id_arg : stores.tab.active_tab_id;
      if (!tab_id) return;

      const tab = find_tab(tab_id);
      if (!tab) return;

      if (tab.is_pinned && !tab_id_arg) return;

      if (tab.is_dirty) {
        open_single_close_confirm(tab.id, tab.title);
        return;
      }

      await close_tab_immediate(input, tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_close_other,
    label: "Close Other Tabs",
    when: () => stores.tab.tabs.length > 1,
    execute: async (tab_id: unknown) => {
      const id = String(tab_id);
      const closable = stores.tab.tabs.filter(
        (t) => t.id !== id && !t.is_pinned,
      );
      const dirty = closable.filter((t) => t.is_dirty);

      if (dirty.length > 0) {
        start_batch_close_confirm(stores, dirty, "other", id);
        return;
      }

      const tabs_to_close = list_tabs_for_batch_close(
        stores.tab.tabs,
        "other",
        id,
      );
      record_closed_tabs(stores, tabs_to_close);
      close_editor_buffers(
        input,
        tabs_to_close.map((tab) => tab.note_path),
      );
      stores.tab.close_other_tabs(id);
      await open_active_tab_note(input);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_close_right,
    label: "Close Tabs to the Right",
    execute: async (tab_id: unknown) => {
      const id = String(tab_id);
      const index = stores.tab.tabs.findIndex((t) => t.id === id);
      if (index === -1) return;

      const right_tabs = stores.tab.tabs.filter(
        (t, i) => i > index && !t.is_pinned,
      );
      const dirty = right_tabs.filter((t) => t.is_dirty);

      if (dirty.length > 0) {
        start_batch_close_confirm(stores, dirty, "right", id);
        return;
      }

      const tabs_to_close = list_tabs_for_batch_close(
        stores.tab.tabs,
        "right",
        id,
      );
      record_closed_tabs(stores, tabs_to_close);
      close_editor_buffers(
        input,
        tabs_to_close.map((tab) => tab.note_path),
      );
      stores.tab.close_tabs_to_right(id);
      await open_active_tab_note(input);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_close_all,
    label: "Close All Tabs",
    execute: () => {
      const dirty = stores.tab.get_dirty_tabs();

      if (dirty.length > 0) {
        start_batch_close_confirm(stores, dirty, "all", null);
        return;
      }

      const tabs_to_close = list_tabs_for_batch_close(
        stores.tab.tabs,
        "all",
        null,
      );
      record_closed_tabs(stores, tabs_to_close);
      close_editor_buffers(
        input,
        tabs_to_close.map((tab) => tab.note_path),
      );
      stores.tab.close_all_tabs();
      stores.editor.clear_open_note();
    },
  });

  registry.register({
    id: ACTION_IDS.tab_next,
    label: "Next Tab",
    when: () => stores.tab.tabs.length > 1,
    execute: async () => {
      const tabs = stores.tab.tabs;
      const current_index = stores.tab.active_tab_index;
      if (current_index === -1) return;

      const next_index = (current_index + 1) % tabs.length;
      const next_tab = tabs[next_index];
      if (!next_tab) return;
      await activate_tab_and_open_note(next_tab.id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_prev,
    label: "Previous Tab",
    when: () => stores.tab.tabs.length > 1,
    execute: async () => {
      const tabs = stores.tab.tabs;
      const current_index = stores.tab.active_tab_index;
      if (current_index === -1) return;

      const prev_index = (current_index - 1 + tabs.length) % tabs.length;
      const prev_tab = tabs[prev_index];
      if (!prev_tab) return;
      await activate_tab_and_open_note(prev_tab.id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_go_to_last_used,
    label: "Go to Last Used Tab",
    when: () => stores.tab.mru_previous_tab_id !== null,
    execute: async () => {
      const last_used_id = stores.tab.mru_previous_tab_id;
      if (!last_used_id) return;
      await activate_tab_and_open_note(last_used_id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_reopen_closed,
    label: "Reopen Closed Tab",
    shortcut: "CmdOrCtrl+Shift+T",
    when: () => stores.tab.closed_tab_history.length > 0,
    execute: async () => {
      const entry = stores.tab.pop_closed_history();
      if (!entry) return;

      await capture_active_tab_snapshot(input);
      const tab = try_open_tab(input, entry.note_path, entry.title);
      if (!tab) return;

      if (
        entry.cursor ||
        entry.scroll_top > 0 ||
        entry.code_block_heights.length > 0
      ) {
        stores.tab.set_snapshot(tab.id, {
          scroll_top: entry.scroll_top,
          cursor: entry.cursor,
          code_block_heights: entry.code_block_heights,
        });
      }

      if (entry.draft_note) {
        const draft_note = {
          ...entry.draft_note,
          is_dirty: true,
        };
        stores.editor.set_open_note(draft_note);
        stores.tab.set_cached_note(tab.id, draft_note);
        stores.tab.set_dirty(tab.id, true);
        return;
      }

      const result = await services.note.open_note(entry.note_path, false);
      if (result.status === "opened") {
        stores.ui.set_selected_folder_path(result.selected_folder_path);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.tab_pin,
    label: "Pin Tab",
    execute: (tab_id: unknown) => {
      stores.tab.pin_tab(String(tab_id));
    },
  });

  registry.register({
    id: ACTION_IDS.tab_unpin,
    label: "Unpin Tab",
    execute: (tab_id: unknown) => {
      stores.tab.unpin_tab(String(tab_id));
    },
  });

  registry.register({
    id: ACTION_IDS.tab_move_left,
    label: "Move Tab Left",
    shortcut: "CmdOrCtrl+Alt+Left",
    when: () => stores.tab.active_tab_id !== null,
    execute: () => {
      if (!stores.tab.active_tab_id) return;
      stores.tab.move_tab_left(stores.tab.active_tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_move_right,
    label: "Move Tab Right",
    shortcut: "CmdOrCtrl+Alt+Right",
    when: () => stores.tab.active_tab_id !== null,
    execute: () => {
      if (!stores.tab.active_tab_id) return;
      stores.tab.move_tab_right(stores.tab.active_tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_copy_path,
    label: "Copy File Path",
    execute: async (tab_id: unknown) => {
      const id = String(tab_id);
      const tab = find_tab(id);
      if (!tab) return;

      try {
        await services.clipboard.copy_text(tab.note_path);
        toast.success("Path copied");
      } catch {
        toast.error("Failed to copy path");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.tab_reveal_in_tree,
    label: "Reveal in File Tree",
    execute: async (tab_id: unknown) => {
      const id = String(tab_id);
      const tab = find_tab(id);
      if (!tab) return;

      await registry.execute(ACTION_IDS.filetree_reveal_note, {
        note_path: tab.note_path,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.tab_confirm_close_save,
    label: "Save and Close Tab",
    execute: async () => {
      const { tab_id, close_mode, apply_to_all, pending_dirty_tab_ids } =
        stores.ui.tab_close_confirm;
      if (!tab_id) return;

      const active_saved = await save_dirty_tab(input, tab_id);
      if (active_saved === "failed") {
        return;
      }
      if (active_saved === "needs_path") {
        stores.ui.tab_close_confirm = {
          ...stores.ui.tab_close_confirm,
          open: false,
        };
        await registry.execute(ACTION_IDS.note_request_save, {
          source: "tab_close",
        });
        return;
      }

      if (close_mode === "single") {
        reset_close_confirm(stores);
        await close_tab_immediate(input, tab_id);
        return;
      }

      if (apply_to_all) {
        for (const pending_id of pending_dirty_tab_ids) {
          const saved = await save_dirty_tab(input, pending_id);
          if (saved === "failed") {
            stores.ui.tab_close_confirm = {
              ...stores.ui.tab_close_confirm,
              tab_id: pending_id,
              tab_title: find_tab(pending_id)?.title ?? "",
              pending_dirty_tab_ids: pending_dirty_tab_ids.filter(
                (id) => id !== pending_id,
              ),
              apply_to_all: false,
            };
            return;
          }
          if (saved === "needs_path") {
            stores.ui.tab_close_confirm = {
              ...stores.ui.tab_close_confirm,
              open: false,
              tab_id: pending_id,
              tab_title: find_tab(pending_id)?.title ?? "",
              pending_dirty_tab_ids: pending_dirty_tab_ids.filter(
                (id) => id !== pending_id,
              ),
            };
            await registry.execute(ACTION_IDS.note_request_save, {
              source: "tab_close",
            });
            return;
          }
        }
        await execute_batch_close(input);
        return;
      }

      await advance_or_finish_batch(input);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_confirm_close_discard,
    label: "Discard and Close Tab",
    execute: async () => {
      const { tab_id, close_mode, apply_to_all, pending_dirty_tab_ids } =
        stores.ui.tab_close_confirm;
      if (!tab_id) return;

      stores.tab.set_dirty(tab_id, false);

      if (close_mode === "single") {
        reset_close_confirm(stores);
        await close_tab_immediate(input, tab_id);
        return;
      }

      if (apply_to_all) {
        for (const pending_id of pending_dirty_tab_ids) {
          stores.tab.set_dirty(pending_id, false);
        }
        await execute_batch_close(input);
        return;
      }

      await advance_or_finish_batch(input);
    },
  });

  registry.register({
    id: ACTION_IDS.tab_cancel_close,
    label: "Cancel Close Tab",
    execute: () => {
      reset_close_confirm(stores);
    },
  });
}

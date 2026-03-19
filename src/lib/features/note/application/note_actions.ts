import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  capture_active_tab_snapshot,
  ensure_tab_capacity,
  try_open_tab,
} from "$lib/features/tab";
import { clear_folder_filetree_state } from "$lib/features/folder";
import {
  build_full_path,
  build_note_path_from_name,
  close_delete_dialog,
  close_image_paste_dialog,
  close_rename_dialog,
  close_save_dialog,
  filename_from_path,
  parse_note_open_input,
  save_and_insert_image,
} from "$lib/features/note/application/note_action_helpers";
import { is_draft_note_path } from "$lib/features/note/domain/ensure_open_note";
import type { NoteMeta } from "$lib/shared/types/note";
import { as_note_path, type NotePath } from "$lib/shared/types/ids";
import type { ImagePasteRequest } from "$lib/shared/types/editor";
import {
  note_name_from_path,
  parent_folder_path,
} from "$lib/shared/utils/path";
import { toast } from "svelte-sonner";

type WikiLinkPayload = {
  raw_path: string;
  base_note_path: string;
};

type SaveRequestPayload = {
  source?: "manual" | "tab_close";
};

function parse_wiki_link_payload(payload: unknown): WikiLinkPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.raw_path !== "string") {
    return null;
  }
  if (typeof record.base_note_path !== "string") {
    return null;
  }
  return {
    raw_path: record.raw_path,
    base_note_path: record.base_note_path,
  };
}

function parse_image_paste_request(payload: unknown): ImagePasteRequest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.note_id !== "string") {
    return null;
  }
  if (typeof record.note_path !== "string") {
    return null;
  }
  if (!record.image || typeof record.image !== "object") {
    return null;
  }
  return record as unknown as ImagePasteRequest;
}

function parse_save_request_payload(
  payload: unknown,
): SaveRequestPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    record.source === undefined ||
    record.source === "manual" ||
    record.source === "tab_close"
  ) {
    return record as SaveRequestPayload;
  }
  return null;
}

function parse_note_star_path(note: unknown): string | null {
  if (typeof note === "string" && note) {
    return note;
  }
  if (note && typeof note === "object" && "path" in note) {
    const candidate = (note as { path?: unknown }).path;
    return typeof candidate === "string" && candidate ? candidate : null;
  }
  return null;
}

export function register_note_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;

  const when_vault_open = () => stores.vault.vault !== null;

  function can_open_more_tabs() {
    return ensure_tab_capacity(input);
  }

  function cache_open_note_for_tab(tab_id: string) {
    const open_note = stores.editor.open_note;
    if (!open_note) {
      return;
    }
    stores.tab.set_cached_note(tab_id, open_note);
  }

  async function open_note_by_path(
    note_path: string,
    cleanup_if_missing: boolean,
  ) {
    const result = await services.note.open_note(note_path, false, {
      cleanup_if_missing,
    });
    if (result.status === "opened") {
      stores.ui.set_selected_folder_path(result.selected_folder_path);
    }
    return result;
  }

  function clear_parent_folder_filetree(note_path: string) {
    clear_folder_filetree_state(input, parent_folder_path(note_path));
  }

  function update_active_tab_path(saved_path: NotePath) {
    if (!stores.tab.active_tab_id) {
      return;
    }
    stores.tab.update_tab_path(
      stores.tab.active_tab_id as NotePath,
      saved_path,
    );
  }

  function apply_note_rename(old_path: NotePath, new_path: NotePath) {
    stores.tab.update_tab_path(old_path, new_path);
    clear_parent_folder_filetree(old_path);
    const old_parent = parent_folder_path(old_path);
    const new_parent = parent_folder_path(new_path);
    if (old_parent !== new_parent) {
      clear_folder_filetree_state(input, new_parent);
    }
  }

  function open_save_note_dialog(source: "manual" | "tab_close") {
    const open_note = stores.editor.open_note;
    if (!open_note) {
      return;
    }
    const folder_path = stores.ui.selected_folder_path;
    const filename = is_draft_note_path(open_note.meta.path)
      ? `${open_note.meta.title || "Untitled"}.md`
      : filename_from_path(open_note.meta.path) || "Untitled";
    stores.ui.save_note_dialog = {
      open: true,
      folder_path,
      new_path: build_full_path(folder_path, filename),
      show_overwrite_confirm: false,
      is_checking_existence: false,
      source,
    };
    services.note.reset_save_operation();
  }

  function apply_saved_note(saved_path: NotePath, close_dialog: boolean) {
    update_active_tab_path(saved_path);
    const open_note = stores.editor.open_note;
    if (open_note && open_note.meta.path === saved_path) {
      stores.tab.reconcile_saved_note(open_note);
    }
    clear_parent_folder_filetree(saved_path);
    if (close_dialog) {
      close_save_dialog(input);
    }
  }

  function sync_pending_close_saved_path(
    previous_path: NotePath,
    saved_path: NotePath,
  ) {
    const close_confirm = stores.ui.tab_close_confirm;
    stores.ui.tab_close_confirm = {
      ...close_confirm,
      tab_id:
        close_confirm.tab_id === previous_path
          ? saved_path
          : close_confirm.tab_id,
      pending_dirty_tab_ids: close_confirm.pending_dirty_tab_ids.map(
        (tab_id) => (tab_id === previous_path ? saved_path : tab_id),
      ),
    };
  }

  async function finalize_saved_note(args: {
    previous_path: NotePath | null;
    saved_path: NotePath;
    source: "manual" | "tab_close";
  }) {
    apply_saved_note(args.saved_path, true);
    if (!args.previous_path || args.source !== "tab_close") {
      return;
    }
    sync_pending_close_saved_path(args.previous_path, args.saved_path);
    await registry.execute(ACTION_IDS.tab_confirm_close_save);
  }

  function clear_pending_tab_close() {
    stores.ui.tab_close_confirm = {
      ...stores.ui.tab_close_confirm,
      open: false,
      tab_id: null,
      tab_title: "",
      pending_dirty_tab_ids: [],
      close_mode: "single",
      keep_tab_id: null,
      apply_to_all: false,
    };
  }

  function get_rename_target() {
    const note = stores.ui.rename_note_dialog.note;
    const new_name = stores.ui.rename_note_dialog.new_name.trim();
    if (!note || !new_name) {
      return null;
    }
    const parent = parent_folder_path(note.path);
    const new_path = build_note_path_from_name(parent, new_name);
    return {
      note,
      new_path,
    };
  }

  async function run_note_rename(overwrite: boolean) {
    const target = get_rename_target();
    if (!target) {
      return;
    }

    if (!overwrite) {
      stores.ui.rename_note_dialog.is_checking_conflict = true;
    }

    const result = await services.note.rename_note(
      target.note,
      target.new_path,
      overwrite,
    );

    if (!overwrite) {
      stores.ui.rename_note_dialog.is_checking_conflict = false;
    }

    if (result.status === "conflict") {
      stores.ui.rename_note_dialog.show_overwrite_confirm = true;
      return;
    }

    if (result.status === "renamed") {
      apply_note_rename(target.note.path, target.new_path);
      close_rename_dialog(input);
    }
  }

  function register_open_actions() {
    registry.register({
      id: ACTION_IDS.note_create,
      label: "Create Note",
      shortcut: "CmdOrCtrl+N",
      when: when_vault_open,
      execute: async () => {
        if (!can_open_more_tabs()) {
          return;
        }

        await capture_active_tab_snapshot(input);

        const open_titles = stores.tab.tabs.map((tab) => tab.title);
        services.note.create_new_note(open_titles);

        const open_note = stores.editor.open_note;
        if (!open_note) {
          return;
        }

        const tab = stores.tab.open_tab(
          open_note.meta.path,
          open_note.meta.title || "Untitled",
        );
        cache_open_note_for_tab(tab.id);
      },
    });

    registry.register({
      id: ACTION_IDS.note_open,
      label: "Open Note",
      when: when_vault_open,
      execute: async (note_input: unknown) => {
        const parsed = parse_note_open_input(note_input);
        const note_path = parsed.note_path;

        const existing_tab = stores.tab.find_tab_by_path(note_path as NotePath);
        if (existing_tab) {
          if (stores.tab.active_tab_id !== existing_tab.id) {
            await capture_active_tab_snapshot(input);
            stores.tab.activate_tab(existing_tab.id);
          }
          await open_note_by_path(note_path, parsed.cleanup_if_missing);
          return;
        }

        if (!can_open_more_tabs()) {
          return;
        }

        await capture_active_tab_snapshot(input);

        const result = await open_note_by_path(
          note_path,
          parsed.cleanup_if_missing,
        );
        if (result.status === "opened") {
          const title = note_name_from_path(note_path);
          const tab = stores.tab.open_tab(note_path as NotePath, title);
          cache_open_note_for_tab(tab.id);
        }
        if (result.status === "not_found") {
          toast.error("Note no longer exists");
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_open_wiki_link,
      label: "Open Wiki Link",
      when: when_vault_open,
      execute: async (payload: unknown) => {
        const parsed = parse_wiki_link_payload(payload);
        if (!parsed) {
          return;
        }

        const resolved = await services.search.resolve_note_link(
          parsed.base_note_path,
          parsed.raw_path,
        );
        if (!resolved) {
          toast.error("Cannot link outside the vault");
          return;
        }

        const existing_tab = stores.tab.find_tab_by_path(resolved as NotePath);
        if (!existing_tab && !can_open_more_tabs()) {
          return;
        }

        await capture_active_tab_snapshot(input);

        const result = await services.note.open_wiki_link(resolved);
        if (result.status === "opened") {
          const opened_path = stores.editor.open_note?.meta.path ?? resolved;
          const title = note_name_from_path(opened_path);
          const tab = try_open_tab(input, opened_path as NotePath, title);
          if (!tab) {
            return;
          }
          stores.ui.set_selected_folder_path(result.selected_folder_path);
          clear_folder_filetree_state(input, result.selected_folder_path);
          cache_open_note_for_tab(tab.id);
        }
        if (result.status === "failed") {
          toast.error(result.error);
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_copy_markdown,
      label: "Copy Markdown",
      execute: async () => {
        await services.clipboard.copy_open_note_markdown();
      },
    });
  }

  function register_image_actions() {
    registry.register({
      id: ACTION_IDS.note_insert_pasted_image,
      label: "Insert Pasted Image",
      when: when_vault_open,
      execute: async (request: unknown) => {
        const payload = parse_image_paste_request(request);
        if (!payload) {
          return;
        }
        const open_note = stores.editor.open_note;
        if (!open_note || open_note.meta.id !== payload.note_id) {
          return;
        }

        await save_and_insert_image(
          input,
          payload.note_id,
          payload.note_path,
          payload.image,
        );
      },
    });

    registry.register({
      id: ACTION_IDS.note_request_image_paste,
      label: "Request Image Paste",
      when: when_vault_open,
      execute: (request: unknown) => {
        const payload = parse_image_paste_request(request);
        if (!payload) {
          return;
        }

        const open_note = stores.editor.open_note;
        if (!open_note || open_note.meta.id !== payload.note_id) {
          return;
        }

        const estimated_size_bytes = payload.image.bytes.byteLength;
        const target_folder =
          stores.ui.editor_settings.attachment_folder || ".assets";

        stores.ui.image_paste_dialog = {
          open: true,
          note_id: payload.note_id,
          note_path: payload.note_path,
          image: payload.image,
          filename: "",
          estimated_size_bytes,
          target_folder,
        };
        services.note.reset_asset_write_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.note_update_image_paste_filename,
      label: "Update Image Paste Filename",
      execute: (filename: unknown) => {
        stores.ui.image_paste_dialog.filename = String(filename);
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_image_paste,
      label: "Confirm Image Paste",
      execute: async () => {
        const dialog = stores.ui.image_paste_dialog;
        if (
          !dialog.open ||
          !dialog.note_id ||
          !dialog.note_path ||
          !dialog.image
        ) {
          return;
        }

        const open_note = stores.editor.open_note;
        if (!open_note || open_note.meta.id !== dialog.note_id) {
          return;
        }

        const attachment_folder =
          stores.ui.editor_settings.attachment_folder || ".assets";
        const custom_filename = dialog.filename.trim();

        await save_and_insert_image(
          input,
          dialog.note_id,
          dialog.note_path,
          dialog.image,
          {
            ...(custom_filename ? { custom_filename } : {}),
            attachment_folder,
          },
        );

        close_image_paste_dialog(input);
      },
    });

    registry.register({
      id: ACTION_IDS.note_cancel_image_paste,
      label: "Cancel Image Paste",
      execute: () => {
        close_image_paste_dialog(input);
        services.note.reset_asset_write_operation();
      },
    });
  }

  function register_delete_actions() {
    registry.register({
      id: ACTION_IDS.note_request_delete,
      label: "Request Delete Note",
      execute: (note: unknown) => {
        stores.ui.delete_note_dialog = {
          open: true,
          note: note as NoteMeta,
        };
        services.note.reset_delete_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_delete,
      label: "Confirm Delete Note",
      execute: async () => {
        const note = stores.ui.delete_note_dialog.note;
        if (!note) {
          return;
        }

        const tab = stores.tab.find_tab_by_path(note.path);
        if (tab) {
          stores.tab.close_tab(tab.id);
        }

        const result = await services.note.delete_note(note);
        if (result.status !== "deleted") {
          return;
        }

        clear_parent_folder_filetree(note.path);
        close_delete_dialog(input);

        const active_tab = stores.tab.active_tab;
        if (active_tab) {
          await services.note.open_note(active_tab.note_path, false);
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_cancel_delete,
      label: "Cancel Delete Note",
      execute: () => {
        close_delete_dialog(input);
        services.note.reset_delete_operation();
      },
    });
  }

  function register_rename_actions() {
    registry.register({
      id: ACTION_IDS.note_request_rename,
      label: "Request Rename Note",
      execute: (note: unknown) => {
        const note_meta = note as NoteMeta;
        stores.ui.rename_note_dialog = {
          open: true,
          note: note_meta,
          new_name: note_name_from_path(note_meta.path),
          show_overwrite_confirm: false,
          is_checking_conflict: false,
        };
        services.note.reset_rename_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.note_update_rename_name,
      label: "Update Rename Note Name",
      execute: (name: unknown) => {
        stores.ui.rename_note_dialog.new_name = String(name);
        stores.ui.rename_note_dialog.show_overwrite_confirm = false;
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_rename,
      label: "Confirm Rename Note",
      execute: async () => {
        await run_note_rename(false);
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_rename_overwrite,
      label: "Confirm Rename Note Overwrite",
      execute: async () => {
        await run_note_rename(true);
      },
    });

    registry.register({
      id: ACTION_IDS.note_cancel_rename,
      label: "Cancel Rename Note",
      execute: () => {
        close_rename_dialog(input);
        services.note.reset_rename_operation();
      },
    });

    registry.register({
      id: ACTION_IDS.note_retry_rename,
      label: "Retry Rename Note",
      execute: async () => {
        await run_note_rename(true);
      },
    });
  }

  function register_save_actions() {
    registry.register({
      id: ACTION_IDS.note_request_save,
      label: "Save Note",
      shortcut: "CmdOrCtrl+S",
      when: when_vault_open,
      execute: async (payload?: unknown) => {
        const open_note = stores.editor.open_note;
        if (!open_note) {
          return;
        }

        const source = parse_save_request_payload(payload)?.source ?? "manual";
        if (!is_draft_note_path(open_note.meta.path)) {
          await services.note.save_note(null, true);
          return;
        }

        open_save_note_dialog(source);
      },
    });

    registry.register({
      id: ACTION_IDS.note_update_save_path,
      label: "Update Save Note Path",
      execute: (path: unknown) => {
        stores.ui.save_note_dialog.new_path = as_note_path(String(path));
        stores.ui.save_note_dialog.show_overwrite_confirm = false;
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_save,
      label: "Confirm Save Note",
      execute: async () => {
        if (!stores.ui.save_note_dialog.open) {
          await services.note.save_note(null, true);
          return;
        }

        const previous_path = stores.editor.open_note?.meta.path ?? null;
        const source = stores.ui.save_note_dialog.source;
        const path = stores.ui.save_note_dialog.new_path;
        if (!path) {
          return;
        }

        stores.ui.save_note_dialog.is_checking_existence = true;
        const result = await services.note.save_note(path, false);
        stores.ui.save_note_dialog.is_checking_existence = false;

        if (result.status === "conflict") {
          stores.ui.save_note_dialog.show_overwrite_confirm = true;
          return;
        }

        if (result.status === "saved") {
          await finalize_saved_note({
            previous_path,
            saved_path: result.saved_path,
            source,
          });
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_confirm_save_overwrite,
      label: "Confirm Save Note Overwrite",
      execute: async () => {
        const previous_path = stores.editor.open_note?.meta.path ?? null;
        const source = stores.ui.save_note_dialog.source;
        const path = stores.ui.save_note_dialog.new_path;
        if (!path) {
          return;
        }

        const result = await services.note.save_note(path, true);
        if (result.status === "saved") {
          await finalize_saved_note({
            previous_path,
            saved_path: result.saved_path,
            source,
          });
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_retry_save,
      label: "Retry Save Note",
      execute: async () => {
        const previous_path = stores.editor.open_note?.meta.path ?? null;
        const source = stores.ui.save_note_dialog.source;
        const path = stores.ui.save_note_dialog.open
          ? stores.ui.save_note_dialog.new_path
          : null;
        const result = await services.note.save_note(path, true);
        if (result.status === "saved" && stores.ui.save_note_dialog.open) {
          await finalize_saved_note({
            previous_path,
            saved_path: result.saved_path,
            source,
          });
        }
      },
    });

    registry.register({
      id: ACTION_IDS.note_cancel_save,
      label: "Cancel Save Note",
      execute: () => {
        if (stores.ui.save_note_dialog.source === "tab_close") {
          clear_pending_tab_close();
        }
        close_save_dialog(input);
        services.note.reset_save_operation();
      },
    });
  }

  function register_star_actions() {
    registry.register({
      id: ACTION_IDS.note_toggle_star,
      label: "Toggle Star",
      execute: (note: unknown) => {
        const note_path = parse_note_star_path(note);
        if (!note_path) {
          return;
        }
        stores.notes.toggle_star_path(note_path);
      },
    });
  }

  register_open_actions();
  register_image_actions();
  register_delete_actions();
  register_rename_actions();
  register_save_actions();
  register_star_actions();
}

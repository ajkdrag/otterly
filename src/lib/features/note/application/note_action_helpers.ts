import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  as_note_path,
  type NoteId,
  type NotePath,
} from "$lib/shared/types/ids";
import type { PastedImagePayload } from "$lib/shared/types/editor";
import type { EditorSettings } from "$lib/shared/types/editor_settings";
import { sanitize_note_name } from "$lib/features/note/domain/sanitize_note_name";
import { to_markdown_asset_target } from "$lib/features/note/domain/asset_markdown_path";

export function close_delete_dialog(input: ActionRegistrationInput) {
  input.stores.ui.delete_note_dialog = {
    open: false,
    note: null,
  };
}

export function close_rename_dialog(input: ActionRegistrationInput) {
  input.stores.ui.rename_note_dialog = {
    open: false,
    note: null,
    new_name: "",
    show_overwrite_confirm: false,
    is_checking_conflict: false,
  };
}

export function close_save_dialog(input: ActionRegistrationInput) {
  input.stores.ui.save_note_dialog = {
    open: false,
    folder_path: "",
    new_path: null,
    show_overwrite_confirm: false,
    is_checking_existence: false,
    source: "manual",
  };
}

export function close_image_paste_dialog(input: ActionRegistrationInput) {
  input.stores.ui.image_paste_dialog = {
    open: false,
    note_id: null,
    note_path: null,
    image: null,
    filename: "",
    estimated_size_bytes: 0,
    target_folder: "",
  };
}

export function build_full_path(
  folder_path: string,
  filename: string,
): NotePath {
  const sanitized = sanitize_note_name(filename);
  return as_note_path(folder_path ? `${folder_path}/${sanitized}` : sanitized);
}

export function filename_from_path(path: string): string {
  const last_slash = path.lastIndexOf("/");
  return last_slash >= 0 ? path.slice(last_slash + 1) : path;
}

export function build_note_path_from_name(
  parent: string,
  name: string,
): NotePath {
  const filename = `${name}.md`;
  return as_note_path(parent ? `${parent}/${filename}` : filename);
}

export function image_alt_text(file_name: string | null): string {
  if (!file_name) return "image";
  const leaf = file_name.split("/").filter(Boolean).at(-1) ?? "";
  const stem = leaf.replace(/\.[^.]+$/i, "").trim();
  return stem !== "" ? stem : "image";
}

export function parse_note_open_input(input: unknown): {
  note_path: string;
  cleanup_if_missing: boolean;
} {
  if (input && typeof input === "object" && "note_path" in input) {
    const record = input as Record<string, unknown>;
    if (typeof record.note_path === "string") {
      return {
        note_path: record.note_path,
        cleanup_if_missing: record.cleanup_if_missing === true,
      };
    }
  }

  return {
    note_path: String(input),
    cleanup_if_missing: false,
  };
}

export function get_asset_write_options(settings: EditorSettings): {
  store_with_note?: boolean;
  attachment_folder?: string;
} {
  if (settings.store_attachments_with_note) {
    return { store_with_note: true };
  }
  return { attachment_folder: settings.attachment_folder || ".assets" };
}

export async function save_and_insert_image(
  input: ActionRegistrationInput,
  note_id: NoteId,
  note_path: NotePath,
  image: PastedImagePayload,
  options?: {
    custom_filename?: string;
    attachment_folder?: string;
    store_with_note?: boolean;
  },
): Promise<void> {
  const { stores, services } = input;

  const write_result = await services.note.save_pasted_image(
    note_path,
    image,
    options,
  );
  if (write_result.status !== "saved") return;

  const latest_open_note = stores.editor.open_note;
  if (!latest_open_note || latest_open_note.meta.id !== note_id) return;

  const target = to_markdown_asset_target(note_path, write_result.asset_path);
  const alt = image_alt_text(image.file_name);
  services.editor.insert_text(`![${alt}](${target})`);
}

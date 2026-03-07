import type { NotesPort } from "$lib/features/note/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  MarkdownText,
  NoteId,
  NotePath,
  VaultId,
} from "$lib/shared/types/ids";
import type { NoteDoc, NoteMeta } from "$lib/shared/types/note";
import type {
  FolderContents,
  FolderStats,
  MoveItem,
  MoveItemResult,
} from "$lib/shared/types/filetree";

export function create_notes_tauri_adapter(): NotesPort {
  const invoke_notes = <Result>(
    command: string,
    payload: Record<string, unknown>,
  ) => tauri_invoke<Result>(command, payload);
  const invoke_notes_args = <Result>(
    command: string,
    args: Record<string, unknown>,
  ) => tauri_invoke<Result>(command, { args });

  return {
    async list_notes(vault_id: VaultId) {
      return await invoke_notes<NoteMeta[]>("list_notes", {
        vaultId: vault_id,
      });
    },
    async list_folders(vault_id: VaultId) {
      return await invoke_notes<string[]>("list_folders", {
        vaultId: vault_id,
      });
    },
    async read_note(vault_id: VaultId, note_id: NoteId) {
      return await invoke_notes<NoteDoc>("read_note", {
        vaultId: vault_id,
        noteId: note_id,
      });
    },
    async write_note(
      vault_id: VaultId,
      note_id: NoteId,
      markdown: MarkdownText,
    ) {
      await invoke_notes_args<undefined>("write_note", {
        vault_id,
        note_id,
        markdown,
      });
    },
    async create_note(
      vault_id: VaultId,
      note_path: NotePath,
      initial_markdown: MarkdownText,
    ) {
      return await invoke_notes_args<NoteMeta>("create_note", {
        vault_id,
        note_path,
        initial_markdown,
      });
    },
    async create_folder(
      vault_id: VaultId,
      parent_path: string,
      folder_name: string,
    ) {
      await invoke_notes_args<undefined>("create_folder", {
        vault_id,
        parent_path,
        folder_name,
      });
    },
    async rename_note(vault_id: VaultId, from: NotePath, to: NotePath) {
      await invoke_notes_args<undefined>("rename_note", {
        vault_id,
        from,
        to,
      });
    },
    async delete_note(vault_id: VaultId, note_id: NoteId) {
      await invoke_notes_args<undefined>("delete_note", {
        vault_id,
        note_id,
      });
    },
    async list_folder_contents(
      vault_id: VaultId,
      folder_path: string,
      offset: number,
      limit: number,
    ): Promise<FolderContents> {
      const contents = await invoke_notes<FolderContents>(
        "list_folder_contents",
        {
          vaultId: vault_id,
          folderPath: folder_path,
          offset,
          limit,
        },
      );
      return { ...contents, files: contents.files ?? [] };
    },
    async rename_folder(vault_id: VaultId, from_path: string, to_path: string) {
      await invoke_notes_args<undefined>("rename_folder", {
        vault_id,
        from_path,
        to_path,
      });
    },
    async delete_folder(vault_id: VaultId, folder_path: string) {
      await invoke_notes_args<undefined>("delete_folder", {
        vault_id,
        folder_path,
      });
    },
    async get_folder_stats(
      vault_id: VaultId,
      folder_path: string,
    ): Promise<FolderStats> {
      return await invoke_notes<FolderStats>("get_folder_stats", {
        vaultId: vault_id,
        folderPath: folder_path,
      });
    },
    async move_items(
      vault_id: VaultId,
      items: MoveItem[],
      target_folder: string,
      overwrite: boolean,
    ): Promise<MoveItemResult[]> {
      return await invoke_notes_args<MoveItemResult[]>("move_items", {
        vault_id,
        items,
        target_folder,
        overwrite,
      });
    },
  };
}

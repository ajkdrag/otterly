import type {
  MarkdownText,
  NoteId,
  NotePath,
  VaultId,
  AssetPath,
} from "$lib/shared/types/ids";
import type { NoteDoc, NoteMeta } from "$lib/shared/types/note";
import type {
  FolderContents,
  FolderStats,
  MoveItem,
  MoveItemResult,
} from "$lib/shared/types/filetree";

export type { FolderStats } from "$lib/shared/types/filetree";
import type { PastedImagePayload } from "$lib/shared/types/editor";

export type WriteImageAssetInput = {
  note_path: NotePath;
  image: PastedImagePayload;
  custom_filename?: string;
  attachment_folder?: string;
  store_with_note?: boolean;
};

export interface AssetsPort {
  resolve_asset_url(
    vault_id: VaultId,
    asset_path: AssetPath,
  ): string | Promise<string>;
  write_image_asset(
    vault_id: VaultId,
    input: WriteImageAssetInput,
  ): Promise<AssetPath>;
}

export interface NotesPort {
  list_notes(vault_id: VaultId): Promise<NoteMeta[]>;
  list_folders(vault_id: VaultId): Promise<string[]>;
  read_note(vault_id: VaultId, note_id: NoteId): Promise<NoteDoc>;
  read_note_meta(vault_id: VaultId, note_id: NoteId): Promise<NoteMeta>;
  write_note(
    vault_id: VaultId,
    note_id: NoteId,
    markdown: MarkdownText,
    expected_mtime_ms?: number,
  ): Promise<number>;
  create_note(
    vault_id: VaultId,
    note_path: NotePath,
    initial_markdown: MarkdownText,
  ): Promise<NoteMeta>;
  create_folder(
    vault_id: VaultId,
    parent_path: string,
    folder_name: string,
  ): Promise<void>;
  rename_note(vault_id: VaultId, from: NotePath, to: NotePath): Promise<void>;
  delete_note(vault_id: VaultId, note_id: NoteId): Promise<void>;
  rename_folder(
    vault_id: VaultId,
    from_path: string,
    to_path: string,
  ): Promise<void>;
  delete_folder(vault_id: VaultId, folder_path: string): Promise<void>;
  list_folder_contents(
    vault_id: VaultId,
    folder_path: string,
    offset: number,
    limit: number,
  ): Promise<FolderContents>;
  get_folder_stats(
    vault_id: VaultId,
    folder_path: string,
  ): Promise<FolderStats>;
  move_items(
    vault_id: VaultId,
    items: MoveItem[],
    target_folder: string,
    overwrite: boolean,
  ): Promise<MoveItemResult[]>;
}

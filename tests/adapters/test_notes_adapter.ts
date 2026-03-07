import type { NotesPort, FolderStats } from "$lib/features/note";
import {
  as_markdown_text,
  as_note_path,
  type MarkdownText,
  type NoteId,
  type NotePath,
  type VaultId,
} from "$lib/shared/types/ids";
import type { NoteDoc, NoteMeta } from "$lib/shared/types/note";
import type {
  FolderContents,
  MoveItem,
  MoveItemResult,
} from "$lib/shared/types/filetree";

function derive_note_meta(
  note_path: NotePath,
  data: { markdown: MarkdownText; mtime_ms: number },
): NoteMeta {
  const parts = note_path.split("/").filter(Boolean);
  const last_part = parts[parts.length - 1] || "";
  const title = last_part.replace(/\.md$/, "");
  return {
    id: note_path,
    path: note_path,
    name: title,
    title,
    mtime_ms: data.mtime_ms,
    size_bytes: new Blob([data.markdown]).size,
  };
}

const FALLBACK_TEST_NOTES = new Map<
  NotePath,
  { markdown: MarkdownText; mtime_ms: number }
>([
  [
    as_note_path("welcome.md"),
    {
      markdown: as_markdown_text("# Welcome\n\nWelcome to your notes."),
      mtime_ms: Date.now(),
    },
  ],
  [
    as_note_path("getting-started.md"),
    {
      markdown: as_markdown_text("# Getting Started\n\nStart taking notes!"),
      mtime_ms: Date.now(),
    },
  ],
]);

function load_base_files(): Promise<
  Map<NotePath, { markdown: MarkdownText; mtime_ms: number }>
> {
  return Promise.resolve(new Map(FALLBACK_TEST_NOTES));
}

export function create_test_notes_adapter(): NotesPort {
  const created_folders = new Set<string>();
  const user_notes = new Map<
    NotePath,
    { markdown: MarkdownText; mtime_ms: number }
  >();

  return {
    async list_notes(_vault_id: VaultId): Promise<NoteMeta[]> {
      const notes = await load_base_files();
      for (const [note_path, data] of user_notes.entries()) {
        notes.set(note_path, data);
      }
      const result: NoteMeta[] = [];

      for (const [note_path, data] of notes.entries()) {
        result.push(derive_note_meta(note_path, data));
      }

      return result.sort((a, b) => a.path.localeCompare(b.path));
    },

    async list_folders(_vault_id: VaultId): Promise<string[]> {
      const notes = await load_base_files();
      for (const [note_path, data] of user_notes.entries()) {
        notes.set(note_path, data);
      }
      const dirs = new Set<string>();
      for (const note_path of notes.keys()) {
        const parts = note_path.split("/").filter(Boolean);
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join("/"));
        }
      }
      for (const folder of created_folders) {
        dirs.add(folder);
      }
      return Array.from(dirs).sort((a, b) => a.localeCompare(b));
    },

    async read_note(_vault_id: VaultId, note_id: NoteId): Promise<NoteDoc> {
      const notes = await load_base_files();
      const note_path = as_note_path(note_id);
      const note_data = user_notes.get(note_path) ?? notes.get(note_path);

      if (!note_data) {
        throw new Error(`Note not found: ${note_id}`);
      }

      return {
        meta: derive_note_meta(note_path, note_data),
        markdown: as_markdown_text(note_data.markdown),
      };
    },

    write_note(
      _vault_id: VaultId,
      note_id: NoteId,
      markdown: MarkdownText,
    ): Promise<void> {
      const note_path = as_note_path(note_id);
      user_notes.set(note_path, { markdown, mtime_ms: Date.now() });
      return Promise.resolve();
    },

    create_note(
      _vault_id: VaultId,
      note_path: NotePath,
      initial_markdown: MarkdownText,
    ): Promise<NoteMeta> {
      const full_path = note_path.endsWith(".md")
        ? as_note_path(note_path)
        : as_note_path(`${note_path}.md`);
      const data = { markdown: initial_markdown, mtime_ms: Date.now() };
      user_notes.set(full_path, data);

      return Promise.resolve(derive_note_meta(full_path, data));
    },

    create_folder(
      _vault_id: VaultId,
      parent_path: string,
      folder_name: string,
    ): Promise<void> {
      const full_path = parent_path
        ? `${parent_path}/${folder_name}`
        : folder_name;
      created_folders.add(full_path);
      return Promise.resolve();
    },

    rename_note(
      _vault_id: VaultId,
      _from: NotePath,
      _to: NotePath,
    ): Promise<void> {
      return Promise.resolve();
    },

    delete_note(_vault_id: VaultId, _note_id: NoteId): Promise<void> {
      return Promise.resolve();
    },

    async list_folder_contents(
      _vault_id: VaultId,
      folder_path: string,
      offset: number,
      limit: number,
    ): Promise<FolderContents> {
      const notes = await load_base_files();
      for (const [note_path, data] of user_notes.entries()) {
        notes.set(note_path, data);
      }
      const result_notes: NoteMeta[] = [];
      const subfolders = new Set<string>();

      const prefix = folder_path ? folder_path + "/" : "";

      for (const [note_path, data] of notes.entries()) {
        if (!note_path.startsWith(prefix) && prefix !== "") continue;

        const remaining = prefix ? note_path.slice(prefix.length) : note_path;
        const slash_index = remaining.indexOf("/");

        if (slash_index === -1) {
          result_notes.push(derive_note_meta(note_path, data));
        } else {
          const subfolder_name = remaining.slice(0, slash_index);
          const subfolder_path = folder_path
            ? `${folder_path}/${subfolder_name}`
            : subfolder_name;
          subfolders.add(subfolder_path);
        }
      }

      for (const folder of created_folders) {
        const is_direct_child = folder_path
          ? folder.startsWith(folder_path + "/") &&
            !folder.slice(folder_path.length + 1).includes("/")
          : !folder.includes("/");

        if (is_direct_child) {
          subfolders.add(folder);
        }
      }

      const sorted_notes = result_notes.sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      const sorted_subfolders = Array.from(subfolders).sort((a, b) =>
        a.localeCompare(b),
      );
      const combined = [
        ...sorted_subfolders.map((path) => ({ kind: "folder" as const, path })),
        ...sorted_notes.map((note) => ({ kind: "note" as const, note })),
      ];

      const total_count = combined.length;
      const start = Math.min(offset, total_count);
      const end = Math.min(start + Math.max(limit, 0), total_count);
      const page = combined.slice(start, end);

      const paged_notes: NoteMeta[] = [];
      const paged_subfolders: string[] = [];
      for (const entry of page) {
        if (entry.kind === "folder") {
          paged_subfolders.push(entry.path);
        } else {
          paged_notes.push(entry.note);
        }
      }

      return {
        notes: paged_notes,
        subfolders: paged_subfolders,
        files: [],
        total_count,
        has_more: end < total_count,
      };
    },

    rename_folder(
      _vault_id: VaultId,
      from_path: string,
      to_path: string,
    ): Promise<void> {
      if (created_folders.has(from_path)) {
        created_folders.delete(from_path);
        created_folders.add(to_path);
      }
      return Promise.resolve();
    },

    delete_folder(_vault_id: VaultId, folder_path: string): Promise<void> {
      const prefix = folder_path + "/";

      for (const folder of created_folders) {
        if (folder === folder_path || folder.startsWith(prefix)) {
          created_folders.delete(folder);
        }
      }
      return Promise.resolve();
    },

    async get_folder_stats(
      _vault_id: VaultId,
      folder_path: string,
    ): Promise<FolderStats> {
      const notes = await load_base_files();
      const prefix = folder_path + "/";

      let note_count = 0;
      let folder_count = 0;

      for (const note_path of notes.keys()) {
        if (note_path.startsWith(prefix)) {
          note_count++;
        }
      }

      for (const folder of created_folders) {
        if (folder.startsWith(prefix)) {
          folder_count++;
        }
      }

      return { note_count, folder_count };
    },

    move_items(
      _vault_id: VaultId,
      items: MoveItem[],
      target_folder: string,
      _overwrite: boolean,
    ): Promise<MoveItemResult[]> {
      const target_prefix = target_folder ? `${target_folder}/` : "";
      const results: MoveItemResult[] = [];

      for (const item of items) {
        const leaf = item.path.split("/").at(-1) ?? item.path;
        const new_path = `${target_prefix}${leaf}`;

        if (item.is_folder) {
          const old_prefix = `${item.path}/`;
          const new_prefix = `${new_path}/`;
          for (const [path, data] of user_notes.entries()) {
            if (!path.startsWith(old_prefix)) continue;
            user_notes.delete(path);
            user_notes.set(
              as_note_path(`${new_prefix}${path.slice(old_prefix.length)}`),
              data,
            );
          }
          for (const folder of Array.from(created_folders)) {
            if (folder === item.path) {
              created_folders.delete(folder);
              created_folders.add(new_path);
              continue;
            }
            if (!folder.startsWith(old_prefix)) continue;
            created_folders.delete(folder);
            created_folders.add(
              `${new_prefix}${folder.slice(old_prefix.length)}`,
            );
          }
          results.push({
            path: item.path,
            new_path,
            success: true,
            error: null,
          });
          continue;
        }

        const source = as_note_path(item.path);
        const next = as_note_path(new_path);
        const data = user_notes.get(source);
        if (!data) {
          results.push({
            path: item.path,
            new_path,
            success: false,
            error: "source not found",
          });
          continue;
        }
        user_notes.delete(source);
        user_notes.set(next, data);
        results.push({ path: item.path, new_path, success: true, error: null });
      }

      return Promise.resolve(results);
    },
  };
}

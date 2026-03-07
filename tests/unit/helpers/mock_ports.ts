import type { VaultPort } from "$lib/features/vault/ports";
import type { NotesPort, FolderStats } from "$lib/features/note/ports";
import type { WorkspaceIndexPort } from "$lib/features/search/ports";
import type {
  VaultId,
  VaultPath,
  NotePath,
  NoteId,
  MarkdownText,
} from "$lib/shared/types/ids";
import type { Vault } from "$lib/shared/types/vault";
import type { NoteMeta } from "$lib/shared/types/note";
import type {
  FolderContents,
  MoveItem,
  MoveItemResult,
} from "$lib/shared/types/filetree";

export function create_mock_vault_port(): VaultPort & {
  _calls: {
    choose_vault: number;
    open_vault: VaultPath[];
    open_vault_by_id: VaultId[];
  };
  _mock_vaults: Vault[];
} {
  const mock = {
    _calls: {
      choose_vault: 0,
      open_vault: [] as VaultPath[],
      open_vault_by_id: [] as VaultId[],
    },
    _mock_vaults: [] as Vault[],
    choose_vault() {
      mock._calls.choose_vault++;
      return Promise.resolve(null);
    },
    open_vault(vault_path: VaultPath) {
      mock._calls.open_vault.push(vault_path);
      const vault = mock._mock_vaults.find((v) => v.path === vault_path);
      if (!vault)
        return Promise.reject(new Error(`Vault not found: ${vault_path}`));
      return Promise.resolve(vault);
    },
    open_vault_by_id(vault_id: VaultId) {
      mock._calls.open_vault_by_id.push(vault_id);
      const vault = mock._mock_vaults.find((v) => v.id === vault_id);
      if (!vault)
        return Promise.reject(new Error(`Vault not found: ${vault_id}`));
      return Promise.resolve(vault);
    },
    list_vaults() {
      return Promise.resolve(mock._mock_vaults);
    },
    remove_vault(vault_id: VaultId) {
      mock._mock_vaults = mock._mock_vaults.filter((v) => v.id !== vault_id);
      return Promise.resolve();
    },
    remember_last_vault(_vault_id: VaultId) {
      return Promise.resolve();
    },
    get_last_vault_id() {
      return Promise.resolve(null);
    },
    resolve_file_to_vault() {
      return Promise.resolve(null);
    },
    open_folder(vault_path: VaultPath) {
      mock._calls.open_vault.push(vault_path);
      const vault = mock._mock_vaults.find((v) => v.path === vault_path);
      const resolved = vault ?? mock._mock_vaults[0];
      if (!resolved) return Promise.reject(new Error("no mock vault"));
      return Promise.resolve(resolved);
    },
    promote_to_vault(vault_id: VaultId) {
      const vault = mock._mock_vaults.find((v) => v.id === vault_id);
      if (!vault) return Promise.reject(new Error("vault not found"));
      return Promise.resolve({ ...vault, mode: "vault" as const });
    },
  };
  return mock;
}

export function create_mock_notes_port(): NotesPort & {
  _mock_notes: Map<VaultId, NoteMeta[]>;
  _mock_folders: Map<VaultId, string[]>;
  _calls: {
    delete_note: { vault_id: VaultId; note_id: NoteId }[];
    rename_note: { vault_id: VaultId; from: NotePath; to: NotePath }[];
    write_note: {
      vault_id: VaultId;
      note_id: NoteId;
      markdown: MarkdownText;
    }[];
    create_note: {
      vault_id: VaultId;
      note_path: NotePath;
      markdown: MarkdownText;
    }[];
    create_folder: {
      vault_id: VaultId;
      parent_path: string;
      folder_name: string;
    }[];
    rename_folder: { vault_id: VaultId; from_path: string; to_path: string }[];
    delete_folder: { vault_id: VaultId; folder_path: string }[];
    get_folder_stats: { vault_id: VaultId; folder_path: string }[];
    move_items: {
      vault_id: VaultId;
      items: MoveItem[];
      target_folder: string;
      overwrite: boolean;
    }[];
  };
} {
  const mock = {
    _mock_notes: new Map<VaultId, NoteMeta[]>(),
    _mock_folders: new Map<VaultId, string[]>(),
    _calls: {
      delete_note: [] as { vault_id: VaultId; note_id: NoteId }[],
      rename_note: [] as { vault_id: VaultId; from: NotePath; to: NotePath }[],
      write_note: [] as {
        vault_id: VaultId;
        note_id: NoteId;
        markdown: MarkdownText;
      }[],
      create_note: [] as {
        vault_id: VaultId;
        note_path: NotePath;
        markdown: MarkdownText;
      }[],
      create_folder: [] as {
        vault_id: VaultId;
        parent_path: string;
        folder_name: string;
      }[],
      rename_folder: [] as {
        vault_id: VaultId;
        from_path: string;
        to_path: string;
      }[],
      delete_folder: [] as { vault_id: VaultId; folder_path: string }[],
      get_folder_stats: [] as { vault_id: VaultId; folder_path: string }[],
      move_items: [] as {
        vault_id: VaultId;
        items: MoveItem[];
        target_folder: string;
        overwrite: boolean;
      }[],
    },
    list_notes(vault_id: VaultId) {
      return Promise.resolve(mock._mock_notes.get(vault_id) || []);
    },
    list_folders(vault_id: VaultId) {
      return Promise.resolve(mock._mock_folders.get(vault_id) || []);
    },
    read_note(_vault_id: VaultId, _note_id: NoteId) {
      return Promise.resolve({
        meta: {
          id: _note_id,
          path: _note_id,
          name: String(_note_id).split("/").at(-1)?.replace(/\.md$/, "") ?? "",
          title: "",
          mtime_ms: 0,
          size_bytes: 0,
        },
        markdown: "" as MarkdownText,
      });
    },
    write_note(vault_id: VaultId, note_id: NoteId, markdown: MarkdownText) {
      mock._calls.write_note.push({ vault_id, note_id, markdown });
      return Promise.resolve();
    },
    create_note(
      vault_id: VaultId,
      note_path: NotePath,
      markdown: MarkdownText,
    ) {
      mock._calls.create_note.push({ vault_id, note_path, markdown });
      const stem =
        String(note_path).split("/").at(-1)?.replace(/\.md$/, "") ?? "";
      const new_note = {
        id: note_path,
        path: note_path,
        name: stem,
        title: note_path.replace(".md", ""),
        mtime_ms: Date.now(),
        size_bytes: markdown.length,
      };
      const current = mock._mock_notes.get(vault_id) || [];
      mock._mock_notes.set(vault_id, [...current, new_note]);
      return Promise.resolve(new_note);
    },
    delete_note(vault_id: VaultId, note_id: NoteId) {
      mock._calls.delete_note.push({ vault_id, note_id });
      const current = mock._mock_notes.get(vault_id) || [];
      mock._mock_notes.set(
        vault_id,
        current.filter((note) => note.id !== note_id),
      );
      return Promise.resolve();
    },
    rename_note(
      vault_id: VaultId,
      old_path: NotePath,
      new_path: NotePath,
    ): Promise<void> {
      mock._calls.rename_note.push({ vault_id, from: old_path, to: new_path });
      const current = mock._mock_notes.get(vault_id) || [];
      const updated = current.map((note) =>
        note.path === old_path
          ? { ...note, path: new_path, id: new_path }
          : note,
      );
      mock._mock_notes.set(vault_id, updated);
      return Promise.resolve();
    },
    create_folder(
      vault_id: VaultId,
      parent_path: string,
      folder_name: string,
    ): Promise<void> {
      mock._calls.create_folder.push({ vault_id, parent_path, folder_name });
      const full_path = parent_path
        ? `${parent_path}/${folder_name}`
        : folder_name;
      const current = mock._mock_folders.get(vault_id) || [];
      if (!current.includes(full_path)) {
        mock._mock_folders.set(
          vault_id,
          [...current, full_path].sort((a, b) => a.localeCompare(b)),
        );
      }
      return Promise.resolve();
    },
    list_folder_contents(
      vault_id: VaultId,
      folder_path: string,
      offset: number,
      limit: number,
    ): Promise<FolderContents> {
      const all_notes = mock._mock_notes.get(vault_id) || [];
      const all_folders = mock._mock_folders.get(vault_id) || [];
      const prefix = folder_path ? folder_path + "/" : "";

      const notes = all_notes.filter((note) => {
        if (!note.path.startsWith(prefix) && prefix !== "") return false;
        const remaining = prefix ? note.path.slice(prefix.length) : note.path;
        return !remaining.includes("/");
      });

      const subfolders = all_folders.filter((folder) => {
        if (!folder.startsWith(prefix) && prefix !== "") return false;
        const remaining = prefix ? folder.slice(prefix.length) : folder;
        return !remaining.includes("/");
      });

      const sorted_notes = [...notes].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      const sorted_folders = [...subfolders].sort((a, b) => a.localeCompare(b));
      const combined = [
        ...sorted_folders.map((path) => ({ kind: "folder" as const, path })),
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

      return Promise.resolve({
        notes: paged_notes,
        subfolders: paged_subfolders,
        files: [],
        total_count,
        has_more: end < total_count,
      });
    },
    rename_folder(vault_id: VaultId, from_path: string, to_path: string) {
      mock._calls.rename_folder.push({ vault_id, from_path, to_path });
      const current = mock._mock_folders.get(vault_id) || [];
      const updated = current.map((path) =>
        path === from_path ? to_path : path,
      );
      mock._mock_folders.set(vault_id, updated);
      return Promise.resolve();
    },
    delete_folder(vault_id: VaultId, folder_path: string) {
      mock._calls.delete_folder.push({ vault_id, folder_path });
      const prefix = folder_path + "/";
      const current_folders = mock._mock_folders.get(vault_id) || [];
      const updated_folders = current_folders.filter(
        (path) => path !== folder_path && !path.startsWith(prefix),
      );
      mock._mock_folders.set(vault_id, updated_folders);
      return Promise.resolve();
    },
    get_folder_stats(
      vault_id: VaultId,
      folder_path: string,
    ): Promise<FolderStats> {
      mock._calls.get_folder_stats.push({ vault_id, folder_path });
      return Promise.resolve({ note_count: 0, folder_count: 0 });
    },
    move_items(
      vault_id: VaultId,
      items: MoveItem[],
      target_folder: string,
      overwrite: boolean,
    ): Promise<MoveItemResult[]> {
      mock._calls.move_items.push({
        vault_id,
        items,
        target_folder,
        overwrite,
      });
      const folder_prefix = target_folder ? `${target_folder}/` : "";
      const current_notes = mock._mock_notes.get(vault_id) || [];
      const current_folders = mock._mock_folders.get(vault_id) || [];

      const next_notes = [...current_notes];
      const next_folders = [...current_folders];
      const results: MoveItemResult[] = [];

      for (const item of items) {
        const leaf = item.path.split("/").at(-1) ?? item.path;
        const new_path = `${folder_prefix}${leaf}`;
        if (item.path === new_path) {
          results.push({
            path: item.path,
            new_path,
            success: false,
            error: "item already in target folder",
          });
          continue;
        }

        if (item.is_folder) {
          const old_prefix = `${item.path}/`;
          const new_prefix = `${new_path}/`;
          for (let i = 0; i < next_folders.length; i += 1) {
            const folder = next_folders[i];
            if (!folder) continue;
            if (folder === item.path) {
              next_folders[i] = new_path;
            } else if (folder.startsWith(old_prefix)) {
              next_folders[i] =
                `${new_prefix}${folder.slice(old_prefix.length)}`;
            }
          }
          for (let i = 0; i < next_notes.length; i += 1) {
            const note = next_notes[i];
            if (!note || !note.path.startsWith(old_prefix)) continue;
            const updated_path = `${new_prefix}${note.path.slice(old_prefix.length)}`;
            next_notes[i] = {
              ...note,
              id: updated_path as NoteId,
              path: updated_path as NotePath,
            };
          }
          results.push({
            path: item.path,
            new_path,
            success: true,
            error: null,
          });
          continue;
        }

        const note_index = next_notes.findIndex(
          (note) => note.path === item.path,
        );
        if (note_index < 0) {
          results.push({
            path: item.path,
            new_path,
            success: false,
            error: "source not found",
          });
          continue;
        }
        const note = next_notes[note_index];
        if (!note) continue;
        next_notes[note_index] = {
          ...note,
          id: new_path as NoteId,
          path: new_path as NotePath,
        };
        results.push({ path: item.path, new_path, success: true, error: null });
      }

      mock._mock_notes.set(vault_id, next_notes);
      mock._mock_folders.set(
        vault_id,
        Array.from(new Set(next_folders)).sort((a, b) => a.localeCompare(b)),
      );
      return Promise.resolve(results);
    },
  };
  return mock;
}

export function create_mock_index_port(): WorkspaceIndexPort & {
  _mock_note_paths_by_prefix: Map<string, string[]>;
  _calls: {
    cancel_index: VaultId[];
    sync_index: VaultId[];
    rebuild_index: VaultId[];
    list_note_paths_by_prefix: { vault_id: VaultId; prefix: string }[];
    upsert_note: { vault_id: VaultId; note_id: NoteId }[];
    remove_note: { vault_id: VaultId; note_id: NoteId }[];
    remove_notes: { vault_id: VaultId; note_ids: NoteId[] }[];
    rename_note_path: {
      vault_id: VaultId;
      old_path: NoteId;
      new_path: NoteId;
    }[];
    remove_notes_by_prefix: { vault_id: VaultId; prefix: string }[];
    rename_folder_paths: {
      vault_id: VaultId;
      old_prefix: string;
      new_prefix: string;
    }[];
  };
} {
  const mock = {
    _mock_note_paths_by_prefix: new Map<string, string[]>(),
    _calls: {
      cancel_index: [] as VaultId[],
      sync_index: [] as VaultId[],
      rebuild_index: [] as VaultId[],
      list_note_paths_by_prefix: [] as { vault_id: VaultId; prefix: string }[],
      upsert_note: [] as { vault_id: VaultId; note_id: NoteId }[],
      remove_note: [] as { vault_id: VaultId; note_id: NoteId }[],
      remove_notes: [] as { vault_id: VaultId; note_ids: NoteId[] }[],
      rename_note_path: [] as {
        vault_id: VaultId;
        old_path: NoteId;
        new_path: NoteId;
      }[],
      remove_notes_by_prefix: [] as { vault_id: VaultId; prefix: string }[],
      rename_folder_paths: [] as {
        vault_id: VaultId;
        old_prefix: string;
        new_prefix: string;
      }[],
    },
    cancel_index(vault_id: VaultId) {
      mock._calls.cancel_index.push(vault_id);
      return Promise.resolve();
    },
    sync_index(vault_id: VaultId) {
      mock._calls.sync_index.push(vault_id);
      return Promise.resolve();
    },
    rebuild_index(vault_id: VaultId) {
      mock._calls.rebuild_index.push(vault_id);
      return Promise.resolve();
    },
    list_note_paths_by_prefix(vault_id: VaultId, prefix: string) {
      mock._calls.list_note_paths_by_prefix.push({ vault_id, prefix });
      const key = `${String(vault_id)}::${prefix}`;
      return Promise.resolve(mock._mock_note_paths_by_prefix.get(key) ?? []);
    },
    upsert_note(vault_id: VaultId, note_id: NoteId) {
      mock._calls.upsert_note.push({ vault_id, note_id });
      return Promise.resolve();
    },
    remove_note(vault_id: VaultId, note_id: NoteId) {
      mock._calls.remove_note.push({ vault_id, note_id });
      return Promise.resolve();
    },
    remove_notes(vault_id: VaultId, note_ids: NoteId[]) {
      mock._calls.remove_notes.push({ vault_id, note_ids });
      return Promise.resolve();
    },
    rename_note_path(vault_id: VaultId, old_path: NoteId, new_path: NoteId) {
      mock._calls.rename_note_path.push({ vault_id, old_path, new_path });
      return Promise.resolve();
    },
    remove_notes_by_prefix(vault_id: VaultId, prefix: string) {
      mock._calls.remove_notes_by_prefix.push({ vault_id, prefix });
      return Promise.resolve();
    },
    rename_folder_paths(
      vault_id: VaultId,
      old_prefix: string,
      new_prefix: string,
    ) {
      mock._calls.rename_folder_paths.push({
        vault_id,
        old_prefix,
        new_prefix,
      });
      return Promise.resolve();
    },
    subscribe_index_progress() {
      return () => {};
    },
  };
  return mock;
}

export function create_mock_ports() {
  return {
    vault: create_mock_vault_port(),
    notes: create_mock_notes_port(),
    index: create_mock_index_port(),
  };
}

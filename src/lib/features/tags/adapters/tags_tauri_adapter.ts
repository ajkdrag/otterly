import type { TagsPort } from "$lib/features/tags/ports";
import type {
  TagCount,
  TaggedNote,
  TagNotePage,
} from "$lib/features/tags/types/tag";
import type { NoteId } from "$lib/shared/types/ids";
import type { NoteMatchDetail } from "$lib/shared/types/search";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

type TauriNoteMeta = {
  id: string;
  path: string;
  title: string;
  name: string;
  mtime_ms: number;
  size_bytes: number;
};

type TauriTaggedNote = {
  note: TauriNoteMeta;
  snippet: string | null;
  match_detail: NoteMatchDetail | null;
};

type TauriTagNotePage = {
  notes: TauriTaggedNote[];
  total: number;
  truncated: boolean;
};

function to_tagged_note(entry: TauriTaggedNote): TaggedNote {
  return {
    note: {
      id: entry.note.id as NoteId,
      path: entry.note.path as NoteId,
      title: entry.note.title,
      name: entry.note.name,
      mtime_ms: entry.note.mtime_ms,
      size_bytes: entry.note.size_bytes,
    },
    snippet: entry.snippet,
    match_detail: entry.match_detail,
  };
}

export function create_tags_tauri_adapter(): TagsPort {
  return {
    list_tags(vault_id) {
      return tauri_invoke<TagCount[]>("index_list_tags", {
        vaultId: vault_id,
      });
    },

    suggest_tags(vault_id, partial, exclude, limit) {
      return tauri_invoke<TagCount[]>("index_suggest_tags", {
        vaultId: vault_id,
        partial,
        exclude,
        limit,
      });
    },

    async search_tagged_notes(vault_id, query): Promise<TagNotePage> {
      const page = await tauri_invoke<TauriTagNotePage>(
        "index_search_tagged_notes",
        { vaultId: vault_id, query },
      );
      return {
        notes: page.notes.map(to_tagged_note),
        total: page.total,
        truncated: page.truncated,
      };
    },

    extract_note_tags(markdown) {
      return tauri_invoke<string[]>("extract_note_tags", { markdown });
    },
  };
}

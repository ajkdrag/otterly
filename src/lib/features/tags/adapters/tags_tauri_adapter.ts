import type { TagsPort } from "$lib/features/tags/ports";
import type { TagCount, TaggedNote } from "$lib/features/tags/types/tag";
import type { NoteId } from "$lib/shared/types/ids";
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
  excerpt: string | null;
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
    excerpt: entry.excerpt,
  };
}

export function create_tags_tauri_adapter(): TagsPort {
  return {
    list_tags(vault_id) {
      return tauri_invoke<TagCount[]>("index_list_tags", {
        vaultId: vault_id,
      });
    },

    async list_notes_with_tag(vault_id, tag) {
      const entries = await tauri_invoke<TauriTaggedNote[]>(
        "index_list_notes_with_tag",
        { vaultId: vault_id, tag },
      );
      return entries.map(to_tagged_note);
    },

    extract_note_tags(markdown) {
      return tauri_invoke<string[]>("extract_note_tags", { markdown });
    },
  };
}

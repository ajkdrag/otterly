import type { VaultId } from "$lib/shared/types/ids";
import type {
  TagCount,
  TagNotePage,
  TagNoteQuery,
} from "$lib/features/tags/types/tag";

export interface TagsPort {
  list_tags(vault_id: VaultId): Promise<TagCount[]>;
  // Ranked by the index: exact, prefix, later `/` segment, contains, fuzzy,
  // then count. `exclude` drops tags by key.
  suggest_tags(
    vault_id: VaultId,
    partial: string,
    exclude: string[],
    limit: number,
  ): Promise<TagCount[]>;
  search_tagged_notes(
    vault_id: VaultId,
    query: TagNoteQuery,
  ): Promise<TagNotePage>;
  extract_note_tags(markdown: string): Promise<string[]>;
}

import type { VaultId } from "$lib/shared/types/ids";
import type { TagCount, TaggedNote } from "$lib/features/tags/types/tag";

export interface TagsPort {
  list_tags(vault_id: VaultId): Promise<TagCount[]>;
  list_notes_with_tag(vault_id: VaultId, tag: string): Promise<TaggedNote[]>;
  extract_note_tags(markdown: string): Promise<string[]>;
}

export { TagsService } from "$lib/features/tags/application/tags_service";
export { register_tags_actions } from "$lib/features/tags/application/tags_actions";
export { TagsStore } from "$lib/features/tags/state/tags_store.svelte";
export { tag_key } from "$lib/features/tags/domain/tag_key";
export { create_tags_tauri_adapter } from "$lib/features/tags/adapters/tags_tauri_adapter";
export { default as TagsPanel } from "$lib/features/tags/ui/tags_panel.svelte";
export { default as NoteTagChips } from "$lib/features/tags/ui/note_tag_chips.svelte";
export { default as TagChip } from "$lib/features/tags/ui/tag_chip.svelte";
export { default as TagExcerpt } from "$lib/features/tags/ui/tag_excerpt.svelte";
export type { TagsPort } from "$lib/features/tags/ports";
export type {
  TagCount,
  TagNotePage,
  TagNoteQuery,
  TagNoteSearchResult,
  TaggedNote,
} from "$lib/features/tags/types/tag";

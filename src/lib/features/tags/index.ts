export { TagsService } from "$lib/features/tags/application/tags_service";
export { register_tags_actions } from "$lib/features/tags/application/tags_actions";
export { TagsStore } from "$lib/features/tags/state/tags_store.svelte";
export { create_tags_tauri_adapter } from "$lib/features/tags/adapters/tags_tauri_adapter";
export { default as TagsPanel } from "$lib/features/tags/ui/tags_panel.svelte";
export { default as NoteTagChips } from "$lib/features/tags/ui/note_tag_chips.svelte";
export type { TagsPort } from "$lib/features/tags/ports";
export type { TagCount, TaggedNote } from "$lib/features/tags/types/tag";

import type { TagsPort } from "$lib/features/tags/ports";
import type { TagsStore } from "$lib/features/tags/state/tags_store.svelte";
import type {
  TagCount,
  TagNoteQuery,
  TagNoteSearchResult,
} from "$lib/features/tags/types/tag";
import type { VaultStore } from "$lib/features/vault";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";

const log = create_logger("tags_service");

// The sidebar drill-down shows at most this many notes of one tag. The header
// shows the total, and the omnibar narrows a bigger tag down.
const DRILL_DOWN_LIMIT = 500;

// Each load kind has its own revision counter. A response whose revision is
// no longer current is dropped, so a vault switch or fast clicks never show
// an older answer over a newer one.
export class TagsService {
  private tags_revision = 0;
  private tagged_notes_revision = 0;
  private note_tags_revision = 0;
  private last_note_tags_path: string | null = null;
  private last_note_tags_markdown: string | null = null;

  constructor(
    private readonly tags_port: TagsPort,
    private readonly vault_store: VaultStore,
    private readonly tags_store: TagsStore,
  ) {}

  async load_tags(): Promise<void> {
    const revision = ++this.tags_revision;
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    this.tags_store.start_tags_load();
    try {
      const tags = await this.tags_port.list_tags(vault_id);
      if (revision !== this.tags_revision) return;
      this.tags_store.set_tags(tags);
    } catch (error) {
      if (revision !== this.tags_revision) return;
      const message = error_message(error);
      log.error("Failed to load tags", { error: message });
      this.tags_store.set_tags_error(message);
    }
  }

  async select_tag(tag: string): Promise<void> {
    const revision = ++this.tagged_notes_revision;
    if (!this.vault_store.vault) return;

    this.tags_store.start_tagged_notes_load(tag);
    const result = await this.search_tagged_notes({
      tags: [tag],
      match: "all",
      text: "",
      limit: DRILL_DOWN_LIMIT,
    });
    if (revision !== this.tagged_notes_revision) return;
    if (result.status === "ok") this.tags_store.set_tagged_notes(result.page);
    if (result.status === "failed") this.tags_store.set_tagged_notes_error();
  }

  // Asked on every keystroke by the omnibar and the editor's completion. A
  // failure only means no suggestions, so it returns [] after logging.
  async suggest_tags(
    partial: string,
    exclude: string[],
    limit: number,
  ): Promise<TagCount[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return [];
    try {
      return await this.tags_port.suggest_tags(
        vault_id,
        partial,
        exclude,
        limit,
      );
    } catch (error) {
      log.error("Failed to suggest tags", {
        partial,
        error: error_message(error),
      });
      return [];
    }
  }

  // No store writes and no revision here: the omnibar action that calls this
  // drops stale answers itself, and select_tag has its own guard.
  async search_tagged_notes(query: TagNoteQuery): Promise<TagNoteSearchResult> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return { status: "skipped" };
    try {
      const page = await this.tags_port.search_tagged_notes(vault_id, query);
      return { status: "ok", page };
    } catch (error) {
      const message = error_message(error);
      log.error("Failed to search tagged notes", {
        tags: query.tags,
        error: message,
      });
      return { status: "failed", error: message };
    }
  }

  clear_selected_tag() {
    this.tagged_notes_revision += 1;
    this.tags_store.clear_selected_tag();
  }

  async reload(): Promise<void> {
    const selected_tag = this.tags_store.selected_tag;
    await Promise.all([
      this.load_tags(),
      selected_tag ? this.select_tag(selected_tag) : Promise.resolve(),
    ]);
  }

  // The rail asks on every debounced edit. Skip the IPC call when nothing
  // changed since the last request, same as LinksService does for local links.
  async update_note_tags(note_path: string, markdown: string): Promise<void> {
    if (
      note_path === this.last_note_tags_path &&
      markdown === this.last_note_tags_markdown
    ) {
      return;
    }
    this.last_note_tags_path = note_path;
    this.last_note_tags_markdown = markdown;
    const revision = ++this.note_tags_revision;

    try {
      const tags = await this.tags_port.extract_note_tags(markdown);
      if (revision !== this.note_tags_revision) return;
      this.tags_store.set_note_tags(note_path, tags);
    } catch (error) {
      if (revision !== this.note_tags_revision) return;
      log.error("Failed to extract note tags", {
        error: error_message(error),
      });
      this.tags_store.set_note_tags(note_path, []);
    }
  }

  clear_note_tags() {
    this.note_tags_revision += 1;
    this.last_note_tags_path = null;
    this.last_note_tags_markdown = null;
    this.tags_store.clear_note_tags();
  }

  // Drops everything that came from the vault's index. Note tags come from
  // the editor text, so the note tags reactor owns those.
  clear() {
    this.tags_revision += 1;
    this.tagged_notes_revision += 1;
    this.tags_store.clear_vault_tags();
  }
}

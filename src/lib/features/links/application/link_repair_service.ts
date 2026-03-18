import type { NotesPort } from "$lib/features/note";
import type { SearchPort, WorkspaceIndexPort } from "$lib/features/search";
import type { EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";
import {
  as_markdown_text,
  as_note_path,
  type NotePath,
  type VaultId,
} from "$lib/shared/types/ids";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("link_repair_service");

export type LinkRepairResult = {
  scanned: number;
  rewritten: number;
  failed: string[];
};

export type LinkRepairProgress = {
  processed: number;
  total: number;
};

export class LinkRepairService {
  constructor(
    private readonly notes_port: NotesPort,
    private readonly search_port: SearchPort,
    private readonly index_port: WorkspaceIndexPort,
    private readonly editor_store: EditorStore,
    private readonly tab_store: TabStore,
    private readonly now_ms: () => number,
    private readonly close_editor_buffer: (path: NotePath) => void = () => {},
  ) {}

  private async collect_external_source_paths(
    vault_id: VaultId,
    path_map: Map<string, string>,
  ): Promise<Set<string>> {
    const external_sources = new Set<string>();

    for (const old_path of path_map.keys()) {
      try {
        const snapshot = await this.search_port.get_note_links_snapshot(
          vault_id,
          old_path,
        );
        for (const backlink of snapshot.backlinks) {
          if (!path_map.has(backlink.path)) {
            external_sources.add(backlink.path);
          }
        }
      } catch (error) {
        log.warn("Collect backlinks failed", {
          old_path,
          error: error_message(error),
        });
      }
    }

    return external_sources;
  }

  private find_matching_open_note(
    note_path: NotePath,
    old_source_path: string,
    new_source_path: string,
  ) {
    const open_note = this.editor_store.open_note;
    if (!open_note) return null;
    if (open_note.meta.id === note_path) return open_note;
    if (
      old_source_path !== new_source_path &&
      String(open_note.meta.id) === old_source_path
    ) {
      return open_note;
    }
    return null;
  }

  private async persist_open_note_rewrite(input: {
    vault_id: VaultId;
    note_path: NotePath;
    rewritten_markdown: ReturnType<typeof as_markdown_text>;
    matched_open_note: NonNullable<EditorStore["open_note"]>;
  }): Promise<void> {
    const { vault_id, note_path, rewritten_markdown, matched_open_note } =
      input;
    const repair_buffer_id = `${matched_open_note.buffer_id}:repair-links:${String(this.now_ms())}`;

    this.editor_store.set_open_note({
      ...matched_open_note,
      markdown: rewritten_markdown,
      buffer_id: repair_buffer_id,
      is_dirty: matched_open_note.is_dirty,
    });

    if (this.tab_store.is_open_note_dirty(matched_open_note)) {
      return;
    }

    await this.notes_port.write_note(vault_id, note_path, rewritten_markdown);
    await this.index_port.upsert_note(vault_id, note_path);
  }

  private async persist_closed_note_rewrite(input: {
    vault_id: VaultId;
    note_path: NotePath;
    old_source_path: string;
    new_source_path: string;
    rewritten_markdown: ReturnType<typeof as_markdown_text>;
  }): Promise<void> {
    const {
      vault_id,
      note_path,
      old_source_path,
      new_source_path,
      rewritten_markdown,
    } = input;

    await this.notes_port.write_note(vault_id, note_path, rewritten_markdown);
    await this.index_port.upsert_note(vault_id, note_path);
    this.tab_store.invalidate_cache_by_path(note_path);

    if (old_source_path !== new_source_path) {
      const old_note_path = as_note_path(old_source_path);
      this.tab_store.invalidate_cache_by_path(old_note_path);
      this.close_editor_buffer(old_note_path);
    }

    this.close_editor_buffer(note_path);
  }

  async repair_links(
    vault_id: VaultId,
    path_map: Map<string, string>,
    on_progress?: (progress: LinkRepairProgress) => void,
  ): Promise<LinkRepairResult> {
    if (path_map.size === 0) {
      return { scanned: 0, rewritten: 0, failed: [] };
    }

    const result: LinkRepairResult = {
      scanned: 0,
      rewritten: 0,
      failed: [],
    };

    const target_map = Object.fromEntries(path_map);
    on_progress?.({ processed: 0, total: path_map.size });
    const external_sources = await this.collect_external_source_paths(
      vault_id,
      path_map,
    );
    const total = external_sources.size + path_map.size;
    on_progress?.({ processed: 0, total });

    for (const source_path of external_sources) {
      result.scanned += 1;
      const rewrite_result = await this.rewrite_note_file(
        vault_id,
        as_note_path(source_path),
        source_path,
        source_path,
        target_map,
      );
      if (rewrite_result.status === "rewritten") {
        result.rewritten += 1;
      }
      if (rewrite_result.status === "failed") {
        result.failed.push(source_path);
      }
      on_progress?.({ processed: result.scanned, total });
    }

    for (const [old_path, new_path] of path_map) {
      result.scanned += 1;
      const rewrite_result = await this.rewrite_note_file(
        vault_id,
        as_note_path(new_path),
        old_path,
        new_path,
        target_map,
      );
      if (rewrite_result.status === "rewritten") {
        result.rewritten += 1;
      }
      if (rewrite_result.status === "failed") {
        result.failed.push(new_path);
      }
      on_progress?.({ processed: result.scanned, total });
    }

    return result;
  }

  private async rewrite_note_file(
    vault_id: VaultId,
    note_path: NotePath,
    old_source_path: string,
    new_source_path: string,
    target_map: Record<string, string>,
  ): Promise<{ status: "unchanged" | "rewritten" | "failed" }> {
    try {
      const matched_open_note = this.find_matching_open_note(
        note_path,
        old_source_path,
        new_source_path,
      );

      const markdown = matched_open_note
        ? matched_open_note.markdown
        : (await this.notes_port.read_note(vault_id, note_path)).markdown;

      const result = await this.search_port.rewrite_note_links(
        markdown,
        old_source_path,
        new_source_path,
        target_map,
      );

      if (!result.changed) {
        return { status: "unchanged" };
      }

      const rewritten = as_markdown_text(result.markdown);

      if (matched_open_note) {
        await this.persist_open_note_rewrite({
          vault_id,
          note_path,
          rewritten_markdown: rewritten,
          matched_open_note,
        });
        return { status: "rewritten" };
      }

      await this.persist_closed_note_rewrite({
        vault_id,
        note_path,
        old_source_path,
        new_source_path,
        rewritten_markdown: rewritten,
      });
      return { status: "rewritten" };
    } catch (error) {
      log.warn("Rewrite links failed", {
        note_path,
        old_source_path,
        new_source_path,
        error: error_message(error),
      });
      return { status: "failed" };
    }
  }
}

import type {
  NotesPort,
  MarkdownCleanupBackupInfo,
} from "$lib/features/note/ports";
import type { WorkspaceIndexPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab";
import type { EditorService, EditorStore } from "$lib/features/editor";
import type { NotesStore } from "$lib/features/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import {
  clean_legacy_markdown,
  map_legacy_cleanup_position,
  type LegacyMarkdownCleanupOptions,
} from "$lib/features/note/domain/legacy_markdown_cleanup";

export type LegacyCleanupPreviewNote = {
  note_id: string;
  title: string;
  line_count_before: number;
  line_count_after: number;
  blank_lines_removed: number;
  list_separators_removed: number;
  standalone_breaks_removed: number;
  before_example: string;
  after_example: string;
  before_markdown: string;
  after_markdown: string;
};

export type LegacyCleanupPreview = {
  id: string;
  scanned_count: number;
  skipped_open_count: number;
  changed_count: number;
  notes: LegacyCleanupPreviewNote[];
  backup: MarkdownCleanupBackupInfo | null;
  options: LegacyMarkdownCleanupOptions;
};

type PreviewSnapshot = {
  vault_id: string;
  preview: LegacyCleanupPreview;
  changes: Array<{
    note_id: NoteId;
    expected_mtime_ms: number;
    original_markdown: string;
    cleaned_markdown: string;
    line_map: number[];
  }>;
};

function first_diff_example(before: string, after: string) {
  const before_lines = before.split(/\r\n|\r|\n/);
  const after_lines = after.split(/\r\n|\r|\n/);
  let index = 0;
  while (
    index < before_lines.length &&
    index < after_lines.length &&
    before_lines[index] === after_lines[index]
  )
    index += 1;
  return {
    before: before_lines.slice(Math.max(0, index - 1), index + 3).join("\n"),
    after: after_lines.slice(Math.max(0, index - 1), index + 3).join("\n"),
  };
}

export class LegacyMarkdownCleanupService {
  private preview_snapshot: PreviewSnapshot | null = null;

  constructor(
    private readonly notes_port: NotesPort,
    private readonly index_port: WorkspaceIndexPort,
    private readonly vault_store: VaultStore,
    private readonly tab_store: TabStore,
    private readonly editor_store: EditorStore,
    private readonly editor_service: EditorService,
    private readonly notes_store: NotesStore,
    private readonly now_ms: () => number = Date.now,
    private readonly suppress_file_write: (path: string) => void = () => {},
    private readonly reload_active_note: (
      path: string,
    ) => Promise<void> = async () => {},
  ) {}

  async preview(
    options: LegacyMarkdownCleanupOptions = { compact_simple_lists: true },
  ): Promise<LegacyCleanupPreview> {
    const vault = this.vault_store.vault;
    if (!vault) throw new Error("Open a vault before cleaning Markdown.");
    this.editor_service.flush();
    const all_notes = await this.notes_port.list_notes(vault.id);
    this.assert_vault(vault.id);
    const dirty_paths = this.dirty_open_paths();
    const candidates = all_notes.filter(
      (note) => !dirty_paths.has(note.path.toLowerCase()),
    );
    const skipped_open_count = all_notes.length - candidates.length;
    const changes: PreviewSnapshot["changes"] = [];
    const preview_notes: LegacyCleanupPreviewNote[] = [];
    for (const meta of candidates) {
      const doc = await this.notes_port.read_note(vault.id, meta.id);
      this.assert_vault(vault.id);
      const cleaned = clean_legacy_markdown(doc.markdown, options);
      if (cleaned.markdown === doc.markdown) continue;
      const example = first_diff_example(doc.markdown, cleaned.markdown);
      const line_count_before = doc.markdown.split(/\r\n|\r|\n/).length;
      const line_count_after = cleaned.markdown.split(/\r\n|\r|\n/).length;
      changes.push({
        note_id: meta.id,
        expected_mtime_ms: meta.mtime_ms,
        original_markdown: doc.markdown,
        cleaned_markdown: cleaned.markdown,
        line_map: cleaned.line_map,
      });
      preview_notes.push({
        note_id: meta.id,
        title: meta.title,
        line_count_before,
        line_count_after,
        ...cleaned.counts,
        before_example: example.before,
        after_example: example.after,
        before_markdown: doc.markdown,
        after_markdown: cleaned.markdown,
      });
    }
    const backup = await this.notes_port.get_latest_markdown_cleanup_backup(
      vault.id,
    );
    this.assert_vault(vault.id);
    const preview: LegacyCleanupPreview = {
      id: `${vault.id}:${String(this.now_ms())}`,
      scanned_count: all_notes.length,
      skipped_open_count,
      changed_count: changes.length,
      notes: preview_notes,
      backup,
      options: { ...options },
    };
    this.preview_snapshot = { vault_id: vault.id, preview, changes };
    return preview;
  }

  async apply(preview_id: string) {
    const snapshot = this.require_snapshot(preview_id);
    const vault = this.vault_store.vault;
    if (!vault || vault.id !== snapshot.vault_id)
      throw new Error("The active vault changed. Preview cleanup again.");
    this.editor_service.flush();
    const dirty_paths = this.dirty_open_paths();
    const changes = snapshot.changes.filter(
      (change) => !dirty_paths.has(change.note_id.toLowerCase()),
    );
    if (changes.length !== snapshot.changes.length)
      throw new Error("A note in this preview is now unsaved. Preview again.");
    for (const change of changes) this.suppress_file_write(change.note_id);
    const result = await this.notes_port.apply_markdown_cleanup(
      vault.id,
      changes.map(({ line_map: _line_map, ...change }) => change),
    );
    this.assert_vault(vault.id);
    for (const change of changes) {
      try {
        await this.index_port.upsert_note(vault.id, change.note_id);
      } catch {
        // The note changes are backed up; a later vault index sync can repair search.
      }
      this.assert_vault(vault.id);
    }
    await this.refresh_open_notes(
      result.updated_notes.flatMap((meta) => {
        const change = changes.find((entry) => entry.note_id === meta.id);
        return change ? [[meta, change] as const] : [];
      }),
    );
    this.preview_snapshot = null;
    return result;
  }

  async restore_latest() {
    const vault = this.vault_store.vault;
    if (!vault) throw new Error("Open a vault before restoring cleanup.");
    this.editor_service.flush();
    const dirty_paths = this.dirty_open_paths();
    const notes_to_restore = await this.notes_port.list_notes(vault.id);
    this.assert_vault(vault.id);
    for (const note of notes_to_restore) this.suppress_file_write(note.path);
    const result = await this.notes_port.restore_latest_markdown_cleanup(
      vault.id,
      [...dirty_paths] as NoteId[],
    );
    this.assert_vault(vault.id);
    if (!result) return null;
    for (const note of result.restored_notes) {
      this.suppress_file_write(note.path);
      try {
        await this.index_port.upsert_note(vault.id, note.id);
      } catch {
        // A later index sync can repair search without risking the restored note.
      }
      this.assert_vault(vault.id);
    }
    const refreshed = await Promise.all(
      result.restored_notes.map(
        async (meta) =>
          [meta, await this.notes_port.read_note(vault.id, meta.id)] as const,
      ),
    );
    this.assert_vault(vault.id);
    await this.refresh_open_notes(
      refreshed.map(
        ([meta, doc]) =>
          [
            meta,
            {
              note_id: meta.id,
              expected_mtime_ms: meta.mtime_ms,
              original_markdown: doc.markdown,
              cleaned_markdown: doc.markdown,
              line_map: [],
            },
          ] as const,
      ),
    );
    return result;
  }

  cancel_preview(preview_id?: string) {
    if (!preview_id || this.preview_snapshot?.preview.id === preview_id)
      this.preview_snapshot = null;
  }

  private require_snapshot(preview_id: string): PreviewSnapshot {
    const snapshot = this.preview_snapshot;
    if (!snapshot || snapshot.preview.id !== preview_id)
      throw new Error("This preview expired. Preview cleanup again.");
    return snapshot;
  }

  private dirty_open_paths() {
    const dirty = new Set(
      this.tab_store.get_dirty_tabs().map((tab) => tab.note_path.toLowerCase()),
    );
    const open_note = this.editor_store.open_note;
    if (open_note && this.editor_service.is_dirty())
      dirty.add(open_note.meta.path.toLowerCase());
    return dirty;
  }

  private assert_vault(vault_id: string) {
    if (this.vault_store.vault?.id !== vault_id)
      throw new Error(
        "The active vault changed during cleanup. No further notes were updated.",
      );
  }

  private async refresh_open_notes(
    refreshed: ReadonlyArray<
      readonly [NoteMeta, PreviewSnapshot["changes"][number]]
    >,
  ) {
    const vault = this.vault_store.vault;
    if (!vault) return;
    const vault_id = vault.id;
    const reload_paths: NotePath[] = [];
    for (const [meta, change] of refreshed) {
      if (this.vault_store.vault?.id !== vault_id) return;
      const path: NotePath = meta.path;
      const tab = this.tab_store.find_tab_by_path(path);
      if (!tab) continue;
      const cached = this.tab_store.get_cached_note(tab.id);
      if (cached?.is_dirty || tab.is_dirty) continue;
      const doc = await this.notes_port.read_note(vault_id, meta.id);
      this.assert_vault(vault_id);
      const live_tab = this.tab_store.find_tab_by_path(path);
      const latest_cache = live_tab
        ? this.tab_store.get_cached_note(live_tab.id)
        : null;
      const active_note_now = this.editor_store.open_note;
      if (
        !live_tab ||
        latest_cache?.is_dirty ||
        live_tab.is_dirty ||
        (active_note_now?.meta.path.toLowerCase() === path.toLowerCase() &&
          this.editor_service.is_dirty())
      )
        continue;
      const active_note =
        active_note_now?.meta.path.toLowerCase() === path.toLowerCase()
          ? active_note_now
          : null;
      const next_note = {
        ...(latest_cache ??
          active_note ?? {
            buffer_id: `${path}:cleanup`,
            is_dirty: false,
          }),
        meta: doc.meta,
        markdown: doc.markdown,
        is_dirty: false,
      };
      this.tab_store.set_cached_note(live_tab.id, next_note);
      this.notes_store.set_notes(
        this.notes_store.notes.map((note) =>
          note.id === meta.id ? doc.meta : note,
        ),
      );
      if (active_note) {
        const cursor = this.tab_store.get_snapshot(live_tab.id)?.cursor;
        if (cursor && change.line_map.length > 0) {
          const from_source = change.original_markdown;
          const to_source = change.cleaned_markdown;
          const normalized = to_source.replace(/\r\n|\r/g, "\n");
          const output_lines = normalized.split("\n");
          if (cursor.offset_kind === "markdown") {
            const anchor = map_legacy_cleanup_position(
              from_source,
              to_source,
              change.line_map,
              cursor.anchor ?? cursor.head ?? 0,
            );
            const head = map_legacy_cleanup_position(
              from_source,
              to_source,
              change.line_map,
              cursor.head ?? anchor,
            );
            const before_head = normalized.slice(0, head);
            const line = before_head.split("\n").length;
            const column = head - before_head.lastIndexOf("\n");
            this.tab_store.patch_snapshot(live_tab.id, {
              cursor: { ...cursor, anchor, head, line, column },
            });
          } else {
            const output_line = Math.min(
              output_lines.length - 1,
              change.line_map[Math.max(0, cursor.line - 1)] ?? cursor.line - 1,
            );
            const { anchor: _anchor, head: _head, ...line_cursor } = cursor;
            this.tab_store.patch_snapshot(live_tab.id, {
              cursor: {
                ...line_cursor,
                line: output_line + 1,
                column: Math.min(
                  cursor.column,
                  (output_lines[output_line] ?? "").length + 1,
                ),
                total_lines: output_lines.length,
              },
            });
          }
        }
        reload_paths.push(path);
      } else {
        this.editor_service.close_buffer(path);
      }
    }
    for (const path of reload_paths) {
      this.assert_vault(vault_id);
      if (
        this.editor_store.open_note?.meta.path.toLowerCase() !==
        path.toLowerCase()
      ) {
        this.editor_service.close_buffer(path);
        continue;
      }
      await this.reload_active_note(path);
      this.assert_vault(vault_id);
    }
  }
}

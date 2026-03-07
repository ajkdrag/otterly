import type { NotesPort } from "$lib/features/note/ports";
import type { WorkspaceIndexPort } from "$lib/features/search";
import {
  as_markdown_text,
  as_note_path,
  type MarkdownText,
  type NotePath,
  type AssetPath,
  type NoteId,
  type VaultId,
} from "$lib/shared/types/ids";
import type { NoteDoc, NoteMeta } from "$lib/shared/types/note";
import type { VaultStore } from "$lib/features/vault";
import type { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { EditorStore } from "$lib/features/editor";
import type { OpStore } from "$lib/app";
import type { AssetsPort } from "$lib/features/note/ports";
import type {
  NoteDeleteResult,
  NoteOpenResult,
  NoteRenameResult,
  NoteSaveResult,
} from "$lib/features/note/types/note_service_result";
import { error_message } from "$lib/shared/utils/error_message";
import { create_untitled_open_note } from "$lib/features/note/domain/ensure_open_note";
import { parent_folder_path } from "$lib/shared/utils/path";
import { resolve_existing_note_path } from "$lib/features/note/domain/note_lookup";
import { note_path_exists } from "$lib/features/note/domain/note_path_exists";
import {
  run_link_repair_operation,
  type LinkRepairService,
} from "$lib/features/links";
import type { EditorService } from "$lib/features/editor";
import {
  to_open_note_state,
  type PastedImagePayload,
} from "$lib/shared/types/editor";
import { create_write_queue } from "$lib/shared/utils/write_queue";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("note_service");

type OpenNoteOptions = {
  cleanup_if_missing?: boolean;
  force_reload?: boolean;
};

type OpenEditorNote = NonNullable<EditorStore["open_note"]>;

type SavePlan =
  | { kind: "save_existing"; open_note: OpenEditorNote }
  | {
      kind: "save_untitled";
      open_note: OpenEditorNote;
      target_path: NotePath;
      overwrite: boolean;
    };

type SavePlanDecision =
  | { status: "skipped" }
  | { status: "conflict" }
  | { status: "ready"; plan: SavePlan };

export class NoteService {
  private readonly enqueue_write = create_write_queue();
  private open_abort: AbortController | null = null;
  private active_save_count = 0;
  private pending_save_error: string | null = null;

  constructor(
    private readonly notes_port: NotesPort,
    private readonly index_port: WorkspaceIndexPort,
    private readonly assets_port: AssetsPort,
    private readonly vault_store: VaultStore,
    private readonly notes_store: NotesStore,
    private readonly editor_store: EditorStore,
    private readonly op_store: OpStore,
    private readonly editor_service: EditorService,
    private readonly now_ms: () => number,
    private readonly link_repair: LinkRepairService | null = null,
    private readonly on_file_written?: (path: string) => void,
  ) {}

  clear_open_note() {
    this.editor_store.clear_open_note();
  }

  skip_mtime_guard(note_id: NoteId) {
    this.editor_store.update_mtime(note_id, 0);
  }

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private start_operation(operation_key: string): void {
    this.op_store.start(operation_key, this.now_ms());
  }

  private succeed_operation(operation_key: string): void {
    this.op_store.succeed(operation_key);
  }

  private fail_operation(
    operation_key: string,
    log_label: string,
    error: unknown,
  ): string {
    const message = error_message(error);
    log.error(log_label, { error: message });
    this.op_store.fail(operation_key, message);
    return message;
  }

  private async run_link_repair(
    vault_id: VaultId,
    path_map: Map<string, string>,
  ): Promise<void> {
    await run_link_repair_operation({
      link_repair: this.link_repair,
      vault_id,
      path_map,
      on_start: (message) => {
        this.start_operation("links.repair");
        this.op_store.set_pending_message("links.repair", message);
      },
      on_progress: (message) => {
        this.op_store.set_pending_message("links.repair", message);
      },
      on_success: (message) => {
        this.op_store.succeed("links.repair", message);
      },
      on_failed: (message) => {
        this.op_store.fail("links.repair", message);
      },
      on_error: (error) =>
        this.fail_operation("links.repair", "Link repair failed", error),
    });
  }

  private async read_or_create_note(
    vault_id: VaultId,
    path: NotePath,
  ): Promise<NoteDoc> {
    try {
      return await this.notes_port.read_note(vault_id, path);
    } catch (read_error) {
      if (!this.is_not_found_error(read_error)) {
        throw read_error;
      }

      try {
        const meta = await this.notes_port.create_note(
          vault_id,
          path,
          as_markdown_text(""),
        );
        await this.index_port.upsert_note(vault_id, meta.id);
        return { meta, markdown: as_markdown_text("") };
      } catch (create_error) {
        if (error_message(create_error).includes("note already exists")) {
          return await this.notes_port.read_note(vault_id, path);
        }
        throw create_error;
      }
    }
  }

  create_new_note(open_names: string[]) {
    const open_note = create_untitled_open_note({
      open_names,
      now_ms: this.now_ms(),
    });

    this.editor_store.set_open_note(open_note);
  }

  async open_note(
    note_path: string,
    create_if_missing: boolean = false,
    options?: OpenNoteOptions,
  ): Promise<NoteOpenResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    this.open_abort?.abort();
    const controller = new AbortController();
    this.open_abort = controller;

    const op_key = `note.open:${note_path}`;
    this.start_operation(op_key);
    let resolved_path: NotePath | null = null;

    try {
      resolved_path = this.resolve_open_note_path(note_path, create_if_missing);

      if (this.should_keep_current_open_note(resolved_path, options)) {
        this.add_open_note_to_recent();
        this.succeed_operation(op_key);
        return this.open_note_result(resolved_path);
      }

      const doc = await this.read_note_for_open(
        vault_id,
        resolved_path,
        create_if_missing,
      );

      if (controller.signal.aborted) {
        return { status: "skipped" };
      }

      this.apply_opened_note(doc, options);
      if (options?.force_reload) {
        await this.index_port.upsert_note(vault_id, resolved_path);
      }
      this.succeed_operation(op_key);
      return this.open_note_result(resolved_path);
    } catch (error) {
      if (controller.signal.aborted) {
        return { status: "skipped" };
      }
      if (
        options?.cleanup_if_missing &&
        !create_if_missing &&
        resolved_path &&
        this.is_not_found_error(error)
      ) {
        await this.cleanup_missing_open_note(vault_id, resolved_path);
        this.succeed_operation(op_key);
        return { status: "not_found" };
      }

      const message = this.fail_operation(op_key, "Open note failed", error);
      return { status: "failed", error: message };
    }
  }

  async open_wiki_link(note_path: string): Promise<NoteOpenResult> {
    return this.open_note(note_path, true);
  }

  async save_pasted_image(
    note_path: NotePath,
    image: PastedImagePayload,
    options?: { custom_filename?: string; attachment_folder?: string },
  ): Promise<
    | { status: "saved"; asset_path: AssetPath }
    | { status: "skipped" }
    | { status: "failed"; error: string }
  > {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    this.start_operation("asset.write");

    try {
      const input: Parameters<AssetsPort["write_image_asset"]>[1] = {
        note_path,
        image,
      };
      if (options?.custom_filename) {
        input.custom_filename = options.custom_filename;
      }
      if (options?.attachment_folder) {
        input.attachment_folder = options.attachment_folder;
      }
      const asset_path = await this.assets_port.write_image_asset(
        vault_id,
        input,
      );
      this.succeed_operation("asset.write");
      return {
        status: "saved",
        asset_path,
      };
    } catch (error) {
      const message = this.fail_operation(
        "asset.write",
        "Write image asset failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async delete_note(note: NoteMeta): Promise<NoteDeleteResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    this.start_operation("note.delete");

    try {
      await this.notes_port.delete_note(vault_id, note.id);
      await this.index_port.remove_note(vault_id, note.id);

      const is_open_note = this.editor_store.open_note?.meta.id === note.id;
      this.notes_store.remove_note(note.id);
      this.notes_store.remove_recent_note(note.id);

      if (is_open_note) {
        this.editor_store.clear_open_note();
      }

      this.succeed_operation("note.delete");
      return { status: "deleted" };
    } catch (error) {
      const message = this.fail_operation(
        "note.delete",
        "Delete note failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async rename_note(
    note: NoteMeta,
    new_path: NotePath,
    overwrite: boolean,
  ): Promise<NoteRenameResult> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      return { status: "skipped" };
    }

    const target_exists = note_path_exists(
      this.notes_store.notes,
      new_path,
      note.path,
    );
    if (target_exists && !overwrite) {
      return { status: "conflict" };
    }

    this.start_operation("note.rename");

    try {
      await this.rename_note_with_overwrite_if_needed(
        vault_id,
        note.path,
        new_path,
        overwrite,
      );
      await this.index_port.rename_note_path(vault_id, note.id, new_path);

      const path_map = new Map([[note.id as string, new_path as string]]);
      await this.run_link_repair(vault_id, path_map);

      this.notes_store.rename_note(note.path, new_path);
      const updated_note = this.notes_store.notes.find(
        (entry) => entry.id === new_path,
      );
      if (updated_note) {
        this.notes_store.rename_recent_note(note.id, updated_note);
      } else {
        this.notes_store.remove_recent_note(note.id);
      }

      if (this.editor_store.open_note?.meta.id === note.id) {
        this.editor_store.update_open_note_path(new_path);
      }

      this.succeed_operation("note.rename");
      return { status: "renamed" };
    } catch (error) {
      if (this.is_note_exists_error(error)) {
        return { status: "conflict" };
      }
      const message = this.fail_operation(
        "note.rename",
        "Rename note failed",
        error,
      );
      return {
        status: "failed",
        error: message,
      };
    }
  }

  async save_note(
    target_path: NotePath | null,
    overwrite: boolean,
  ): Promise<NoteSaveResult> {
    const save_context = this.resolve_save_context();
    if (!save_context) {
      return { status: "skipped" };
    }

    const plan_decision = this.resolve_save_plan(
      save_context.open_note,
      target_path,
      overwrite,
    );
    if (plan_decision.status === "skipped") {
      return { status: "skipped" };
    }
    if (plan_decision.status === "conflict") {
      return { status: "conflict" };
    }

    this.begin_save_operation();

    try {
      await this.run_save_plan(save_context.vault_id, plan_decision.plan);

      this.editor_service.mark_clean();
      this.finish_save_operation(null);

      const saved_path = this.resolve_saved_path(plan_decision.plan.open_note);
      return {
        status: "saved",
        saved_path,
      };
    } catch (error) {
      if (this.is_mtime_conflict_error(error)) {
        this.finish_save_operation(null);
        return { status: "conflict" };
      }
      if (
        plan_decision.plan.kind === "save_untitled" &&
        this.is_note_exists_error(error)
      ) {
        this.finish_save_operation(null);
        return { status: "conflict" };
      }
      const message = error_message(error);
      log.error("Save note failed", { error: message });
      this.finish_save_operation(message);
      return {
        status: "failed",
        error: message,
      };
    }
  }

  private resolve_open_note_path(
    note_path: string,
    create_if_missing: boolean,
  ): NotePath {
    const resolved_existing = create_if_missing
      ? resolve_existing_note_path(this.notes_store.notes, note_path)
      : null;
    return as_note_path(resolved_existing ?? note_path);
  }

  private should_keep_current_open_note(
    resolved_path: NotePath,
    options?: OpenNoteOptions,
  ): boolean {
    if (options?.force_reload) {
      return false;
    }
    const current_open_id = this.editor_store.open_note?.meta.id;
    return current_open_id === resolved_path;
  }

  private add_open_note_to_recent() {
    const open_meta = this.editor_store.open_note?.meta;
    if (!open_meta || !open_meta.path.endsWith(".md")) {
      return;
    }
    this.notes_store.add_recent_note(open_meta);
  }

  private async read_note_for_open(
    vault_id: VaultId,
    resolved_path: NotePath,
    create_if_missing: boolean,
  ): Promise<NoteDoc> {
    if (create_if_missing) {
      return await this.read_or_create_note(vault_id, resolved_path);
    }
    return await this.notes_port.read_note(vault_id, resolved_path);
  }

  private apply_opened_note(doc: NoteDoc, options?: OpenNoteOptions) {
    this.notes_store.add_note(doc.meta);
    if (doc.meta.path.endsWith(".md")) {
      this.notes_store.add_recent_note(doc.meta);
    }

    const forced_buffer_id = options?.force_reload
      ? `${doc.meta.id}:reload:${String(this.now_ms())}`
      : undefined;
    this.editor_store.set_open_note(
      to_open_note_state(
        doc,
        forced_buffer_id ? { buffer_id: forced_buffer_id } : undefined,
      ),
    );
  }

  private open_note_result(resolved_path: NotePath): NoteOpenResult {
    return {
      status: "opened",
      selected_folder_path: parent_folder_path(resolved_path),
    };
  }

  private async cleanup_missing_open_note(
    vault_id: VaultId,
    note_path: NotePath,
  ) {
    await this.index_port
      .remove_note(vault_id, note_path)
      .catch((error: unknown) => {
        log.error("Stale index cleanup failed", {
          path: String(note_path),
          error,
        });
      });
    this.notes_store.remove_note(note_path);
    this.notes_store.remove_recent_note(note_path);
  }

  private resolve_save_context(): {
    vault_id: VaultId;
    open_note: OpenEditorNote;
  } | null {
    const vault_id = this.get_active_vault_id();
    const open_note = this.editor_store.open_note;
    if (!vault_id || !open_note) {
      return null;
    }

    this.sync_flushed_markdown(open_note.meta.id);
    const latest_open_note = this.editor_store.open_note;
    if (!latest_open_note) {
      return null;
    }
    return { vault_id, open_note: latest_open_note };
  }

  private sync_flushed_markdown(note_id: NotePath) {
    const flushed = this.editor_service.flush();
    if (!flushed || flushed.note_id !== note_id) {
      return;
    }
    this.editor_store.set_markdown(flushed.note_id, flushed.markdown);
  }

  private resolve_save_plan(
    open_note: OpenEditorNote,
    target_path: NotePath | null,
    overwrite: boolean,
  ): SavePlanDecision {
    const is_untitled = !open_note.meta.path.endsWith(".md");
    if (!is_untitled) {
      return {
        status: "ready",
        plan: {
          kind: "save_existing",
          open_note,
        },
      };
    }

    if (!target_path) {
      return { status: "skipped" };
    }

    const target_exists = note_path_exists(this.notes_store.notes, target_path);
    if (target_exists && !overwrite) {
      return { status: "conflict" };
    }

    return {
      status: "ready",
      plan: {
        kind: "save_untitled",
        open_note,
        target_path,
        overwrite,
      },
    };
  }

  private async run_save_plan(vault_id: VaultId, plan: SavePlan) {
    await this.enqueue_write(
      `note.save:${plan.open_note.meta.id}`,
      async () => {
        if (plan.kind === "save_untitled") {
          await this.save_untitled_note(
            vault_id,
            plan.open_note,
            plan.target_path,
            plan.overwrite,
          );
          return;
        }
        await this.write_existing_note(vault_id, plan.open_note);
      },
    );
  }

  private async write_existing_note(
    vault_id: VaultId,
    open_note: OpenEditorNote,
  ) {
    this.on_file_written?.(open_note.meta.id);
    const new_mtime = await this.notes_port.write_note(
      vault_id,
      open_note.meta.id,
      open_note.markdown,
      open_note.meta.mtime_ms || undefined,
    );
    await this.index_port.upsert_note(vault_id, open_note.meta.id);
    this.editor_store.mark_clean(open_note.meta.id, new_mtime);
  }

  private resolve_saved_path(fallback_note: OpenEditorNote): NotePath {
    return as_note_path(
      this.editor_store.open_note?.meta.path ?? fallback_note.meta.path,
    );
  }

  reset_save_operation() {
    this.active_save_count = 0;
    this.pending_save_error = null;
    this.op_store.reset("note.save");
  }

  reset_asset_write_operation() {
    this.op_store.reset("asset.write");
  }

  reset_delete_operation() {
    this.op_store.reset("note.delete");
  }

  reset_rename_operation() {
    this.op_store.reset("note.rename");
  }

  private begin_save_operation() {
    if (this.active_save_count === 0) {
      this.pending_save_error = null;
      this.start_operation("note.save");
    }
    this.active_save_count += 1;
  }

  private finish_save_operation(error: string | null) {
    if (error) {
      this.pending_save_error = error;
    }

    this.active_save_count = Math.max(0, this.active_save_count - 1);
    if (this.active_save_count > 0) {
      return;
    }

    const final_error = this.pending_save_error;
    this.pending_save_error = null;
    if (final_error) {
      this.op_store.fail("note.save", final_error);
      return;
    }
    this.succeed_operation("note.save");
  }

  private async save_untitled_note(
    vault_id: VaultId,
    open_note: NonNullable<EditorStore["open_note"]>,
    target_path: NotePath,
    overwrite: boolean,
  ) {
    const old_path = open_note.meta.path;

    try {
      this.on_file_written?.(target_path);
      const created_meta = await this.notes_port.create_note(
        vault_id,
        target_path,
        open_note.markdown,
      );
      await this.index_port.upsert_note(vault_id, created_meta.id);
      this.notes_store.add_note(created_meta);
      this.editor_service.rename_buffer(old_path, target_path);
      this.editor_store.update_open_note_path(target_path);
      this.editor_store.mark_clean(target_path, created_meta.mtime_ms);
      this.notes_store.add_recent_note(created_meta);
      return;
    } catch (error) {
      if (!this.is_note_exists_error(error)) {
        throw error;
      }
      if (!overwrite) {
        throw error;
      }
    }

    this.on_file_written?.(target_path);
    const new_mtime = await this.notes_port.write_note(
      vault_id,
      target_path,
      open_note.markdown,
    );
    await this.index_port.upsert_note(vault_id, target_path);
    const written = await this.notes_port.read_note(vault_id, target_path);
    this.notes_store.add_note(written.meta);
    this.editor_service.rename_buffer(old_path, target_path);
    this.editor_store.update_open_note_path(target_path);
    this.editor_store.mark_clean(target_path, new_mtime);
    this.notes_store.add_recent_note(written.meta);
  }

  async write_note_content(note_path: NotePath, markdown: MarkdownText) {
    const vault = this.vault_store.vault;
    if (!vault) return;
    await this.notes_port.write_note(vault.id, note_path, markdown);
  }

  private async rename_note_with_overwrite_if_needed(
    vault_id: VaultId,
    from_path: NotePath,
    to_path: NotePath,
    overwrite: boolean,
  ) {
    try {
      await this.notes_port.rename_note(vault_id, from_path, to_path);
      return;
    } catch (error) {
      if (!overwrite || !this.is_note_exists_error(error)) {
        throw error;
      }
    }

    if (
      this.editor_store.open_note?.meta.id === to_path &&
      this.editor_store.open_note.meta.id !== from_path
    ) {
      throw new Error("cannot overwrite note that is currently open");
    }

    await this.notes_port.delete_note(vault_id, to_path);
    await this.index_port.remove_note(vault_id, to_path);
    this.notes_store.remove_note(to_path);
    this.notes_store.remove_recent_note(to_path);
    await this.notes_port.rename_note(vault_id, from_path, to_path);
  }

  private is_not_found_error(error: unknown): boolean {
    if (error instanceof Error && error.name === "NotFoundError") return true;
    const message = error_message(error).toLowerCase();
    return (
      message.includes("not found") ||
      message.includes("no such file") ||
      message.includes("could not be found")
    );
  }

  private is_mtime_conflict_error(error: unknown): boolean {
    return error_message(error).startsWith("conflict:");
  }

  private is_note_exists_error(error: unknown): boolean {
    const message = error_message(error).toLowerCase();
    return (
      message.includes("note already exists") ||
      message.includes("already exists") ||
      message.includes("destination already exists")
    );
  }
}

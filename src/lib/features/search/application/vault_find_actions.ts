import { toast } from "svelte-sonner";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  build_vault_find_request,
  vault_find_request_key,
} from "$lib/features/search/domain/vault_find_request";
import {
  first_match_after_file,
  next_match_after_replace,
} from "$lib/features/search/domain/next_match_after_replace";
import { build_replacement_preview } from "$lib/features/search/domain/replacement_preview";
import type {
  VaultFindFile,
  VaultFindRequest,
  VaultReplaceFile,
} from "$lib/features/search/types/vault_find";
import { as_note_path } from "$lib/shared/types/ids";
import {
  is_markdown_path,
  paths_equal_ignore_case,
} from "$lib/shared/utils/path";
import { plural } from "$lib/shared/utils/plural";

type OpenMatchInput = {
  path: string;
  // The match ordinal, recorded as the selection.
  index: number;
  line: number;
  column: number;
  length: number;
};

type ReplaceScope = "match" | "file" | "all";

// Everything a replace writes, fixed when the user asked for it. The omnibar
// keeps searching while a dialog is open, so a replace must not read the
// results again later. Content hashes still catch files that changed on disk.
type ReplacePlan = {
  request: VaultFindRequest;
  replacement: string;
  targets: VaultReplaceFile[];
};

export function register_vault_find_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const results = stores.search.vault_find;
  // The plan behind the open Replace All dialog. Too big for UIStore: it
  // holds every file and match ordinal, and UIStore wraps its state in proxies.
  let replace_all_plan: ReplacePlan | null = null;
  // One replace at a time, whatever triggers it (Enter, a click, the dialog).
  // A second one would send the same ordinals and content hash as the first,
  // and the first write has already made them stale. The op store cannot
  // guard this: it only starts after the git checkpoint.
  let replace_running = false;

  function current_request() {
    return build_vault_find_request(
      stores.ui.vault_find,
      stores.ui.omnibar.tags,
    );
  }

  // Lowercased, since the tab store compares paths ignoring case.
  function unsaved_paths(): Set<string> {
    const paths = new Set(
      stores.tab.get_dirty_tabs().map((tab) => tab.note_path.toLowerCase()),
    );
    const open_note = stores.editor.open_note;
    if (open_note && services.editor.is_dirty()) {
      paths.add(open_note.meta.path.toLowerCase());
    }
    return paths;
  }

  function find_file(path: string): VaultFindFile | undefined {
    return results.files.find((file) => file.path === path);
  }

  function replace_target(
    file: VaultFindFile,
    match_indexes = file.matches.map((match) => match.index),
  ): VaultReplaceFile {
    return { path: file.path, content_hash: file.content_hash, match_indexes };
  }

  function close_replace_dialog() {
    stores.ui.vault_replace_dialog = {
      ...stores.ui.vault_replace_dialog,
      open: false,
      is_replacing: false,
    };
  }

  // What a row-level replace does: the shown results, the live replacement.
  function plan_from_results(targets: VaultReplaceFile[]): ReplacePlan | null {
    const request = results.request;
    if (!request) return null;
    return { request, replacement: stores.ui.vault_find.replacement, targets };
  }

  // Replace in File and Replace All overwrite saved work, so a git vault gets
  // a checkpoint first (the undo). A single match skips it, or every click
  // would add a commit. Returns false when there is no checkpoint, after
  // telling the user: no checkpoint, no write.
  async function create_undo_checkpoint(request: VaultFindRequest) {
    if (!stores.git.enabled) return true;
    const checkpoint = await services.git.create_checkpoint(
      `replace "${request.text}"`,
    );
    if (checkpoint.status === "created" || checkpoint.status === "skipped") {
      return true;
    }
    const reason =
      checkpoint.status === "failed" ? checkpoint.error : "no repository";
    toast.error(`Nothing replaced: git checkpoint failed (${reason})`);
    return false;
  }

  // Vault replace writes to disk, not into editor buffers. Files with unsaved
  // edits are skipped, so we never write over them or behind their buffer.
  // Returns true when it wrote something, and false at once when another
  // replace is still running.
  async function run_replace(
    plan: ReplacePlan,
    scope: ReplaceScope,
  ): Promise<boolean> {
    if (replace_running) return false;
    replace_running = true;
    try {
      const { request, replacement, targets } = plan;
      if (targets.length === 0) return false;
      if (scope !== "match" && !(await create_undo_checkpoint(request))) {
        return false;
      }

      services.editor.flush();
      const unsaved = unsaved_paths();
      const files = targets.filter(
        (file) => !unsaved.has(file.path.toLowerCase()),
      );
      const unsaved_count = targets.length - files.length;
      services.vault_find.cancel();
      if (files.length === 0) {
        toast.info("Nothing replaced: save your changes first");
        return false;
      }

      const result = await services.vault_find.replace({
        text: request.text,
        regex: request.regex,
        case_sensitive: request.case_sensitive,
        whole_word: request.whole_word,
        replacement,
        files,
      });
      if (result.status === "skipped") return false;
      if (result.status === "failed") {
        toast.error(`Replace failed: ${result.error}`);
        return false;
      }

      const written = result.response.replaced.filter((file) => file.count > 0);
      await refresh_written_notes(written.map((file) => file.path));
      // Rust re-indexed the written notes before it answered, so the link
      // panels of the open note can load the new links now.
      const active_path = stores.editor.open_note?.meta.path;
      if (active_path && written.some((file) => is_markdown_path(file.path))) {
        void services.links.load_note_links(active_path);
      }
      // The service already swapped in what is left of each file. Replace All
      // runs the search again, so the list shows only what still matches. It
      // uses the inputs as they are now, not the replaced request, and only
      // while Text mode is on screen: the find reactor clears the results once
      // the omnibar closes or leaves Text mode.
      const { open, mode } = stores.ui.omnibar;
      const current = current_request();
      if (scope === "all" && open && mode === "find" && current) {
        void services.vault_find.search(current);
      }

      const match_count = written.reduce(
        (total, file) => total + file.count,
        0,
      );
      const summary = `Replaced ${plural(match_count, "match", "matches")} in ${plural(written.length, "file", "files")}`;
      const skipped_count = unsaved_count + result.response.skipped.length;
      if (skipped_count === 0) {
        toast.success(summary);
      } else {
        toast.warning(summary, {
          description: `${plural(skipped_count, "file", "files")} skipped: unsaved, open in a document window, or changed on disk`,
        });
      }
      return written.length > 0;
    } finally {
      replace_running = false;
    }
  }

  // The same refresh LinkRepairService does after it rewrites notes.
  async function refresh_written_notes(paths: string[]) {
    const active_path = stores.editor.open_note?.meta.path;
    for (const path of paths) {
      const note_path = as_note_path(path);
      if (active_path && paths_equal_ignore_case(path, active_path)) {
        // You can type between the write and this reload. Reloading would
        // throw those edits away, so flag a conflict and let the toast ask.
        services.editor.flush();
        if (unsaved_paths().has(path.toLowerCase())) {
          services.tab.mark_conflict(note_path);
          continue;
        }
        await services.note.open_note(note_path, false, {
          force_reload: true,
        });
        continue;
      }
      stores.tab.invalidate_cache_by_path(note_path);
      services.editor.close_buffer(note_path);
    }
  }

  // One-shot results: the omnibar closes, then the note opens. The match
  // becomes the selection, so reopening Text mode lands on it and Down Enter
  // opens the next one.
  registry.register({
    id: ACTION_IDS.vault_find_open_match,
    label: "Open Find in Vault Match",
    execute: async (raw: unknown) => {
      const match = raw as OpenMatchInput;
      const request = results.request;
      if (request) {
        stores.ui.vault_find.selected_match = {
          request_key: vault_find_request_key(request),
          path: match.path,
          index: match.index,
        };
      }
      if (stores.ui.omnibar.open) {
        await registry.execute(ACTION_IDS.omnibar_close);
      }
      // Results go stale when a file is renamed or deleted. Cleanup makes the
      // open say "Note no longer exists" instead of failing without a word.
      await registry.execute(ACTION_IDS.note_open, {
        note_path: match.path,
        cleanup_if_missing: true,
      });
      // Opening can fail or hand the file to another app. Do not select a
      // range in whatever note is still open then.
      if (stores.editor.open_note?.meta.path !== match.path) return;
      services.editor.select_line_range(match.line, match.column, match.length);
    },
  });

  // Afterwards the selection moves past the inserted text, so Enter in the
  // replace input walks through the matches one by one.
  registry.register({
    id: ACTION_IDS.vault_find_replace_match,
    label: "Replace Find in Vault Match",
    execute: async (raw: unknown) => {
      const { path, match_index } = raw as {
        path: string;
        match_index: number;
      };
      const file = find_file(path);
      const match = file?.matches.find((entry) => entry.index === match_index);
      const plan =
        file && plan_from_results([replace_target(file, [match_index])]);
      if (!match || !plan) return;
      const inserted = build_replacement_preview(
        match,
        plan.replacement,
        plan.request.regex,
        results.group_names,
      );
      if (!(await run_replace(plan, "match"))) return;

      const next = next_match_after_replace(results.files, {
        path,
        line: match.line,
        column: match.column,
        inserted_length: inserted.length,
      });
      stores.ui.vault_find.selected_match = next && {
        request_key: vault_find_request_key(plan.request),
        ...next,
      };
    },
  });

  // Afterwards the selection moves to the next file. The file was rewritten
  // whole, so any match left in it is a fresh one (foo -> foobar), and a
  // second Replace in file there would grow foobarbar.
  registry.register({
    id: ACTION_IDS.vault_find_replace_file,
    label: "Replace in File",
    execute: async (path: unknown) => {
      const file = find_file(String(path));
      const plan = file && plan_from_results([replace_target(file)]);
      if (!file || !plan) return;
      if (!(await run_replace(plan, "file"))) return;

      const next = first_match_after_file(results.files, file.path);
      stores.ui.vault_find.selected_match = next && {
        request_key: vault_find_request_key(plan.request),
        ...next,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_request_replace_all,
    label: "Replace All in Vault",
    execute: () => {
      const request = results.request;
      if (!request || !results.can_replace_all) return;
      if (replace_running) return;
      const replacement = stores.ui.vault_find.replacement;
      replace_all_plan = {
        request,
        replacement,
        targets: results.files.map((file) => replace_target(file)),
      };
      const unsaved = unsaved_paths();
      stores.ui.vault_replace_dialog = {
        open: true,
        query: request.text,
        replacement,
        match_count: results.match_count,
        file_count: results.files.length,
        unsaved_paths: results.files
          .map((file) => file.path)
          .filter((path) => unsaved.has(path.toLowerCase())),
        is_replacing: false,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_cancel_replace_all,
    label: "Cancel Replace All in Vault",
    execute: () => {
      if (stores.ui.vault_replace_dialog.is_replacing) return;
      replace_all_plan = null;
      close_replace_dialog();
    },
  });

  // The dialog stays open until the checkpoint and the writes are done, so a
  // second click cannot start another run and big vaults show progress.
  registry.register({
    id: ACTION_IDS.vault_find_confirm_replace_all,
    label: "Confirm Replace All in Vault",
    execute: async () => {
      if (stores.ui.vault_replace_dialog.is_replacing) return;
      const plan = replace_all_plan;
      replace_all_plan = null;
      if (!plan) {
        toast.error("Results changed, run Replace All again");
        close_replace_dialog();
        return;
      }
      stores.ui.vault_replace_dialog = {
        ...stores.ui.vault_replace_dialog,
        is_replacing: true,
      };
      try {
        await run_replace(plan, "all");
      } finally {
        close_replace_dialog();
      }
    },
  });
}

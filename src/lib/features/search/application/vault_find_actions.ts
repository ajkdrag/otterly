import { toast } from "svelte-sonner";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { build_vault_find_request } from "$lib/features/search/domain/vault_find_request";
import type {
  VaultFindFile,
  VaultReplaceFile,
} from "$lib/features/search/types/vault_find";
import { as_note_path } from "$lib/shared/types/ids";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";

type OpenMatchInput = {
  path: string;
  line: number;
  column: number;
  length: number;
  // Click moves focus to the editor. Enter in the result list keeps it there.
  focus_editor: boolean;
};

type ReplaceScope = "match" | "file" | "all";

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

export function register_vault_find_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const results = stores.search.vault_find;

  function current_request() {
    return build_vault_find_request(stores.ui.vault_find);
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

  // Replace what the panel shows: dismissed matches are left alone.
  function replace_target(
    file: VaultFindFile,
    match_indexes = file.matches.map((match) => match.index),
  ): VaultReplaceFile {
    return { path: file.path, content_hash: file.content_hash, match_indexes };
  }

  // Panel replace writes to disk, not into editor buffers. Files with unsaved
  // edits are skipped, so we never write over them or behind their buffer.
  async function run_replace(targets: VaultReplaceFile[], scope: ReplaceScope) {
    const request = results.request;
    if (!request || targets.length === 0) return;

    services.editor.flush();
    const unsaved = unsaved_paths();
    const files = targets.filter(
      (file) => !unsaved.has(file.path.toLowerCase()),
    );
    const unsaved_count = targets.length - files.length;
    services.vault_find.cancel();
    if (files.length === 0) {
      toast.info("Nothing replaced: save your changes first");
      return;
    }

    const result = await services.vault_find.replace({
      text: request.text,
      regex: request.regex,
      case_sensitive: request.case_sensitive,
      whole_word: request.whole_word,
      replacement: stores.ui.vault_find.replacement,
      files,
    });
    if (result.status === "skipped") return;
    if (result.status === "failed") {
      toast.error(`Replace failed: ${result.error}`);
      return;
    }

    const written = result.response.replaced.filter((file) => file.count > 0);
    await refresh_written_notes(written.map((file) => file.path));
    // The service already swapped in what is left of each file. Replace All
    // runs the search again, so the list shows only what still matches.
    if (scope === "all") void services.vault_find.search(request);

    const match_count = written.reduce((total, file) => total + file.count, 0);
    const summary = `Replaced ${plural(match_count, "match", "matches")} in ${plural(written.length, "file", "files")}`;
    const skipped_count = unsaved_count + result.response.skipped.length;
    if (skipped_count === 0) {
      toast.success(summary);
      return;
    }
    toast.warning(summary, {
      description: `${plural(skipped_count, "file", "files")} skipped: unsaved or changed on disk`,
    });
  }

  // The same refresh LinkRepairService does after it rewrites notes.
  async function refresh_written_notes(paths: string[]) {
    const active_path = stores.editor.open_note?.meta.path;
    for (const path of paths) {
      const note_path = as_note_path(path);
      if (active_path && paths_equal_ignore_case(path, active_path)) {
        await services.note.open_note(note_path, false, {
          force_reload: true,
        });
        continue;
      }
      stores.tab.invalidate_cache_by_path(note_path);
      services.editor.close_buffer(note_path);
    }
  }

  registry.register({
    id: ACTION_IDS.vault_find_open,
    label: "Find in Vault",
    execute: () => {
      stores.ui.set_sidebar_view("search");
      stores.ui.vault_find.focus_nonce += 1;
    },
  });

  // Escape in the panel's find input hands the keyboard back to the editor.
  registry.register({
    id: ACTION_IDS.vault_find_focus_editor,
    label: "Focus Editor",
    execute: () => {
      services.editor.focus();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_refresh,
    label: "Refresh Find in Vault",
    execute: async () => {
      const request = current_request();
      if (request) await services.vault_find.search(request);
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_clear,
    label: "Clear Find in Vault",
    execute: () => {
      stores.ui.vault_find.query = "";
      services.vault_find.clear();
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_open_match,
    label: "Open Find in Vault Match",
    execute: async (raw: unknown) => {
      const match = raw as OpenMatchInput;
      await registry.execute(ACTION_IDS.note_open, match.path);
      // Opening can fail or hand the file to another app. Do not select a
      // range in whatever note is still open then.
      if (stores.editor.open_note?.meta.path !== match.path) return;
      services.editor.select_line_range(
        match.line,
        match.column,
        match.length,
        match.focus_editor,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_dismiss,
    label: "Dismiss Find in Vault Result",
    execute: (raw: unknown) => {
      const { path, match_index } = raw as {
        path: string;
        match_index?: number;
      };
      results.dismiss(path, match_index);
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_replace_match,
    label: "Replace Find in Vault Match",
    execute: async (raw: unknown) => {
      const { path, match_index } = raw as {
        path: string;
        match_index: number;
      };
      const file = find_file(path);
      if (file)
        await run_replace([replace_target(file, [match_index])], "match");
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_replace_file,
    label: "Replace in File",
    execute: async (path: unknown) => {
      const file = find_file(String(path));
      if (file) await run_replace([replace_target(file)], "file");
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_request_replace_all,
    label: "Replace All in Vault",
    execute: () => {
      if (!results.can_replace_all) return;
      const unsaved = unsaved_paths();
      stores.ui.vault_replace_dialog = {
        open: true,
        match_count: results.match_count,
        file_count: results.files.length,
        unsaved_paths: results.files
          .map((file) => file.path)
          .filter((path) => unsaved.has(path.toLowerCase())),
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_cancel_replace_all,
    label: "Cancel Replace All in Vault",
    execute: () => {
      stores.ui.vault_replace_dialog = {
        ...stores.ui.vault_replace_dialog,
        open: false,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.vault_find_confirm_replace_all,
    label: "Confirm Replace All in Vault",
    execute: async () => {
      stores.ui.vault_replace_dialog = {
        ...stores.ui.vault_replace_dialog,
        open: false,
      };
      const request = results.request;
      if (!request || !results.can_replace_all) return;

      // The checkpoint is the undo for Replace All. No checkpoint, no write.
      if (stores.git.enabled) {
        const checkpoint = await services.git.create_checkpoint(
          `replace "${request.text}"`,
        );
        if (
          checkpoint.status !== "created" &&
          checkpoint.status !== "skipped"
        ) {
          const reason =
            checkpoint.status === "failed" ? checkpoint.error : "no repository";
          toast.error(`Nothing replaced: git checkpoint failed (${reason})`);
          return;
        }
      }

      await run_replace(
        results.files.map((file) => replace_target(file)),
        "all",
      );
    },
  });
}

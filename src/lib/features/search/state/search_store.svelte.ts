import type { OmnibarItem, InFileMatch } from "$lib/shared/types/search";
import type { IndexProgressEvent } from "$lib/shared/types/search";
import type {
  VaultFindError,
  VaultFindFile,
  VaultFindRequest,
  VaultFindStats,
} from "$lib/features/search/types/vault_find";
import { compare_paths } from "$lib/shared/utils/path";

export type IndexProgress = {
  status: "idle" | "indexing" | "completed" | "failed";
  indexed: number;
  total: number;
  error: string | null;
};

export type VaultFindStatus = "idle" | "searching" | "done" | "error";

// Both lists are sorted by path. Batches arrive every 50 ms on big vaults, so
// merge instead of sorting everything again.
function merge_by_path(
  current: VaultFindFile[],
  incoming: VaultFindFile[],
): VaultFindFile[] {
  const merged: VaultFindFile[] = [];
  let left = 0;
  let right = 0;
  let left_file = current[0];
  let right_file = incoming[0];
  while (left_file && right_file) {
    if (compare_paths(left_file.path, right_file.path) <= 0) {
      merged.push(left_file);
      left_file = current[++left];
    } else {
      merged.push(right_file);
      right_file = incoming[++right];
    }
  }
  return merged.concat(current.slice(left), incoming.slice(right));
}

// Results of the vault find in the omnibar's Text mode. `request` is what
// produced `files`, so a replace uses the same spec the match ordinals came
// from.
export class VaultFindResults {
  // Thousands of matches: replace the array, no deep proxies.
  files = $state.raw<VaultFindFile[]>([]);
  status = $state<VaultFindStatus>("idle");
  stats = $state<VaultFindStats | null>(null);
  error = $state<VaultFindError | null>(null);
  request = $state.raw<VaultFindRequest | null>(null);
  // Names of the capture groups of `request`, for the replacement preview.
  group_names = $state.raw<(string | null)[]>([]);
  match_count = $derived(
    this.files.reduce((total, file) => total + file.matches.length, 0),
  );
  // Only a finished, complete result set. A cancelled run has no stats and a
  // truncated one leaves matches out, so Replace All would miss some.
  can_replace_all = $derived(
    this.status === "done" &&
      this.stats !== null &&
      !this.stats.truncated &&
      this.files.length > 0,
  );

  start(request: VaultFindRequest) {
    this.files = [];
    this.status = "searching";
    this.stats = null;
    this.error = null;
    this.request = request;
    this.group_names = [];
  }

  add_files(files: VaultFindFile[], group_names: (string | null)[]) {
    this.group_names = group_names;
    const sorted = [...files].sort((left, right) =>
      compare_paths(left.path, right.path),
    );
    this.files = merge_by_path(this.files, sorted);
  }

  // stats is null when the search was cancelled before it finished.
  finish(stats: VaultFindStats | null) {
    this.status = "done";
    this.stats = stats;
  }

  fail(error: VaultFindError) {
    this.files = [];
    this.status = "error";
    this.error = error;
  }

  // Swaps in a file's state after a replace. null removes the file.
  patch_file(path: string, file: VaultFindFile | null) {
    this.files = file
      ? this.files.map((current) => (current.path === path ? file : current))
      : this.files.filter((current) => current.path !== path);
  }

  reset() {
    this.files = [];
    this.status = "idle";
    this.stats = null;
    this.error = null;
    this.request = null;
    this.group_names = [];
  }
}

export class SearchStore {
  vault_find = new VaultFindResults();
  omnibar_items = $state<OmnibarItem[]>([]);
  // The tagged notes search found more than it returned.
  omnibar_truncated = $state(false);
  // The tagged notes search itself failed, which is not the same as no notes.
  omnibar_failed = $state(false);
  in_file_matches = $state<InFileMatch[]>([]);
  index_progress = $state<IndexProgress>({
    status: "idle",
    indexed: 0,
    total: 0,
    error: null,
  });

  set_index_progress(event: IndexProgressEvent) {
    switch (event.status) {
      case "started":
        this.index_progress = {
          status: "indexing",
          indexed: 0,
          total: event.total,
          error: null,
        };
        break;
      case "progress":
        this.index_progress = {
          status: "indexing",
          indexed: event.indexed,
          total: event.total,
          error: null,
        };
        break;
      case "completed":
        this.index_progress = {
          status: "completed",
          indexed: event.indexed,
          total: event.indexed,
          error: null,
        };
        break;
      case "failed":
        this.index_progress = {
          status: "failed",
          indexed: 0,
          total: 0,
          error: event.error,
        };
        break;
    }
  }

  set_omnibar_items(items: OmnibarItem[], truncated = false, failed = false) {
    this.omnibar_items = items;
    this.omnibar_truncated = truncated;
    this.omnibar_failed = failed;
  }

  set_in_file_matches(matches: InFileMatch[]) {
    this.in_file_matches = matches;
  }

  clear_omnibar() {
    this.omnibar_items = [];
    this.omnibar_truncated = false;
    this.omnibar_failed = false;
  }

  clear_in_file_matches() {
    this.in_file_matches = [];
  }

  reset() {
    this.vault_find.reset();
    this.omnibar_items = [];
    this.omnibar_truncated = false;
    this.omnibar_failed = false;
    this.in_file_matches = [];
    this.index_progress = { status: "idle", indexed: 0, total: 0, error: null };
  }
}

import type { OmnibarItem, InFileMatch } from "$lib/shared/types/search";
import type { IndexProgressEvent } from "$lib/shared/types/search";

export type IndexProgress = {
  status: "idle" | "indexing" | "completed" | "failed";
  indexed: number;
  total: number;
  error: string | null;
};

export class SearchStore {
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
    this.omnibar_items = [];
    this.omnibar_truncated = false;
    this.omnibar_failed = false;
    this.in_file_matches = [];
    this.index_progress = { status: "idle", indexed: 0, total: 0, error: null };
  }
}

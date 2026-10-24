import type { VaultFindPort } from "$lib/features/search";

// Finds nothing and replaces nothing.
export function create_test_vault_find_adapter(): VaultFindPort {
  return {
    start_find(_vault_id, _request, on_event) {
      on_event({
        type: "done",
        searched_files: 0,
        skipped_files: 0,
        match_count: 0,
        truncated: false,
        elapsed_ms: 0,
      });
      return Promise.resolve({ status: "started" });
    },
    async cancel_find() {},
    replace() {
      return Promise.resolve({ replaced: [], skipped: [] });
    },
  };
}

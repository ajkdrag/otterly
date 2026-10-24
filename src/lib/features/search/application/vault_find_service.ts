import type { VaultFindPort } from "$lib/features/search/ports";
import type { SearchStore } from "$lib/features/search/state/search_store.svelte";
import type {
  VaultFindRequest,
  VaultReplaceRequest,
  VaultReplaceResponse,
} from "$lib/features/search/types/vault_find";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("vault_find_service");
const REPLACE_OP_KEY = "vault_find.replace";

export type VaultReplaceResult =
  | { status: "replaced"; response: VaultReplaceResponse }
  | { status: "skipped" }
  | { status: "failed"; error: string };

// Find across the vault, streamed from Rust into SearchStore.vault_find, and
// replace on disk. Cross-feature work around a replace (unsaved buffers, git
// checkpoint, reloading editors) lives in vault_find_actions.
export class VaultFindService {
  // Bumped by every search, cancel and clear. Events of an older run are
  // dropped, so a slow walk can never overwrite newer results.
  private revision = 0;

  constructor(
    private readonly port: VaultFindPort,
    private readonly vault_store: VaultStore,
    private readonly search_store: SearchStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
    private readonly suppress_file_write: (path: string) => void,
  ) {}

  async search(request: VaultFindRequest): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const revision = ++this.revision;
    const results = this.search_store.vault_find;
    results.start(request);
    try {
      const started = await this.port.start_find(vault_id, request, (event) => {
        if (revision !== this.revision) return;
        if (event.type === "files") {
          results.add_files(event.files);
          return;
        }
        const { type: _type, ...stats } = event;
        results.finish(stats);
      });
      if (revision !== this.revision) return;
      if (started.status === "invalid") results.fail(started.error);
    } catch (error) {
      if (revision !== this.revision) return;
      const message = error_message(error);
      log.error("Vault find failed", { error: message });
      results.fail({ kind: "failed", message });
    }
  }

  // Stops the running search and keeps what it found so far.
  cancel() {
    this.revision += 1;
    const results = this.search_store.vault_find;
    if (results.status === "searching") results.finish(null);
    void this.port.cancel_find().catch((error: unknown) => {
      log.error("Vault find cancel failed", { error: error_message(error) });
    });
  }

  clear() {
    this.cancel();
    this.search_store.vault_find.reset();
  }

  // Writes straight to disk. Each replaced file's result entry is swapped for
  // what is left in it. The caller decides which files are safe to write.
  async replace(request: VaultReplaceRequest): Promise<VaultReplaceResult> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return { status: "skipped" };

    for (const file of request.files) this.suppress_file_write(file.path);
    this.op_store.start(REPLACE_OP_KEY, this.now_ms());
    try {
      const response = await this.port.replace(vault_id, request);
      for (const file of response.replaced) {
        // Again: the watcher's 2 s window may have passed on a big batch.
        if (file.count > 0) this.suppress_file_write(file.path);
        this.search_store.vault_find.patch_file(file.path, file.remaining);
      }
      this.op_store.succeed(REPLACE_OP_KEY);
      return { status: "replaced", response };
    } catch (error) {
      const message = error_message(error);
      log.error("Vault replace failed", { error: message });
      this.op_store.fail(REPLACE_OP_KEY, message);
      return { status: "failed", error: message };
    }
  }
}

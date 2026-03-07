import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("watcher_service");

const SUPPRESS_WINDOW_MS = 2000;

/**
 * Manages the filesystem watcher lifecycle and self-write suppression.
 *
 * Only one vault can be watched at a time. Calling `start()` stops any
 * previous watcher before starting a new one.
 *
 * Self-write suppression prevents the app's own saves from being treated
 * as external changes. Call `suppress_next(path)` before writing, then
 * the watcher reactor calls `consume_suppressed(path)` when it receives
 * a `note_changed_externally` event. Suppression entries auto-expire
 * after 2 seconds if not consumed.
 */
export class WatcherService {
  private unsubscribe: (() => void) | null = null;
  private suppressed = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly port: WatcherPort) {}

  /** Registers a path to ignore on the next watcher event. Auto-expires after 2s. */
  suppress_next(path: string): void {
    const existing = this.suppressed.get(path);
    if (existing !== undefined) clearTimeout(existing);
    this.suppressed.set(
      path,
      setTimeout(() => this.suppressed.delete(path), SUPPRESS_WINDOW_MS),
    );
  }

  /** Returns true and clears suppression if the path was suppressed; false otherwise. */
  consume_suppressed(path: string): boolean {
    const timer = this.suppressed.get(path);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this.suppressed.delete(path);
    return true;
  }

  async start(vault_id: VaultId): Promise<void> {
    await this.stop();
    try {
      await this.port.watch_vault(vault_id);
    } catch (error) {
      log.from_error("Failed to start vault watcher", error);
    }
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      await this.port.unwatch_vault();
    } catch (error) {
      log.from_error("Failed to stop vault watcher", error);
    }
  }

  /** Replaces the current event handler. Only one handler is active at a time. */
  subscribe(handler: (event: VaultFsEvent) => void): () => void {
    this.unsubscribe?.();
    const unsub = this.port.subscribe_fs_events(handler);
    this.unsubscribe = unsub;
    return unsub;
  }
}

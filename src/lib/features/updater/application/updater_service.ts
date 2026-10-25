import type { UpdaterPort } from "$lib/features/updater/ports";
import type { UpdaterStore } from "$lib/features/updater/state/updater_store.svelte";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("updater_service");

export type UpdateDownloadResult =
  | { status: "ready"; version: string }
  | { status: "up_to_date" }
  | { status: "portable" }
  | { status: "failed" };

export class UpdaterService {
  // The background check and a manual check can overlap. They share one
  // download, and once it finishes we keep reusing it instead of checking again.
  private pending_download: Promise<UpdateDownloadResult> | null = null;
  private downloaded_version: string | null = null;

  constructor(
    private readonly updater_port: UpdaterPort,
    private readonly updater_store: UpdaterStore,
  ) {}

  download_update(): Promise<UpdateDownloadResult> {
    if (this.downloaded_version !== null) {
      return Promise.resolve({
        status: "ready",
        version: this.downloaded_version,
      });
    }
    this.pending_download ??= this.check_and_download().finally(() => {
      this.pending_download = null;
    });
    return this.pending_download;
  }

  // Returns false on failure so the action can tell the user. On success the
  // app restarts before anyone reads the result.
  async install_and_relaunch(): Promise<boolean> {
    try {
      await this.updater_port.install_and_relaunch();
      return true;
    } catch (error) {
      log.error("Update install failed", { error: error_message(error) });
      return false;
    }
  }

  private async check_and_download(): Promise<UpdateDownloadResult> {
    try {
      // The updater would run the installer, which turns a portable copy into
      // an installed one. Portable users download the new zip themselves.
      if (await this.updater_port.is_portable_install()) {
        return { status: "portable" };
      }
      this.updater_store.set_status({ kind: "checking" });
      const version = await this.updater_port.check_update();
      if (version === null) {
        this.updater_store.set_status({ kind: "idle" });
        return { status: "up_to_date" };
      }
      this.updater_store.set_status({
        kind: "downloading",
        version,
        downloaded_bytes: 0,
        total_bytes: null,
      });
      await this.updater_port.download_update((progress) => {
        this.updater_store.set_status({
          kind: "downloading",
          version,
          ...progress,
        });
      });
      this.downloaded_version = version;
      this.updater_store.set_status({ kind: "ready", version });
      return { status: "ready", version };
    } catch (error) {
      log.error("Update download failed", { error: error_message(error) });
      this.updater_store.set_status({ kind: "idle" });
      return { status: "failed" };
    }
  }
}

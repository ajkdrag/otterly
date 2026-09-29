import type { UpdaterPort } from "$lib/features/updater/ports";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("updater_service");

export type UpdateDownloadResult =
  | { status: "ready"; version: string }
  | { status: "up_to_date" }
  | { status: "failed" };

export class UpdaterService {
  // The background check and a manual check can overlap. They share one
  // download, and once it finishes we keep reusing it instead of checking again.
  private pending_download: Promise<UpdateDownloadResult> | null = null;
  private downloaded_version: string | null = null;

  constructor(private readonly updater_port: UpdaterPort) {}

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
      const version = await this.updater_port.download_update();
      if (version === null) return { status: "up_to_date" };
      this.downloaded_version = version;
      return { status: "ready", version };
    } catch (error) {
      log.error("Update download failed", { error: error_message(error) });
      return { status: "failed" };
    }
  }
}

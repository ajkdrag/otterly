import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { UpdateStore } from "../state/update_store.svelte";
import { getVersion } from "@tauri-apps/api/app";

let cached_update: Awaited<ReturnType<typeof check>> | null = null;

export class UpdateService {
  constructor(private store: UpdateStore) {}

  async check_for_update(): Promise<void> {
    this.store.set_checking();
    try {
      const update = await check();
      if (update) {
        cached_update = update;
        this.store.set_available({
          version: update.version,
          body: update.body ?? null,
          date: update.date ?? null,
        });
      } else {
        cached_update = null;
        this.store.set_up_to_date();
      }
    } catch (e) {
      this.store.set_check_error(String(e));
    }
  }

  async download_and_install(): Promise<void> {
    if (!cached_update) return;
    this.store.reset_download();

    try {
      let downloaded = 0;
      let content_length = 0;

      await cached_update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            content_length = event.data.contentLength ?? 0;
            this.store.set_downloading(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            const percent = content_length > 0
              ? Math.min(Math.round((downloaded / content_length) * 100), 100)
              : 0;
            this.store.set_downloading(percent);
            break;
          case "Finished":
            this.store.set_download_ready();
            break;
        }
      });

      this.store.set_installing();
      await relaunch();
    } catch (e) {
      this.store.set_download_error(String(e));
    }
  }

  async get_current_version(): Promise<string> {
    try {
      return await getVersion();
    } catch {
      return "unknown";
    }
  }
}

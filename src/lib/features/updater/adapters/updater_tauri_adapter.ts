import type { UpdaterPort } from "$lib/features/updater/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export function create_updater_tauri_adapter(): UpdaterPort {
  // download() and install() have to run on the Update that check() found.
  let found_update: Update | null = null;

  return {
    is_portable_install: () => tauri_invoke<boolean>("is_portable_install"),
    async check_update() {
      found_update = await check();
      return found_update?.version ?? null;
    },
    async download_update(on_progress) {
      if (!found_update) throw new Error("No update to download");
      let downloaded_bytes = 0;
      let total_bytes: number | null = null;
      await found_update.download((event) => {
        if (event.event === "Started") {
          total_bytes = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          downloaded_bytes += event.data.chunkLength;
        }
        on_progress({ downloaded_bytes, total_bytes });
      });
    },
    async install_and_relaunch() {
      if (!found_update) throw new Error("No downloaded update");
      // On Windows install() exits the app itself to run the installer, so we
      // never get to relaunch() there.
      await found_update.install();
      await relaunch();
    },
  };
}

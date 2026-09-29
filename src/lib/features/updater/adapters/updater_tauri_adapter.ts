import type { UpdaterPort } from "$lib/features/updater/ports";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export function create_updater_tauri_adapter(): UpdaterPort {
  // install() has to run on the same Update that download() filled.
  let downloaded_update: Update | null = null;

  return {
    async download_update() {
      const update = await check();
      if (!update) return null;
      await update.download();
      downloaded_update = update;
      return update.version;
    },
    async install_and_relaunch() {
      if (!downloaded_update) throw new Error("No downloaded update");
      // On Windows install() exits the app itself to run the installer, so we
      // never get to relaunch() there.
      await downloaded_update.install();
      await relaunch();
    },
  };
}

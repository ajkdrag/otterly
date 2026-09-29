import type { UpdaterPort } from "$lib/features/updater";

export function create_test_updater_adapter(): UpdaterPort {
  return {
    download_update() {
      return Promise.resolve(null);
    },
    install_and_relaunch() {
      return Promise.resolve();
    },
  };
}

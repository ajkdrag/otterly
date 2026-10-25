import type { UpdaterPort } from "$lib/features/updater";

export function create_test_updater_adapter(): UpdaterPort {
  return {
    is_portable_install() {
      return Promise.resolve(false);
    },
    check_update() {
      return Promise.resolve(null);
    },
    download_update() {
      return Promise.resolve();
    },
    install_and_relaunch() {
      return Promise.resolve();
    },
  };
}

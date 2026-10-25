export type UpdateDownloadProgress = {
  downloaded_bytes: number;
  total_bytes: number | null;
};

export interface UpdaterPort {
  // True for the Windows portable zip, which cannot apply an installer update.
  is_portable_install: () => Promise<boolean>;
  // Resolves to the newer version, or null when we are up to date.
  check_update: () => Promise<string | null>;
  // Downloads the update the last check_update found.
  download_update: (
    on_progress: (progress: UpdateDownloadProgress) => void,
  ) => Promise<void>;
  // Installs the last downloaded update and restarts the app.
  install_and_relaunch: () => Promise<void>;
}

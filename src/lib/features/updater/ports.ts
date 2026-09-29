export interface UpdaterPort {
  // Resolves to the downloaded version, or null when we are up to date.
  download_update: () => Promise<string | null>;
  // Installs the last downloaded update and restarts the app.
  install_and_relaunch: () => Promise<void>;
}

export interface UpdaterPort {
  // True for the Windows portable zip, which cannot apply an installer update.
  is_portable_install: () => Promise<boolean>;
  // Resolves to the downloaded version, or null when we are up to date.
  download_update: () => Promise<string | null>;
  // Installs the last downloaded update and restarts the app.
  install_and_relaunch: () => Promise<void>;
}

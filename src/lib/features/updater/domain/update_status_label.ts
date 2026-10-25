import type { UpdateStatus } from "$lib/features/updater/state/updater_store.svelte";

const BYTES_PER_MB = 1024 * 1024;

function megabytes(bytes: number): string {
  return (bytes / BYTES_PER_MB).toFixed(1);
}

// Whole percent of the download, or null when the size is unknown.
export function update_download_percent(status: UpdateStatus): number | null {
  if (status.kind !== "downloading" || !status.total_bytes) return null;
  const percent = (status.downloaded_bytes / status.total_bytes) * 100;
  return Math.min(100, Math.floor(percent));
}

// The status bar text, or null when there is nothing to show.
export function update_status_label(status: UpdateStatus): string | null {
  switch (status.kind) {
    case "idle":
      return null;
    case "checking":
      return "Checking for updates...";
    case "downloading": {
      const percent = update_download_percent(status);
      if (percent === null || status.total_bytes === null) {
        return `Downloading v${status.version} · ${megabytes(status.downloaded_bytes)} MB`;
      }
      return `Downloading v${status.version} · ${megabytes(status.downloaded_bytes)} / ${megabytes(status.total_bytes)} MB (${String(percent)}%)`;
    }
    case "ready":
      return `Restart to update to v${status.version}`;
  }
}

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export type CheckStatus = "idle" | "checking" | "available" | "up_to_date" | "error";
export type DownloadStatus = "idle" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  check_status: CheckStatus;
  last_checked_at: string | null;
  check_error: string | null;
  available_update: UpdateInfo | null;
  download_status: DownloadStatus;
  download_progress: number;
  download_error: string | null;
  dialog_open: boolean;
}

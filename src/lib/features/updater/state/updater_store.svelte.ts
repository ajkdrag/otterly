// What the updater is doing, for the status bar. The download used to run
// with no sign at all, so a slow one looked like nothing was happening.
export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | {
      kind: "downloading";
      version: string;
      downloaded_bytes: number;
      // null until the server sends a Content-Length, and some never do.
      total_bytes: number | null;
    }
  | { kind: "ready"; version: string };

export class UpdaterStore {
  status = $state<UpdateStatus>({ kind: "idle" });

  set_status(status: UpdateStatus) {
    this.status = status;
  }
}

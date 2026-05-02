import type { UpdateInfo, CheckStatus, DownloadStatus } from "../types/update_types";

export class UpdateStore {
  #check_status = $state<CheckStatus>("idle");
  #last_checked_at = $state<string | null>(null);
  #check_error = $state<string | null>(null);
  #available_update = $state<UpdateInfo | null>(null);
  #download_status = $state<DownloadStatus>("idle");
  #download_progress = $state(0);
  #download_error = $state<string | null>(null);
  #dialog_open = $state(false);

  get check_status() { return this.#check_status; }
  get last_checked_at() { return this.#last_checked_at; }
  get check_error() { return this.#check_error; }
  get available_update() { return this.#available_update; }
  get download_status() { return this.#download_status; }
  get download_progress() { return this.#download_progress; }
  get download_error() { return this.#download_error; }
  get dialog_open() { return this.#dialog_open; }

  get has_update() { return this.#check_status === "available" && this.#available_update !== null; }

  set_checking() {
    this.#check_status = "checking";
    this.#check_error = null;
  }

  set_available(info: UpdateInfo) {
    this.#check_status = "available";
    this.#available_update = info;
    this.#last_checked_at = new Date().toISOString();
  }

  set_up_to_date() {
    this.#check_status = "up_to_date";
    this.#available_update = null;
    this.#last_checked_at = new Date().toISOString();
  }

  set_check_error(error: string) {
    this.#check_status = "error";
    this.#check_error = error;
  }

  set_downloading(progress: number) {
    this.#download_status = "downloading";
    this.#download_progress = progress;
  }

  set_download_ready() {
    this.#download_status = "ready";
    this.#download_progress = 100;
  }

  set_installing() {
    this.#download_status = "installing";
  }

  set_download_error(error: string) {
    this.#download_status = "error";
    this.#download_error = error;
  }

  open_dialog() { this.#dialog_open = true; }
  close_dialog() { this.#dialog_open = false; }

  reset_download() {
    this.#download_status = "idle";
    this.#download_progress = 0;
    this.#download_error = null;
  }
}

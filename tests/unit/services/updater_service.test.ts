import { describe, expect, it, vi } from "vitest";
import { UpdaterService } from "$lib/features/updater/application/updater_service";
import {
  UpdaterStore,
  type UpdateStatus,
} from "$lib/features/updater/state/updater_store.svelte";
import { create_test_updater_adapter } from "../../adapters/test_updater_adapter";

function create_harness() {
  const port = create_test_updater_adapter();
  const store = new UpdaterStore();
  return { port, store, service: new UpdaterService(port, store) };
}

describe("UpdaterService.download_update", () => {
  it("reports up to date when there is no newer version", async () => {
    const { service, store } = create_harness();

    expect(await service.download_update()).toEqual({ status: "up_to_date" });
    expect(store.status).toEqual({ kind: "idle" });
  });

  it("reuses a finished download instead of checking again", async () => {
    const { port, service } = create_harness();
    const check_update = vi
      .spyOn(port, "check_update")
      .mockResolvedValue("0.5.0");

    await service.download_update();
    const result = await service.download_update();

    expect(result).toEqual({ status: "ready", version: "0.5.0" });
    expect(check_update).toHaveBeenCalledTimes(1);
  });

  it("shares one download between overlapping checks", async () => {
    const { port, service } = create_harness();
    vi.spyOn(port, "check_update").mockResolvedValue("0.5.0");
    const download_update = vi.spyOn(port, "download_update");

    const [first, second] = await Promise.all([
      service.download_update(),
      service.download_update(),
    ]);

    expect(first).toEqual(second);
    expect(download_update).toHaveBeenCalledTimes(1);
  });

  it("reports failure and checks again next time", async () => {
    const { port, service, store } = create_harness();
    const check_update = vi
      .spyOn(port, "check_update")
      .mockResolvedValue("0.5.0");
    vi.spyOn(port, "download_update")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce();

    expect(await service.download_update()).toEqual({ status: "failed" });
    expect(store.status).toEqual({ kind: "idle" });
    expect(await service.download_update()).toEqual({
      status: "ready",
      version: "0.5.0",
    });
    expect(check_update).toHaveBeenCalledTimes(2);
  });
});

describe("UpdaterService status for the status bar", () => {
  it("goes from checking through the download progress to ready", async () => {
    const { port, service, store } = create_harness();
    const seen: UpdateStatus[] = [];
    vi.spyOn(port, "check_update").mockImplementation(() => {
      seen.push(store.status);
      return Promise.resolve("0.7.0");
    });
    vi.spyOn(port, "download_update").mockImplementation((on_progress) => {
      seen.push(store.status);
      on_progress({ downloaded_bytes: 512, total_bytes: 2048 });
      seen.push(store.status);
      return Promise.resolve();
    });

    await service.download_update();

    expect(seen).toEqual([
      { kind: "checking" },
      {
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 0,
        total_bytes: null,
      },
      {
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 512,
        total_bytes: 2048,
      },
    ]);
    expect(store.status).toEqual({ kind: "ready", version: "0.7.0" });
  });
});

describe("UpdaterService.download_update for a portable install", () => {
  it("skips the download so the installer never runs", async () => {
    const { port, service, store } = create_harness();
    vi.spyOn(port, "is_portable_install").mockResolvedValue(true);
    const check_update = vi.spyOn(port, "check_update");

    expect(await service.download_update()).toEqual({ status: "portable" });
    expect(check_update).not.toHaveBeenCalled();
    expect(store.status).toEqual({ kind: "idle" });
  });

  it("reports failure when the portable check fails", async () => {
    const { port, service } = create_harness();
    vi.spyOn(port, "is_portable_install").mockRejectedValue(new Error("ipc"));

    expect(await service.download_update()).toEqual({ status: "failed" });
  });
});

describe("UpdaterService.install_and_relaunch", () => {
  it("reports failure when the install fails", async () => {
    const { port, service } = create_harness();
    vi.spyOn(port, "install_and_relaunch").mockRejectedValue(
      new Error("bad signature"),
    );

    expect(await service.install_and_relaunch()).toBe(false);
  });
});

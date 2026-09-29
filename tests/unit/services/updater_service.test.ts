import { describe, expect, it, vi } from "vitest";
import { UpdaterService } from "$lib/features/updater/application/updater_service";
import { create_test_updater_adapter } from "../../adapters/test_updater_adapter";

function create_harness() {
  const port = create_test_updater_adapter();
  return { port, service: new UpdaterService(port) };
}

describe("UpdaterService.download_update", () => {
  it("reports up to date when there is no newer version", async () => {
    const { service } = create_harness();

    expect(await service.download_update()).toEqual({ status: "up_to_date" });
  });

  it("reuses a finished download instead of checking again", async () => {
    const { port, service } = create_harness();
    const download_update = vi
      .spyOn(port, "download_update")
      .mockResolvedValue("0.5.0");

    await service.download_update();
    const result = await service.download_update();

    expect(result).toEqual({ status: "ready", version: "0.5.0" });
    expect(download_update).toHaveBeenCalledTimes(1);
  });

  it("shares one download between overlapping checks", async () => {
    const { port, service } = create_harness();
    const download_update = vi
      .spyOn(port, "download_update")
      .mockResolvedValue("0.5.0");

    const [first, second] = await Promise.all([
      service.download_update(),
      service.download_update(),
    ]);

    expect(first).toEqual(second);
    expect(download_update).toHaveBeenCalledTimes(1);
  });

  it("reports failure and checks again next time", async () => {
    const { port, service } = create_harness();
    const download_update = vi
      .spyOn(port, "download_update")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("0.5.0");

    expect(await service.download_update()).toEqual({ status: "failed" });
    expect(await service.download_update()).toEqual({
      status: "ready",
      version: "0.5.0",
    });
    expect(download_update).toHaveBeenCalledTimes(2);
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

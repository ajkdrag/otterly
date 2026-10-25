import { describe, expect, it } from "vitest";
import {
  update_download_percent,
  update_status_label,
} from "$lib/features/updater/domain/update_status_label";

const MB = 1024 * 1024;

describe("update_status_label", () => {
  it("shows nothing while idle", () => {
    expect(update_status_label({ kind: "idle" })).toBeNull();
  });

  it("says when it is checking", () => {
    expect(update_status_label({ kind: "checking" })).toBe(
      "Checking for updates...",
    );
  });

  it("shows megabytes and percent when the size is known", () => {
    expect(
      update_status_label({
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 3.2 * MB,
        total_bytes: 10 * MB,
      }),
    ).toBe("Downloading v0.7.0 · 3.2 / 10.0 MB (32%)");
  });

  it("shows only megabytes when the size is unknown", () => {
    expect(
      update_status_label({
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 1.5 * MB,
        total_bytes: null,
      }),
    ).toBe("Downloading v0.7.0 · 1.5 MB");
  });

  it("asks for a restart once the update is ready", () => {
    expect(update_status_label({ kind: "ready", version: "0.7.0" })).toBe(
      "Restart to update to v0.7.0",
    );
  });
});

describe("update_download_percent", () => {
  it("never goes past 100", () => {
    expect(
      update_download_percent({
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 12,
        total_bytes: 10,
      }),
    ).toBe(100);
  });

  it("is null for an unknown size", () => {
    expect(
      update_download_percent({
        kind: "downloading",
        version: "0.7.0",
        downloaded_bytes: 12,
        total_bytes: null,
      }),
    ).toBeNull();
  });
});

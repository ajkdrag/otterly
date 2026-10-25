import { describe, expect, it } from "vitest";
import {
  is_missing_file_error,
  is_missing_file_os_error,
} from "$lib/shared/utils/fs_errors";
import { is_unavailable_vault_error } from "$lib/features/vault/domain/vault_errors";

describe("is_unavailable_vault_error", () => {
  it("marks a vault unavailable when Windows cannot find its folder", () => {
    expect(
      is_unavailable_vault_error(
        "tauri invoke failed: open_vault_by_id: The system cannot find the path specified. (os error 3)",
      ),
    ).toBe(true);
  });

  it("does not mark a vault unavailable for other not-found errors", () => {
    expect(is_unavailable_vault_error("Vault not found in recent list")).toBe(
      false,
    );
  });
});

describe("is_missing_file_os_error", () => {
  it("ignores our own not-found messages", () => {
    expect(is_missing_file_os_error("note not found")).toBe(false);
  });
});

describe("is_missing_file_error", () => {
  it.each([
    "tauri invoke failed: read_note_meta: No such file or directory (os error 2)",
    "tauri invoke failed: read_note_meta: The system cannot find the file specified. (os error 2)",
    "tauri invoke failed: read_note: The system cannot find the path specified. (os error 3)",
    "tauri invoke failed: read_note: Das System kann die angegebene Datei nicht finden. (os error 2)",
    "vault not found",
  ])("treats %s as a missing file", (message) => {
    expect(is_missing_file_error(message)).toBe(true);
  });

  it.each([
    "tauri invoke failed: write_note: Access is denied. (os error 5)",
    "tauri invoke failed: write_note: conflict:mtime_mismatch",
    "file_not_text",
  ])("does not treat %s as a missing file", (message) => {
    expect(is_missing_file_error(message)).toBe(false);
  });
});

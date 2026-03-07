import { describe, expect, it } from "vitest";
import { detect_file_type } from "$lib/features/document/domain/document_types";

describe("detect_file_type", () => {
  it("detects pdf", () => {
    expect(detect_file_type("file.pdf")).toBe("pdf");
  });

  it("detects image case-insensitively", () => {
    expect(detect_file_type("image.PNG")).toBe("image");
  });

  it("detects csv", () => {
    expect(detect_file_type("data.csv")).toBe("csv");
  });

  it("detects code", () => {
    expect(detect_file_type("main.rs")).toBe("code");
  });

  it("detects text", () => {
    expect(detect_file_type("readme.txt")).toBe("text");
  });

  it("returns null for unknown extension", () => {
    expect(detect_file_type("unknown.xyz")).toBeNull();
  });

  it("returns null for files with no extension", () => {
    expect(detect_file_type("noext")).toBeNull();
  });
});

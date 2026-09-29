import { describe, expect, it } from "vitest";
import { is_program_file } from "$lib/features/shell/domain/program_file";

describe("is_program_file", () => {
  it("flags files that run when opened", () => {
    expect(is_program_file("setup.exe")).toBe(true);
    expect(is_program_file("scripts/Deploy.COMMAND")).toBe(true);
    expect(is_program_file("tools/run.sh")).toBe(true);
  });

  it("lets documents through", () => {
    expect(is_program_file("files/budget.xlsx")).toBe(false);
    expect(is_program_file("paper.pdf")).toBe(false);
    expect(is_program_file("notes.v2/README")).toBe(false);
  });
});

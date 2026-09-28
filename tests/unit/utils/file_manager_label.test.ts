import { describe, expect, it } from "vitest";
import { reveal_in_file_manager_label } from "$lib/shared/utils/file_manager_label";

describe("reveal_in_file_manager_label", () => {
  it("names each platform's file manager", () => {
    expect(reveal_in_file_manager_label("MacIntel")).toBe("Reveal in Finder");
    expect(reveal_in_file_manager_label("Win32")).toBe("Show in Explorer");
    expect(reveal_in_file_manager_label("Linux x86_64")).toBe(
      "Show in File Manager",
    );
  });
});

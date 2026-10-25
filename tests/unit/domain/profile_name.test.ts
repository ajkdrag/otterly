import { describe, expect, it } from "vitest";
import { normalize_profile_name } from "$lib/features/profile/domain/profile_name";

describe("normalize_profile_name", () => {
  it("keeps a name that is already an id", () => {
    expect(normalize_profile_name("work")).toEqual({ id: "work" });
    expect(normalize_profile_name("2024-q1")).toEqual({ id: "2024-q1" });
  });

  it("turns typed names into ids", () => {
    expect(normalize_profile_name("  Work Stuff ")).toEqual({
      id: "work-stuff",
    });
    expect(normalize_profile_name("side__project")).toEqual({
      id: "side-project",
    });
    expect(normalize_profile_name("a _ b")).toEqual({ id: "a-b" });
  });

  it("allows the default profile, which opens or focuses it", () => {
    expect(normalize_profile_name("Default")).toEqual({ id: "default" });
  });

  it("rejects names the backend would reject", () => {
    for (const input of [
      "",
      "   ",
      "-work",
      "_work",
      "wörk",
      "日本語",
      "a/b",
      "a.b",
    ]) {
      expect(normalize_profile_name(input), input).toHaveProperty("error");
    }
  });

  it("allows at most 32 characters", () => {
    expect(normalize_profile_name("a".repeat(32))).toEqual({
      id: "a".repeat(32),
    });
    expect(normalize_profile_name("a".repeat(33))).toHaveProperty("error");
  });
});

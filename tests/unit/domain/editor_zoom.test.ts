import { describe, expect, it } from "vitest";
import { step_editor_zoom } from "$lib/features/settings/domain/editor_zoom";

describe("step_editor_zoom", () => {
  it("steps by 10% without float drift", () => {
    expect(step_editor_zoom(1, 1)).toBe(1.1);
    expect(step_editor_zoom(1.1, 1)).toBe(1.2);
    expect(step_editor_zoom(1, -1)).toBe(0.9);
    expect(step_editor_zoom(0.7, -1)).toBe(0.6);
  });

  it("clamps between 50% and 200%", () => {
    expect(step_editor_zoom(2, 1)).toBe(2);
    expect(step_editor_zoom(0.5, -1)).toBe(0.5);
  });
});

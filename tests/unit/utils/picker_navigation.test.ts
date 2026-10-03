import { describe, expect, it } from "vitest";
import { picker_shortcut_step } from "$lib/shared/utils/picker_navigation";

function key_event(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("picker_shortcut_step", () => {
  it.each([
    [{ key: "j", metaKey: true }, 1],
    [{ key: "j", ctrlKey: true }, 1],
    [{ key: "J", ctrlKey: true }, 1],
    [{ key: "k", metaKey: true }, -1],
    [{ key: "k", ctrlKey: true }, -1],
  ])("maps %o to %i", (init, step) => {
    expect(picker_shortcut_step(key_event(init))).toBe(step);
  });

  it.each([
    [{ key: "j" }],
    [{ key: "k" }],
    [{ key: "j", metaKey: true, altKey: true }],
    [{ key: "k", ctrlKey: true, shiftKey: true }],
    [{ key: "l", metaKey: true }],
    [{ key: "ArrowDown", ctrlKey: true }],
  ])("ignores %o", (init) => {
    expect(picker_shortcut_step(key_event(init))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  is_valid_hotkey,
  is_reserved_key,
  normalize_event_to_key,
  format_hotkey_for_display,
  parse_hotkey_parts,
  RESERVED_KEYS,
} from "$lib/features/hotkey";

describe("is_valid_hotkey", () => {
  it("accepts modifier + letter combos", () => {
    expect(is_valid_hotkey("CmdOrCtrl+S").valid).toBe(true);
    expect(is_valid_hotkey("CmdOrCtrl+Shift+S").valid).toBe(true);
    expect(is_valid_hotkey("CmdOrCtrl+Alt+B").valid).toBe(true);
    expect(is_valid_hotkey("Alt+Shift+X").valid).toBe(true);
  });

  it("accepts function keys without modifiers", () => {
    expect(is_valid_hotkey("F1").valid).toBe(true);
    expect(is_valid_hotkey("F2").valid).toBe(true);
    expect(is_valid_hotkey("F12").valid).toBe(true);
  });

  it("accepts function keys with modifiers", () => {
    expect(is_valid_hotkey("CmdOrCtrl+F5").valid).toBe(true);
    expect(is_valid_hotkey("Shift+F12").valid).toBe(true);
  });

  it("accepts modifier + arrow key combos", () => {
    expect(is_valid_hotkey("CmdOrCtrl+Alt+ArrowLeft").valid).toBe(true);
    expect(is_valid_hotkey("CmdOrCtrl+Alt+ArrowRight").valid).toBe(true);
  });

  it("accepts modifier + special keys", () => {
    expect(is_valid_hotkey("CmdOrCtrl+Tab").valid).toBe(true);
    expect(is_valid_hotkey("CmdOrCtrl+Space").valid).toBe(true);
  });

  it("rejects empty string", () => {
    const result = is_valid_hotkey("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects whitespace-only string", () => {
    const result = is_valid_hotkey("  ");
    expect(result.valid).toBe(false);
  });

  it("rejects single letter without modifier", () => {
    const result = is_valid_hotkey("B");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("modifier");
  });

  it("rejects modifier-only combos", () => {
    expect(is_valid_hotkey("CmdOrCtrl").valid).toBe(false);
    expect(is_valid_hotkey("CmdOrCtrl+Shift").valid).toBe(false);
    expect(is_valid_hotkey("Alt").valid).toBe(false);
  });

  it("rejects single number without modifier", () => {
    const result = is_valid_hotkey("5");
    expect(result.valid).toBe(false);
  });
});

describe("is_reserved_key", () => {
  it("identifies reserved system shortcuts", () => {
    expect(is_reserved_key("CmdOrCtrl+Q")).toBe(true);
    expect(is_reserved_key("CmdOrCtrl+C")).toBe(true);
    expect(is_reserved_key("CmdOrCtrl+V")).toBe(true);
    expect(is_reserved_key("CmdOrCtrl+X")).toBe(true);
    expect(is_reserved_key("CmdOrCtrl+Z")).toBe(true);
    expect(is_reserved_key("CmdOrCtrl+A")).toBe(true);
    expect(is_reserved_key("Alt+F4")).toBe(true);
  });

  it("allows non-reserved combos", () => {
    expect(is_reserved_key("CmdOrCtrl+S")).toBe(false);
    expect(is_reserved_key("CmdOrCtrl+B")).toBe(false);
    expect(is_reserved_key("CmdOrCtrl+Shift+S")).toBe(false);
    expect(is_reserved_key("F12")).toBe(false);
    expect(is_reserved_key("CmdOrCtrl+Tab")).toBe(false);
  });

  it("has well-known system shortcuts in reserved list", () => {
    expect(RESERVED_KEYS).toContain("CmdOrCtrl+Q");
    expect(RESERVED_KEYS).toContain("CmdOrCtrl+C");
    expect(RESERVED_KEYS).toContain("CmdOrCtrl+V");
    expect(RESERVED_KEYS).toContain("CmdOrCtrl+X");
  });
});

describe("normalize_event_to_key", () => {
  function mock_event(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: "a",
      ...overrides,
    } as KeyboardEvent;
  }

  it("normalizes Cmd+S", () => {
    const key = normalize_event_to_key(mock_event({ metaKey: true, key: "s" }));
    expect(key).toBe("CmdOrCtrl+S");
  });

  it("normalizes Ctrl+S", () => {
    const key = normalize_event_to_key(mock_event({ ctrlKey: true, key: "s" }));
    expect(key).toBe("CmdOrCtrl+S");
  });

  it("normalizes Cmd+Shift+S", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, shiftKey: true, key: "s" }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+S");
  });

  it("normalizes Cmd+Alt+B", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, altKey: true, key: "b" }),
    );
    expect(key).toBe("CmdOrCtrl+Alt+B");
  });

  it("normalizes Cmd+Shift+Alt+K", () => {
    const key = normalize_event_to_key(
      mock_event({
        metaKey: true,
        shiftKey: true,
        altKey: true,
        key: "k",
      }),
    );
    expect(key).toBe("CmdOrCtrl+Alt+Shift+K");
  });

  it("normalizes Space key", () => {
    const key = normalize_event_to_key(mock_event({ metaKey: true, key: " " }));
    expect(key).toBe("CmdOrCtrl+Space");
  });

  it("names the + key Plus so it survives splitting on +", () => {
    const key = normalize_event_to_key(mock_event({ metaKey: true, key: "+" }));
    expect(key).toBe("CmdOrCtrl+Plus");
    expect(parse_hotkey_parts(key)).toEqual({
      modifiers: ["CmdOrCtrl"],
      base_key: "Plus",
    });
  });

  it("normalizes arrow keys", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, altKey: true, key: "ArrowLeft" }),
    );
    expect(key).toBe("CmdOrCtrl+Alt+ArrowLeft");
  });

  it("normalizes function keys", () => {
    const key = normalize_event_to_key(mock_event({ key: "F12" }));
    expect(key).toBe("F12");
  });

  it("uppercases single letter keys", () => {
    const key = normalize_event_to_key(mock_event({ metaKey: true, key: "k" }));
    expect(key).toBe("CmdOrCtrl+K");
  });
});

describe("format_hotkey_for_display", () => {
  it("replaces CmdOrCtrl with platform symbol", () => {
    const display = format_hotkey_for_display("CmdOrCtrl+S");
    expect(display).toMatch(/Ctrl\+S|⌘\+S/);
  });

  it("handles complex combos", () => {
    const display = format_hotkey_for_display("CmdOrCtrl+Shift+S");
    expect(display).toBeDefined();
    expect(display.length).toBeGreaterThan(0);
  });

  it("handles function keys", () => {
    expect(format_hotkey_for_display("F12")).toBe("F12");
  });

  it("replaces Alt with platform symbol", () => {
    const display = format_hotkey_for_display("Alt+B");
    expect(display).toMatch(/Alt\+B|⌥\+B/);
  });

  it("replaces Shift with platform symbol", () => {
    const display = format_hotkey_for_display("Shift+F5");
    expect(display).toMatch(/Shift\+F5|⇧\+F5/);
  });

  it("shows the Plus key as +", () => {
    expect(format_hotkey_for_display("Alt+Plus")).toMatch(/Alt\+\+|⌥\+\+/);
  });
});

describe("parse_hotkey_parts", () => {
  it("parses simple combo", () => {
    const { modifiers, base_key } = parse_hotkey_parts("CmdOrCtrl+S");
    expect(modifiers).toEqual(["CmdOrCtrl"]);
    expect(base_key).toBe("S");
  });

  it("parses multi-modifier combo", () => {
    const { modifiers, base_key } = parse_hotkey_parts("CmdOrCtrl+Shift+S");
    expect(modifiers).toEqual(["CmdOrCtrl", "Shift"]);
    expect(base_key).toBe("S");
  });

  it("parses function key", () => {
    const { modifiers, base_key } = parse_hotkey_parts("F12");
    expect(modifiers).toEqual([]);
    expect(base_key).toBe("F12");
  });
});

export const RESERVED_KEYS: readonly string[] = [
  "CmdOrCtrl+Q",
  "CmdOrCtrl+C",
  "CmdOrCtrl+V",
  "CmdOrCtrl+X",
  "CmdOrCtrl+Z",
  "CmdOrCtrl+A",
  "Alt+F4",
] as const;

const RESERVED_SET = new Set(RESERVED_KEYS);

const FUNCTION_KEYS = new Set([
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);

const MODIFIER_ONLY_KEYS = new Set([
  "CmdOrCtrl",
  "Ctrl",
  "Cmd",
  "Alt",
  "Shift",
  "Meta",
]);

export function is_valid_hotkey(key: string): {
  valid: boolean;
  error?: string;
} {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: "Hotkey cannot be empty" };
  }

  const parts = key.split("+");
  const base_key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);

  if (FUNCTION_KEYS.has(base_key)) {
    return { valid: true };
  }

  if (modifiers.length === 0) {
    return {
      valid: false,
      error:
        "Hotkey must include at least one modifier (Cmd/Ctrl, Alt, or Shift)",
    };
  }

  if (MODIFIER_ONLY_KEYS.has(base_key)) {
    return { valid: false, error: "Hotkey cannot be modifier-only" };
  }

  return { valid: true };
}

export function is_reserved_key(key: string): boolean {
  return RESERVED_SET.has(key);
}

export function normalize_event_to_key(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push("CmdOrCtrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  let key = event.key;
  if (key === " ") {
    key = "Space";
  } else if (key === "+") {
    // "+" separates parts in key strings, so the key itself needs a name.
    key = "Plus";
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join("+");
}

export function format_hotkey_for_display(key: string): string {
  const is_mac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");

  let display = key.replace(/CmdOrCtrl/g, is_mac ? "⌘" : "Ctrl");
  display = display.replace(/Alt/g, is_mac ? "⌥" : "Alt");
  display = display.replace(/Shift/g, is_mac ? "⇧" : "Shift");
  display = display.replace(/\bPlus\b/g, "+");

  return display;
}

export function parse_hotkey_parts(key: string): {
  modifiers: string[];
  base_key: string;
} {
  const parts = key.split("+");
  const base_key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  return { modifiers, base_key };
}

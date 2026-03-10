const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

const MAX_LENGTH = 200;

export function sanitize_note_name(name: string): string {
  let sanitized = name.trim();

  if (!sanitized) return "Untitled.md";

  sanitized = sanitized.replace(/\//g, "-");

  if (sanitized.startsWith(".")) {
    sanitized = "_" + sanitized.slice(1);
  }

  // Strip any existing extension (find last dot)
  const ext_index = sanitized.lastIndexOf(".");
  if (ext_index > 0) {
    sanitized = sanitized.slice(0, ext_index);
  }

  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.slice(0, MAX_LENGTH);
  }

  if (WINDOWS_RESERVED.has(sanitized.toLowerCase())) {
    sanitized = sanitized + "_";
  }

  return sanitized + ".md";
}

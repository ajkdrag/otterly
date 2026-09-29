// Opening these in the default app runs them. A note link can show one name
// and point at another file, so link clicks refuse them. The file tree still
// opens them, since there you see the real file name.
// @Robustness: A denylist, not every type an OS can run. It covers the common
// macOS, Windows and Linux ones.
const PROGRAM_EXTENSIONS = new Set([
  // macOS
  "app",
  "command",
  "tool",
  "terminal",
  "workflow",
  "scpt",
  "applescript",
  "pkg",
  // Windows
  "exe",
  "com",
  "bat",
  "cmd",
  "msi",
  "scr",
  "pif",
  "lnk",
  "cpl",
  "msc",
  "hta",
  "reg",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "ps1",
  // Linux and cross-platform
  "sh",
  "bash",
  "zsh",
  "run",
  "bin",
  "desktop",
  "appimage",
  "jar",
]);

export function is_program_file(path: string): boolean {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  const dot = leaf.lastIndexOf(".");
  if (dot < 0) return false;
  return PROGRAM_EXTENSIONS.has(leaf.slice(dot + 1).toLowerCase());
}

// The editor package hides its line number gutter unless this is "flex".
export function apply_editor_line_numbers(enabled: boolean): void {
  if (typeof document === "undefined") return;

  document.documentElement.style.setProperty(
    "--editor-gutter-display",
    enabled ? "flex" : "none",
  );
}

export function apply_editor_zoom(zoom: number): void {
  if (typeof document === "undefined") return;

  document.documentElement.style.setProperty("--editor-zoom", String(zoom));
}

// WebView2 on Windows cannot load a custom scheme like otterly-asset://
// directly. Tauri serves it at http://<scheme>.localhost/ there, the same way
// convertFileSrc does, so images showed "Image unavailable" on Windows.
export function custom_scheme_base(
  scheme: string,
  platform: string = typeof navigator === "undefined" ? "" : navigator.platform,
): string {
  return platform.startsWith("Win")
    ? `http://${scheme}.localhost/`
    : `${scheme}://`;
}

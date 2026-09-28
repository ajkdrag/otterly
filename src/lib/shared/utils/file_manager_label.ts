// Each OS names its file browser differently. navigator.platform is
// deprecated, but it's the simplest sync check and hotkey display uses it too.
// Node 20 (tests) has no navigator, hence the fallback.
export function reveal_in_file_manager_label(
  platform: string = globalThis.navigator?.platform ?? "",
): string {
  if (platform.startsWith("Mac")) return "Reveal in Finder";
  if (platform.startsWith("Win")) return "Show in Explorer";
  return "Show in File Manager";
}

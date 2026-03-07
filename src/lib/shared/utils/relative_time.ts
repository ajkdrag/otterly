export function format_relative_time(
  timestamp_ms: number,
  now_ms: number,
): string {
  const delta_ms = now_ms - timestamp_ms;

  if (delta_ms < 0) {
    return "just now";
  }

  const seconds = Math.floor(delta_ms / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${String(days)}d ago`;
  }

  const date = new Date(timestamp_ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
}

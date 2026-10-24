import type { ThemeColorScheme } from "$lib/shared/types/theme";

export type HSL = { h: number; s: number; l: number };

const HSL_RE = /^hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)$/i;

export function parse_hsl(
  value: string | null,
  color_scheme: ThemeColorScheme = "dark",
): HSL | null {
  if (!value) return null;
  const scheme_colors =
    /^light-dark\(\s*(hsl\([^)]+\))\s*,\s*(hsl\([^)]+\))\s*\)$/i.exec(value);
  const active_color = scheme_colors
    ? (scheme_colors[color_scheme === "light" ? 1 : 2] ?? value)
    : value;
  const m = HSL_RE.exec(active_color);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

export function format_hsl(hsl: HSL): string {
  return `hsl(${String(hsl.h)}, ${String(hsl.s)}%, ${String(hsl.l)}%)`;
}

export function resolve_font_stack(
  family: string,
  type: "sans" | "mono",
): string {
  const fallbacks =
    type === "sans"
      ? "system-ui, -apple-system, sans-serif"
      : "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  return `"${family}", ${fallbacks}`;
}

export const SANS_FONT_OPTIONS = [
  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "Inter", label: "Inter" },
  { value: "system-ui", label: "System UI" },
  { value: "SF Pro Display", label: "SF Pro" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Roboto", label: "Roboto" },
  { value: "Helvetica Neue", label: "Helvetica Neue" },
  { value: "Arial", label: "Arial" },
  { value: "Lato", label: "Lato" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Source Sans 3", label: "Source Sans" },
] as const;

export const MONO_FONT_OPTIONS = [
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "SF Mono", label: "SF Mono" },
  { value: "Cascadia Code", label: "Cascadia Code" },
  { value: "Source Code Pro", label: "Source Code Pro" },
  { value: "IBM Plex Mono", label: "IBM Plex Mono" },
  { value: "Consolas", label: "Consolas" },
  { value: "Monaco", label: "Monaco" },
  { value: "Menlo", label: "Menlo" },
  { value: "ui-monospace", label: "System Mono" },
] as const;

export const COLOR_PRESETS = [
  { value: "hsl(30, 5%, 30%)", label: "Warm Gray" },
  { value: "hsl(40, 8%, 15%)", label: "Charcoal" },
  { value: "hsl(35, 5%, 45%)", label: "Stone" },
  { value: "hsl(155, 40%, 35%)", label: "Spruce" },
  { value: "hsl(240, 30%, 35%)", label: "Indigo" },
  { value: "hsl(340, 45%, 40%)", label: "Rose" },
  { value: "hsl(190, 45%, 32%)", label: "Cyan" },
  { value: "hsl(25, 60%, 35%)", label: "Amber" },
  { value: "hsl(170, 40%, 38%)", label: "Teal" },
  { value: "hsl(45, 45%, 38%)", label: "Gold" },
  { value: "hsl(0, 0%, 95%)", label: "White" },
  { value: "hsl(0, 0%, 75%)", label: "Silver" },
] as const;

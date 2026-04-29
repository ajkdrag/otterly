import type { Theme } from "$lib/shared/types/theme";
import { resolve_font_stack } from "$lib/shared/utils/theme_helpers";

const SPACING_MAP: Record<string, string> = {
  compact: "1rem",
  normal: "1.5rem",
  spacious: "2rem",
};

const HEADING_COLOR_MAP: Record<string, string> = {
  inherit: "var(--foreground)",
  primary: "var(--primary)",
  accent: "var(--accent-foreground)",
};

const BOLD_WEIGHT_MAP: Record<string, string> = {
  default: "600",
  heavier: "700",
  "color-accent": "600",
};

const THEME_CACHE_KEY = "leapgrownotes_active_theme_cache";

function apply_optional(
  entries: [string, string][],
  key: string,
  value: string | null,
): void {
  if (value) entries.push([key, value]);
}

function build_token_entries(theme: Theme): [string, string][] {
  const entries: [string, string][] = [
    ["--accent-hue", String(theme.accent_hue)],
    ["--accent-chroma", String(theme.accent_chroma)],
    ["--font-family-sans", resolve_font_stack(theme.font_family_sans, "sans")],
    ["--font-family-mono", resolve_font_stack(theme.font_family_mono, "mono")],
    ["--font-sans", resolve_font_stack(theme.font_family_sans, "sans")],
    ["--font-mono", resolve_font_stack(theme.font_family_mono, "mono")],
    ["--editor-font-size", `${String(theme.font_size)}rem`],
    ["--editor-line-height", String(theme.line_height)],
    ["--editor-spacing", SPACING_MAP[theme.spacing] ?? "1.5rem"],
    ["--editor-paragraph-spacing", `${String(theme.paragraph_spacing)}rem`],
    [
      "--editor-heading-color",
      HEADING_COLOR_MAP[theme.heading_color] ?? "var(--foreground)",
    ],
    ["--editor-heading-weight", String(theme.heading_font_weight)],
    ["--editor-bold-weight", BOLD_WEIGHT_MAP[theme.bold_style] ?? "600"],

    // Heading sizes
    ["--editor-heading-1", `${String(theme.heading_1_size)}em`],
    ["--editor-heading-2", `${String(theme.heading_2_size)}em`],
    ["--editor-heading-3", `${String(theme.heading_3_size)}em`],
    ["--editor-heading-4", `${String(theme.heading_4_size)}em`],
    ["--editor-heading-5", `${String(theme.heading_5_size)}em`],
    ["--editor-heading-6", `${String(theme.heading_6_size)}em`],

    // Layout
    ["--editor-padding-x", `${String(theme.editor_padding_x)}rem`],
    ["--editor-padding-y", `${String(theme.editor_padding_y)}rem`],

    // Code block radius
    [
      "--editor-code-radius",
      `calc(var(--radius) * ${String(theme.code_block_radius)})`,
    ],

    // Table cell padding
    ["--editor-table-cell-padding", String(theme.table_cell_padding)],
  ];

  if (theme.bold_style === "color-accent") {
    entries.push(["--editor-bold-color", "var(--primary)"]);
  } else {
    apply_optional(entries, "--editor-bold-color", theme.bold_color);
  }

  if (theme.blockquote_style === "minimal") {
    entries.push(["--editor-blockquote-bg", "transparent"]);
  } else if (theme.blockquote_style === "accent-bar") {
    entries.push(["--editor-blockquote-border", "var(--primary)"]);
  }

  if (theme.code_block_style === "borderless") {
    entries.push(["--editor-code-border", "transparent"]);
  } else if (theme.code_block_style === "filled") {
    entries.push([
      "--editor-code-bg",
      "color-mix(in oklch, var(--muted) 80%, transparent)",
    ]);
  }

  apply_optional(entries, "--editor-text", theme.editor_text_color);
  apply_optional(entries, "--editor-italic-color", theme.italic_color);
  apply_optional(entries, "--editor-link", theme.link_color);
  apply_optional(
    entries,
    "--editor-blockquote-border",
    theme.blockquote_border_color,
  );
  apply_optional(entries, "--editor-blockquote-bg", theme.blockquote_bg_color);
  apply_optional(
    entries,
    "--editor-blockquote-text",
    theme.blockquote_text_color,
  );
  apply_optional(entries, "--editor-code-bg", theme.code_block_bg);
  apply_optional(
    entries,
    "--editor-code-block-text",
    theme.code_block_text_color,
  );
  apply_optional(entries, "--editor-code-inline-bg", theme.inline_code_bg);
  apply_optional(
    entries,
    "--editor-code-inline-text",
    theme.inline_code_text_color,
  );
  apply_optional(entries, "--editor-mark-bg", theme.highlight_bg);
  apply_optional(entries, "--editor-mark-text", theme.highlight_text_color);
  apply_optional(entries, "--editor-selection-bg", theme.selection_bg);
  apply_optional(entries, "--caret-color", theme.caret_color);
  apply_optional(entries, "--editor-table-border", theme.table_border_color);
  apply_optional(entries, "--editor-table-header-bg", theme.table_header_bg);

  for (const [key, value] of Object.entries(theme.token_overrides)) {
    entries.push([key.startsWith("--") ? key : `--${key}`, value]);
  }

  return entries;
}

let applied_property_keys: string[] = [];

export function apply_theme(theme: Theme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  for (const key of applied_property_keys) {
    root.style.removeProperty(key);
  }

  root.setAttribute("data-color-scheme", theme.color_scheme);
  root.style.setProperty("color-scheme", theme.color_scheme);

  const entries = build_token_entries(theme);
  applied_property_keys = entries.map(([k]) => k);

  for (const [key, value] of entries) {
    root.style.setProperty(key, value);
  }

  cache_theme_for_fouc(theme, entries);
}

function cache_theme_for_fouc(theme: Theme, entries: [string, string][]): void {
  try {
    const cache = {
      color_scheme: theme.color_scheme,
      tokens: Object.fromEntries(entries),
    };
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage may be unavailable
  }
}

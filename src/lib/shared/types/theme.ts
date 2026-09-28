export type ThemeColorScheme = "dark" | "light";

export type ThemeSpacing = "compact" | "normal" | "spacious";

export type ThemeHeadingColor = "inherit" | "primary" | "accent";

export type ThemeBoldStyle = "default" | "heavier" | "color-accent";

export type ThemeBlockquoteStyle = "default" | "minimal" | "accent-bar";

export type ThemeCodeBlockStyle = "default" | "borderless" | "filled";

export type Theme = {
  id: string;
  name: string;
  color_scheme: ThemeColorScheme;
  is_builtin: boolean;

  accent_hue: number;
  accent_chroma: number;
  font_family_sans: string;
  font_family_mono: string;

  font_size: number;
  line_height: number;
  paragraph_spacing: number;
  spacing: ThemeSpacing;
  heading_color: ThemeHeadingColor;
  heading_font_weight: number;
  heading_1_size: number;
  heading_2_size: number;
  heading_3_size: number;
  heading_4_size: number;
  heading_5_size: number;
  heading_6_size: number;

  editor_padding_x: number;
  editor_padding_y: number;

  bold_style: ThemeBoldStyle;
  blockquote_style: ThemeBlockquoteStyle;
  code_block_style: ThemeCodeBlockStyle;

  editor_text_color: string | null;
  bold_color: string | null;
  italic_color: string | null;
  link_color: string | null;
  blockquote_border_color: string | null;
  blockquote_text_color: string | null;
  blockquote_bg_color: string | null;
  code_block_bg: string | null;
  code_block_text_color: string | null;
  code_block_radius: number;
  inline_code_bg: string | null;
  inline_code_text_color: string | null;
  highlight_bg: string | null;
  highlight_text_color: string | null;
  selection_bg: string | null;
  caret_color: string | null;
  table_border_color: string | null;
  table_header_bg: string | null;
  table_cell_padding: number;

  token_overrides: Record<string, string>;
};

const SHARED_DEFAULTS: Omit<
  Theme,
  "id" | "name" | "color_scheme" | "is_builtin"
> = {
  accent_hue: 155,
  accent_chroma: 0.11,
  font_family_sans: "IBM Plex Sans",
  font_family_mono: "IBM Plex Mono",
  font_size: 1.0,
  line_height: 1.7,
  paragraph_spacing: 1.25,
  spacing: "normal",
  heading_color: "inherit",
  heading_font_weight: 500,
  heading_1_size: 2,
  heading_2_size: 1.375,
  heading_3_size: 1.125,
  heading_4_size: 1.0625,
  heading_5_size: 1.0,
  heading_6_size: 0.875,
  editor_padding_x: 2,
  editor_padding_y: 3,
  bold_style: "default",
  blockquote_style: "default",
  code_block_style: "default",
  editor_text_color: null,
  bold_color: null,
  italic_color: null,
  link_color: null,
  blockquote_border_color: null,
  blockquote_text_color: null,
  blockquote_bg_color: null,
  code_block_bg: null,
  code_block_text_color: null,
  code_block_radius: 0.5,
  inline_code_bg: null,
  inline_code_text_color: null,
  highlight_bg: null,
  highlight_text_color: null,
  selection_bg: null,
  caret_color: null,
  table_border_color: null,
  table_header_bg: null,
  table_cell_padding: 0.65,
  token_overrides: {
    "--editor-heading-font": "var(--font-heading)",
  },
};

export const BUILTIN_NORDIC_LIGHT: Theme = {
  id: "nordic-light",
  name: "Nordic Light",
  color_scheme: "light",
  is_builtin: true,
  ...SHARED_DEFAULTS,
};

export const BUILTIN_NORDIC_DARK: Theme = {
  id: "nordic-dark",
  name: "Nordic Dark",
  color_scheme: "dark",
  is_builtin: true,
  ...SHARED_DEFAULTS,
};

// Mocha uses Latte colors when a copied theme switches to a light base.
export const BUILTIN_MOCHA: Theme = {
  ...SHARED_DEFAULTS,
  id: "mocha",
  name: "Mocha",
  color_scheme: "dark",
  is_builtin: true,
  accent_hue: 264,
  accent_chroma: 0.12,
  editor_text_color: "light-dark(hsl(234, 16%, 35%), hsl(226, 64%, 88%))",
  code_block_bg: "light-dark(hsl(220, 22%, 92%), hsl(240, 21%, 12%))",
  code_block_text_color: "light-dark(hsl(234, 16%, 35%), hsl(226, 64%, 88%))",
  inline_code_bg: "light-dark(hsl(223, 16%, 83%), hsl(237, 16%, 23%))",
  inline_code_text_color: "light-dark(hsl(316, 48%, 32%), hsl(316, 72%, 86%))",
  blockquote_border_color: "light-dark(hsl(231, 97%, 72%), hsl(232, 97%, 85%))",
  blockquote_text_color: "light-dark(hsl(233, 13%, 41%), hsl(227, 35%, 80%))",
  highlight_bg: "light-dark(hsl(41, 86%, 83%), hsl(234, 13%, 31%))",
  highlight_text_color: "light-dark(hsl(35, 70%, 25%), hsl(41, 86%, 83%))",
  selection_bg: "light-dark(hsl(225, 14%, 77%), hsl(234, 13%, 31%))",
  token_overrides: {
    ...SHARED_DEFAULTS.token_overrides,
    "--background": "light-dark(#eff1f5, #1e1e2e)",
    "--foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--card": "light-dark(#eff1f5, #1e1e2e)",
    "--card-foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--popover": "light-dark(#eff1f5, #1e1e2e)",
    "--popover-foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--secondary": "light-dark(#ccd0da, #313244)",
    "--secondary-foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--muted": "light-dark(#ccd0da, #313244)",
    "--muted-foreground": "light-dark(#6c6f85, #a6adc8)",
    "--border": "light-dark(#bcc0cc, #45475a)",
    "--input": "light-dark(#acb0be, #585b70)",
    "--destructive": "light-dark(#d20f39, #f38ba8)",
    "--sidebar": "light-dark(#e6e9ef, #181825)",
    "--sidebar-foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--sidebar-primary": "var(--primary)",
    "--sidebar-primary-foreground": "var(--primary-foreground)",
    "--sidebar-accent": "light-dark(#ccd0da, #313244)",
    "--sidebar-accent-foreground": "light-dark(#4c4f69, #cdd6f4)",
    "--sidebar-border": "light-dark(#ccd0da, #313244)",
    "--background-surface-2": "light-dark(#e6e9ef, #181825)",
    "--background-surface-3": "light-dark(#ccd0da, #313244)",
    "--foreground-tertiary": "light-dark(#6c6f85, #a6adc8)",
    "--border-strong": "light-dark(#9ca0b0, #6c7086)",
    "--border-subtle": "light-dark(#ccd0da, #313244)",
    "--accent-hover": "light-dark(#bcc0cc, #45475a)",
    "--primary": "var(--interactive)",
    "--primary-foreground": "light-dark(#eff1f5, #11111b)",
    "--accent": "light-dark(#ccd0da, #313244)",
    "--accent-foreground": "light-dark(#4c4f69, #cdd6f4)",
    // Keep the accent controls useful when this theme is duplicated.
    "--interactive":
      "light-dark(oklch(0.48 var(--accent-chroma) var(--accent-hue)), oklch(0.77 var(--accent-chroma) var(--accent-hue)))",
    "--interactive-hover":
      "light-dark(oklch(0.43 var(--accent-chroma) var(--accent-hue)), oklch(0.83 var(--accent-chroma) var(--accent-hue)))",
    "--interactive-muted":
      "light-dark(oklch(0.5 0.06 var(--accent-hue)), oklch(0.72 0.06 var(--accent-hue)))",
    "--interactive-bg":
      "color-mix(in oklch, var(--interactive) 14%, var(--background))",
    "--interactive-bg-hover":
      "color-mix(in oklch, var(--interactive) 22%, var(--background))",
    "--interactive-text-on-bg": "var(--interactive)",
    "--interactive-text-subtle": "var(--interactive)",
    "--interactive-border": "var(--interactive)",
    "--interactive-border-subtle": "light-dark(#bcc0cc, #45475a)",
    "--interactive-border-strong": "var(--interactive)",
    "--focus-ring": "var(--interactive)",
    "--focus-ring-offset": "light-dark(#eff1f5, #1e1e2e)",
    "--selection-bg": "light-dark(#bcc0cc, #45475a)",
    "--warning": "light-dark(#df8e1d, #f9e2af)",
    "--warning-bg": "light-dark(#ccd0da, #313244)",
    "--warning-text-on-bg": "light-dark(#6c4213, #f9e2af)",
    "--warning-border": "light-dark(#acb0be, #585b70)",
    "--indicator-dirty": "light-dark(#fe640b, #fab387)",
    "--indicator-clean": "light-dark(#40a02b, #a6e3a1)",
    "--scrollbar-thumb": "light-dark(#bcc0cc, #45475a)",
    "--scrollbar-thumb-hover": "light-dark(#acb0be, #585b70)",
    "--shadow-color": "#11111b",
    "--syntax-comment": "light-dark(#5c5f77, #a6adc8)",
    "--syntax-punctuation": "light-dark(#5c5f77, #bac2de)",
    "--syntax-property": "light-dark(#1c6f87, #89dceb)",
    "--syntax-string": "light-dark(#2e7520, #a6e3a1)",
    "--syntax-operator": "light-dark(#1c6f87, #89dceb)",
    "--syntax-keyword": "light-dark(#8435eb, #cba6f7)",
    "--syntax-function": "light-dark(#1b54bd, #89b4fa)",
    "--syntax-variable": "light-dark(#4c4f69, #cdd6f4)",
    "--syntax-class": "light-dark(#89600b, #f9e2af)",
    "--syntax-number": "light-dark(#a04b16, #fab387)",
    "--syntax-boolean": "light-dark(#a04b16, #fab387)",
    "--syntax-tag": "light-dark(#b20c31, #f38ba8)",
    "--syntax-regex": "light-dark(#8f3778, #f5c2e7)",
    "--editor-heading-font": "var(--font-heading)",
  },
};
export const BUILTIN_THEMES: readonly Theme[] = [
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_LIGHT,
  BUILTIN_NORDIC_DARK,
];

export const DEFAULT_THEME_ID = BUILTIN_MOCHA.id;

export function get_all_themes(user_themes: Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...user_themes];
}

export function resolve_theme(all_themes: Theme[], active_id: string): Theme {
  return all_themes.find((t) => t.id === active_id) ?? BUILTIN_MOCHA;
}

export function create_user_theme(name: string, base: Theme): Theme {
  return {
    ...base,
    id: crypto.randomUUID(),
    name,
    is_builtin: false,
  };
}

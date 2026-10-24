import type { Theme } from "$lib/shared/types/theme";

export type ThemeStyleCategory =
  | "interface"
  | "typography"
  | "layout"
  | "headings"
  | "bold_italic"
  | "blockquotes"
  | "inline_code"
  | "code_blocks"
  | "links_highlights"
  | "tables";

export type ThemeStyleControl = "slider" | "select" | "color" | "font_select";

export type ThemeStyleDescriptor = {
  id: string;
  theme_key: keyof Theme;
  label: string;
  description: string;
  category: ThemeStyleCategory;
  control: ThemeStyleControl;
  tags: string[];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  format_value?: (v: number) => string;
  // A slider that also takes null, meaning "not set by the theme". Only
  // editor_max_width_ch has it, where null means the Layout setting decides.
  nullable?: boolean;
};

export const STYLE_CATEGORY_ORDER: ThemeStyleCategory[] = [
  "interface",
  "typography",
  "layout",
  "headings",
  "bold_italic",
  "blockquotes",
  "inline_code",
  "code_blocks",
  "links_highlights",
  "tables",
];

export const STYLE_CATEGORY_LABELS: Record<ThemeStyleCategory, string> = {
  interface: "Interface",
  typography: "Typography",
  layout: "Layout",
  headings: "Headings",
  bold_italic: "Bold & Italic",
  blockquotes: "Blockquotes",
  inline_code: "Inline Code",
  code_blocks: "Code Blocks",
  links_highlights: "Links & Highlights",
  tables: "Tables",
};

export const STYLE_DESCRIPTORS: ThemeStyleDescriptor[] = [
  // ── Interface ──
  {
    id: "color_scheme",
    theme_key: "color_scheme",
    label: "Base",
    description: "Light or dark color scheme",
    category: "interface",
    control: "select",
    tags: ["mode", "dark", "light", "theme", "base"],
    options: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    id: "font_family_sans",
    theme_key: "font_family_sans",
    label: "Sans Font",
    description: "Font family for body text and headings",
    category: "interface",
    control: "font_select",
    tags: ["font", "family", "sans", "serif", "body", "text", "typeface"],
  },
  {
    id: "font_family_mono",
    theme_key: "font_family_mono",
    label: "Mono Font",
    description: "Monospace font for code blocks and inline code",
    category: "interface",
    control: "font_select",
    tags: ["font", "family", "mono", "monospace", "code", "typeface"],
  },
  {
    id: "accent_hue",
    theme_key: "accent_hue",
    label: "Accent Color",
    description: "Hue angle for the accent color",
    category: "interface",
    control: "slider",
    tags: ["accent", "color", "hue", "tint"],
    min: 0,
    max: 360,
    step: 1,
    unit: "\u00B0",
  },
  {
    id: "accent_chroma",
    theme_key: "accent_chroma",
    label: "Color Intensity",
    description: "Saturation/chroma of the accent color",
    category: "interface",
    control: "slider",
    tags: ["accent", "intensity", "chroma", "saturation", "vivid"],
    min: 0.02,
    max: 0.3,
    step: 0.01,
  },
  {
    id: "ui_radius",
    theme_key: "ui_radius",
    label: "Corner Radius",
    description: "Corner rounding for buttons, inputs, menus and dialogs",
    category: "interface",
    control: "slider",
    tags: ["radius", "rounded", "corner", "round", "interface"],
    min: 0,
    max: 1.25,
    step: 0.0625,
    unit: "rem",
  },
  {
    id: "ui_density",
    theme_key: "ui_density",
    label: "Density",
    description: "Row height in the file tree",
    category: "interface",
    control: "select",
    tags: ["density", "compact", "comfortable", "row", "tree", "sidebar"],
    options: [
      { value: "compact", label: "Compact" },
      { value: "normal", label: "Normal" },
      { value: "comfortable", label: "Comfortable" },
    ],
  },

  // ── Typography ──
  {
    id: "font_size",
    theme_key: "font_size",
    label: "Font Size",
    description: "Base font size for editor text",
    category: "typography",
    control: "slider",
    tags: ["font", "size", "text", "body", "base"],
    min: 0.875,
    max: 1.25,
    step: 0.0625,
    unit: "rem",
  },
  {
    id: "line_height",
    theme_key: "line_height",
    label: "Line Height",
    description: "Vertical spacing between lines of text",
    category: "typography",
    control: "slider",
    tags: ["line", "height", "leading", "spacing", "vertical"],
    min: 1.5,
    max: 2.0,
    step: 0.05,
  },
  {
    id: "paragraph_spacing",
    theme_key: "paragraph_spacing",
    label: "Paragraph Spacing",
    description: "Space below paragraphs and between blocks",
    category: "typography",
    control: "slider",
    tags: ["paragraph", "spacing", "margin", "gap", "block"],
    min: 0.5,
    max: 3.0,
    step: 0.125,
    unit: "rem",
  },
  {
    id: "heading_spacing_after",
    theme_key: "heading_spacing_after",
    label: "Space After Headings",
    description: "Scales the space below headings (1 = default)",
    category: "typography",
    control: "slider",
    tags: ["heading", "spacing", "margin", "gap", "below"],
    min: 0,
    max: 2.5,
    step: 0.125,
  },
  {
    id: "list_item_spacing",
    theme_key: "list_item_spacing",
    label: "List Item Spacing",
    description: "Space between bullet and numbered list items",
    category: "typography",
    control: "slider",
    tags: ["list", "bullet", "item", "spacing", "gap"],
    min: 0,
    max: 1.5,
    step: 0.125,
    unit: "rem",
  },
  {
    id: "spacing",
    theme_key: "spacing",
    label: "Content Spacing",
    description: "Overall spacing density preset",
    category: "typography",
    control: "select",
    tags: ["spacing", "density", "compact", "spacious", "content"],
    options: [
      { value: "compact", label: "Compact" },
      { value: "normal", label: "Normal" },
      { value: "spacious", label: "Spacious" },
    ],
  },
  {
    id: "editor_text_color",
    theme_key: "editor_text_color",
    label: "Body Text",
    description: "Color for the main editor body text",
    category: "typography",
    control: "color",
    tags: ["text", "body", "color", "foreground"],
  },
  {
    id: "link_color",
    theme_key: "link_color",
    label: "Links",
    description: "Color for hyperlinks and wiki links",
    category: "typography",
    control: "color",
    tags: ["link", "url", "hyperlink", "wiki", "color"],
  },

  // ── Layout ──
  {
    id: "editor_padding_x",
    theme_key: "editor_padding_x",
    label: "Horizontal Padding",
    description: "Left and right padding inside the editor",
    category: "layout",
    control: "slider",
    tags: ["padding", "horizontal", "left", "right", "margin", "editor"],
    min: 0.5,
    max: 6,
    step: 0.25,
    unit: "rem",
  },
  {
    id: "editor_padding_y",
    theme_key: "editor_padding_y",
    label: "Vertical Padding",
    description: "Top and bottom padding inside the editor",
    category: "layout",
    control: "slider",
    tags: ["padding", "vertical", "top", "bottom", "margin", "editor"],
    min: 0.5,
    max: 6,
    step: 0.25,
    unit: "rem",
  },
  {
    id: "editor_max_width_ch",
    theme_key: "editor_max_width_ch",
    label: "Editor Max Width",
    description:
      "Maximum line width in characters. Unset uses the Layout setting",
    category: "layout",
    control: "slider",
    tags: ["width", "max", "line", "length", "measure", "editor", "column"],
    min: 60,
    max: 140,
    step: 5,
    unit: "ch",
    nullable: true,
  },

  // ── Headings ──
  {
    id: "heading_color",
    theme_key: "heading_color",
    label: "Color",
    description: "Color preset for all headings",
    category: "headings",
    control: "select",
    tags: ["heading", "header", "color", "h1", "h2", "h3"],
    options: [
      { value: "inherit", label: "Inherit" },
      { value: "primary", label: "Primary" },
      { value: "accent", label: "Accent" },
    ],
  },
  {
    id: "heading_font_weight",
    theme_key: "heading_font_weight",
    label: "Weight",
    description: "Font weight for all headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "header", "weight", "bold", "semibold"],
    min: 300,
    max: 700,
    step: 100,
  },
  {
    id: "heading_1_size",
    theme_key: "heading_1_size",
    label: "H1 Size",
    description: "Font size for level-1 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h1", "size", "title"],
    min: 1.25,
    max: 2.5,
    step: 0.0625,
    unit: "em",
  },
  {
    id: "heading_2_size",
    theme_key: "heading_2_size",
    label: "H2 Size",
    description: "Font size for level-2 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h2", "size", "subtitle"],
    min: 1.0,
    max: 2.0,
    step: 0.0625,
    unit: "em",
  },
  {
    id: "heading_3_size",
    theme_key: "heading_3_size",
    label: "H3 Size",
    description: "Font size for level-3 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h3", "size"],
    min: 0.875,
    max: 1.75,
    step: 0.0625,
    unit: "em",
  },
  {
    id: "heading_4_size",
    theme_key: "heading_4_size",
    label: "H4 Size",
    description: "Font size for level-4 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h4", "size"],
    min: 0.875,
    max: 1.5,
    step: 0.0625,
    unit: "em",
  },
  {
    id: "heading_5_size",
    theme_key: "heading_5_size",
    label: "H5 Size",
    description: "Font size for level-5 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h5", "size"],
    min: 0.75,
    max: 1.25,
    step: 0.0625,
    unit: "em",
  },
  {
    id: "heading_6_size",
    theme_key: "heading_6_size",
    label: "H6 Size",
    description: "Font size for level-6 headings",
    category: "headings",
    control: "slider",
    tags: ["heading", "h6", "size"],
    min: 0.75,
    max: 1.125,
    step: 0.0625,
    unit: "em",
  },

  // ── Bold & Italic ──
  {
    id: "bold_style",
    theme_key: "bold_style",
    label: "Bold Style",
    description: "How bold text is rendered",
    category: "bold_italic",
    control: "select",
    tags: ["bold", "strong", "weight", "style"],
    options: [
      { value: "default", label: "Default (600)" },
      { value: "heavier", label: "Heavy (700)" },
      { value: "color-accent", label: "Accent Color" },
    ],
  },
  {
    id: "bold_color",
    theme_key: "bold_color",
    label: "Bold Color",
    description: "Custom color for bold text",
    category: "bold_italic",
    control: "color",
    tags: ["bold", "strong", "color"],
  },
  {
    id: "italic_color",
    theme_key: "italic_color",
    label: "Italic Color",
    description: "Custom color for italic text",
    category: "bold_italic",
    control: "color",
    tags: ["italic", "emphasis", "color"],
  },

  // ── Blockquotes ──
  {
    id: "blockquote_style",
    theme_key: "blockquote_style",
    label: "Style",
    description: "Blockquote visual style preset",
    category: "blockquotes",
    control: "select",
    tags: ["blockquote", "quote", "style", "callout"],
    options: [
      { value: "default", label: "Default" },
      { value: "minimal", label: "Minimal (no bg)" },
      { value: "accent-bar", label: "Accent Bar" },
    ],
  },
  {
    id: "blockquote_border_color",
    theme_key: "blockquote_border_color",
    label: "Border",
    description: "Left border color for blockquotes",
    category: "blockquotes",
    control: "color",
    tags: ["blockquote", "quote", "border", "color"],
  },
  {
    id: "blockquote_bg_color",
    theme_key: "blockquote_bg_color",
    label: "Background",
    description: "Background color for blockquotes",
    category: "blockquotes",
    control: "color",
    tags: ["blockquote", "quote", "background", "bg"],
  },
  {
    id: "blockquote_text_color",
    theme_key: "blockquote_text_color",
    label: "Text",
    description: "Text color inside blockquotes",
    category: "blockquotes",
    control: "color",
    tags: ["blockquote", "quote", "text", "color"],
  },

  // ── Inline Code ──
  {
    id: "inline_code_bg",
    theme_key: "inline_code_bg",
    label: "Background",
    description: "Background color for inline code spans",
    category: "inline_code",
    control: "color",
    tags: ["inline", "code", "background", "bg", "backtick"],
  },
  {
    id: "inline_code_text_color",
    theme_key: "inline_code_text_color",
    label: "Text",
    description: "Text color for inline code spans",
    category: "inline_code",
    control: "color",
    tags: ["inline", "code", "text", "color"],
  },

  // ── Code Blocks ──
  {
    id: "code_block_style",
    theme_key: "code_block_style",
    label: "Style",
    description: "Code block visual style preset",
    category: "code_blocks",
    control: "select",
    tags: ["code", "block", "fenced", "style", "pre"],
    options: [
      { value: "default", label: "Default" },
      { value: "borderless", label: "Borderless" },
      { value: "filled", label: "Filled" },
    ],
  },
  {
    id: "code_block_bg",
    theme_key: "code_block_bg",
    label: "Background",
    description: "Background color for fenced code blocks",
    category: "code_blocks",
    control: "color",
    tags: ["code", "block", "background", "bg", "fenced", "pre"],
  },
  {
    id: "code_block_text_color",
    theme_key: "code_block_text_color",
    label: "Text",
    description: "Text color inside fenced code blocks",
    category: "code_blocks",
    control: "color",
    tags: ["code", "block", "text", "color", "fenced"],
  },
  {
    id: "code_block_radius",
    theme_key: "code_block_radius",
    label: "Border Radius",
    description: "Corner rounding for code blocks",
    category: "code_blocks",
    control: "slider",
    tags: ["code", "block", "radius", "rounded", "corner"],
    min: 0,
    max: 1.5,
    step: 0.125,
    unit: "\u00D7",
    format_value: (v: number) => `${String(v)}\u00D7`,
  },

  // ── Links & Highlights ──
  {
    id: "highlight_bg",
    theme_key: "highlight_bg",
    label: "Highlight Background",
    description: "Background color for highlighted/marked text",
    category: "links_highlights",
    control: "color",
    tags: ["highlight", "mark", "background", "bg", "yellow"],
  },
  {
    id: "highlight_text_color",
    theme_key: "highlight_text_color",
    label: "Highlight Text",
    description: "Text color for highlighted/marked text",
    category: "links_highlights",
    control: "color",
    tags: ["highlight", "mark", "text", "color"],
  },
  {
    id: "selection_bg",
    theme_key: "selection_bg",
    label: "Selection Color",
    description: "Background color when selecting text",
    category: "links_highlights",
    control: "color",
    tags: ["selection", "select", "highlight", "cursor", "background"],
  },
  {
    id: "caret_color",
    theme_key: "caret_color",
    label: "Caret Color",
    description: "Color of the text cursor/caret",
    category: "links_highlights",
    control: "color",
    tags: ["caret", "cursor", "blink", "color"],
  },

  // ── Tables ──
  {
    id: "table_border_color",
    theme_key: "table_border_color",
    label: "Border",
    description: "Border color for table cells and outlines",
    category: "tables",
    control: "color",
    tags: ["table", "border", "grid", "cell", "color"],
  },
  {
    id: "table_header_bg",
    theme_key: "table_header_bg",
    label: "Header Background",
    description: "Background color for table header row",
    category: "tables",
    control: "color",
    tags: ["table", "header", "th", "background", "bg"],
  },
  {
    id: "table_cell_padding",
    theme_key: "table_cell_padding",
    label: "Cell Padding",
    description: "Internal padding for table cells",
    category: "tables",
    control: "slider",
    tags: ["table", "cell", "padding", "spacing", "td"],
    min: 0.25,
    max: 1.5,
    step: 0.05,
    unit: "\u00D7",
    format_value: (v: number) => `${String(v)}\u00D7`,
  },
];

export function get_descriptors_by_category(): Map<
  ThemeStyleCategory,
  ThemeStyleDescriptor[]
> {
  const grouped = new Map<ThemeStyleCategory, ThemeStyleDescriptor[]>();
  for (const desc of STYLE_DESCRIPTORS) {
    const list = grouped.get(desc.category) ?? [];
    list.push(desc);
    grouped.set(desc.category, list);
  }
  return grouped;
}

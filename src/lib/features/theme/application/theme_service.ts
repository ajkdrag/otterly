import type { SettingsPort } from "$lib/features/settings";
import type { OpStore } from "$lib/app";
import type { Theme } from "$lib/shared/types/theme";
import {
  DEFAULT_THEME_ID,
  BUILTIN_NORDIC_DARK,
  create_user_theme,
} from "$lib/shared/types/theme";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("theme_service");

const THEMES_KEY = "user_themes";
const ACTIVE_THEME_ID_KEY = "active_theme_id";

export type ThemeLoadResult = {
  user_themes: Theme[];
  active_theme_id: string;
};

export class ThemeService {
  constructor(
    private readonly settings_port: SettingsPort,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  async load_themes(): Promise<ThemeLoadResult> {
    this.op_store.start("theme.load", this.now_ms());
    try {
      const [stored_themes, stored_id] = await Promise.all([
        this.settings_port.get_setting<unknown>(THEMES_KEY),
        this.settings_port.get_setting<unknown>(ACTIVE_THEME_ID_KEY),
      ]);

      const user_themes = parse_stored_themes(stored_themes);
      const active_theme_id =
        typeof stored_id === "string" ? stored_id : DEFAULT_THEME_ID;

      this.op_store.succeed("theme.load");
      return { user_themes, active_theme_id };
    } catch (error) {
      const msg = error_message(error);
      log.error("Load themes failed", { error: msg });
      this.op_store.fail("theme.load", msg);
      return { user_themes: [], active_theme_id: DEFAULT_THEME_ID };
    }
  }

  async save_user_themes(themes: Theme[]): Promise<void> {
    try {
      const serializable = themes.filter((t) => !t.is_builtin);
      await this.settings_port.set_setting(THEMES_KEY, serializable);
    } catch (error) {
      log.error("Save themes failed", { error: error_message(error) });
    }
  }

  async save_active_theme_id(id: string): Promise<void> {
    try {
      await this.settings_port.set_setting(ACTIVE_THEME_ID_KEY, id);
    } catch (error) {
      log.error("Save active theme ID failed", {
        error: error_message(error),
      });
    }
  }

  duplicate_theme(name: string, base: Theme): Theme {
    return create_user_theme(name, base);
  }
}

function parse_stored_themes(raw: unknown): Theme[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter(is_theme_record).map(normalize_theme);
}

function is_theme_record(entry: unknown): entry is Record<string, unknown> {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.color_scheme === "dark" || candidate.color_scheme === "light") &&
    typeof candidate.accent_hue === "number"
  );
}

function normalize_theme(raw: Record<string, unknown>): Theme {
  const defaults = BUILTIN_NORDIC_DARK;
  return {
    id: raw.id as string,
    name: raw.name as string,
    color_scheme: raw.color_scheme as Theme["color_scheme"],
    is_builtin: raw.is_builtin === true,

    accent_hue: num(raw.accent_hue, defaults.accent_hue),
    accent_chroma: num(raw.accent_chroma, defaults.accent_chroma),
    font_family_sans: str(raw.font_family_sans, defaults.font_family_sans),
    font_family_mono: str(raw.font_family_mono, defaults.font_family_mono),

    font_size: num(raw.font_size, defaults.font_size),
    line_height: num(raw.line_height, defaults.line_height),
    paragraph_spacing: num(raw.paragraph_spacing, defaults.paragraph_spacing),
    heading_spacing_after: num(
      raw.heading_spacing_after,
      defaults.heading_spacing_after,
    ),
    list_item_spacing: num(raw.list_item_spacing, defaults.list_item_spacing),
    spacing: enum_val(
      raw.spacing,
      ["compact", "normal", "spacious"],
      defaults.spacing,
    ),
    heading_color: enum_val(
      raw.heading_color,
      ["inherit", "primary", "accent"],
      defaults.heading_color,
    ),
    heading_font_weight: num(
      raw.heading_font_weight,
      defaults.heading_font_weight,
    ),
    heading_1_size: num(raw.heading_1_size, defaults.heading_1_size),
    heading_2_size: num(raw.heading_2_size, defaults.heading_2_size),
    heading_3_size: num(raw.heading_3_size, defaults.heading_3_size),
    heading_4_size: num(raw.heading_4_size, defaults.heading_4_size),
    heading_5_size: num(raw.heading_5_size, defaults.heading_5_size),
    heading_6_size: num(raw.heading_6_size, defaults.heading_6_size),

    editor_padding_x: num(raw.editor_padding_x, defaults.editor_padding_x),
    editor_padding_y: num(raw.editor_padding_y, defaults.editor_padding_y),
    editor_max_width_ch: nullable_num(raw.editor_max_width_ch),

    ui_radius: num(raw.ui_radius, defaults.ui_radius),
    ui_density: enum_val(
      raw.ui_density,
      ["compact", "normal", "comfortable"],
      defaults.ui_density,
    ),

    bold_style: enum_val(
      raw.bold_style,
      ["default", "heavier", "color-accent"],
      defaults.bold_style,
    ),
    blockquote_style: enum_val(
      raw.blockquote_style,
      ["default", "minimal", "accent-bar"],
      defaults.blockquote_style,
    ),
    code_block_style: enum_val(
      raw.code_block_style,
      ["default", "borderless", "filled"],
      defaults.code_block_style,
    ),

    editor_text_color: nullable_str(raw.editor_text_color),
    bold_color: nullable_str(raw.bold_color),
    italic_color: nullable_str(raw.italic_color),
    link_color: nullable_str(raw.link_color),
    blockquote_border_color: nullable_str(raw.blockquote_border_color),
    blockquote_text_color: nullable_str(raw.blockquote_text_color),
    blockquote_bg_color: nullable_str(raw.blockquote_bg_color),
    code_block_bg: nullable_str(raw.code_block_bg),
    code_block_text_color: nullable_str(raw.code_block_text_color),
    code_block_radius: num(raw.code_block_radius, defaults.code_block_radius),
    inline_code_bg: nullable_str(raw.inline_code_bg),
    inline_code_text_color: nullable_str(raw.inline_code_text_color),
    highlight_bg: nullable_str(raw.highlight_bg),
    highlight_text_color: nullable_str(raw.highlight_text_color),
    selection_bg: nullable_str(raw.selection_bg),
    caret_color: nullable_str(raw.caret_color),
    table_border_color: nullable_str(raw.table_border_color),
    table_header_bg: nullable_str(raw.table_header_bg),
    table_cell_padding: num(
      raw.table_cell_padding,
      defaults.table_cell_padding,
    ),

    token_overrides: parse_token_overrides(raw.token_overrides),
  };
}

function num(val: unknown, fallback: number): number {
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
}

function nullable_num(val: unknown): number | null {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function str(val: unknown, fallback: string): string {
  return typeof val === "string" && val.length > 0 ? val : fallback;
}

function nullable_str(val: unknown): string | null {
  return typeof val === "string" && val.length > 0 ? val : null;
}

function enum_val<T extends string>(
  val: unknown,
  allowed: T[],
  fallback: T,
): T {
  return typeof val === "string" && (allowed as string[]).includes(val)
    ? (val as T)
    : fallback;
}

function parse_token_overrides(val: unknown): Record<string, string> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(val)) {
    if (typeof v === "string") {
      result[k] = v;
    }
  }
  return result;
}

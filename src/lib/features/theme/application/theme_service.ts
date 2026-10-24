import type { SettingsPort } from "$lib/features/settings";
import type {
  ThemeFilePort,
  ThemeFileSnapshot,
} from "$lib/features/theme/ports";
import type { OpStore } from "$lib/app";
import type {
  Theme,
  ThemeFileError,
  ThemeFileState,
} from "$lib/shared/types/theme";
import {
  DEFAULT_THEME_ID,
  BUILTIN_NORDIC_DARK,
  create_user_theme,
} from "$lib/shared/types/theme";
import {
  format_theme_file_error,
  may_have_more_theme_file_errors,
  parse_theme_file,
} from "$lib/features/theme/domain/parse_theme_file";
import { build_theme_file_schema } from "$lib/features/theme/domain/theme_file_schema";
import { theme_to_file_text } from "$lib/features/theme/domain/theme_file_text";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("theme_service");

const THEMES_KEY = "user_themes";
const ACTIVE_THEME_ID_KEY = "active_theme_id";

export type ThemeLoadResult = {
  user_themes: Theme[];
  active_theme_id: string;
  theme_file: ThemeFileState;
};

export type ThemeFileCreateResult =
  | { status: "created"; path: string }
  | { status: "failed"; error: string };

export class ThemeService {
  constructor(
    private readonly settings_port: SettingsPort,
    private readonly theme_file_port: ThemeFilePort,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  // Also writes theme.schema.json. It only changes with the app, so startup
  // is enough, and reloads of the theme file skip it.
  async load_themes(): Promise<ThemeLoadResult> {
    const [stored, theme_file] = await Promise.all([
      this.load_stored_themes(),
      this.load_theme_file(),
      this.write_theme_schema(),
    ]);
    return { ...stored, theme_file };
  }

  // Never throws. An invalid file comes back with theme null, because only
  // the caller knows the last valid file theme worth keeping.
  async load_theme_file(): Promise<ThemeFileState> {
    this.op_store.start("theme.file_load", this.now_ms());

    let snapshot: ThemeFileSnapshot;
    try {
      snapshot = await this.theme_file_port.read_theme_file();
    } catch (error) {
      return this.fail_theme_file_load(null, [
        { line: null, key: null, message: error_message(error) },
      ]);
    }

    if (snapshot.error !== null) {
      return this.fail_theme_file_load(snapshot.path, [
        { line: null, key: null, message: snapshot.error },
      ]);
    }

    if (snapshot.text === null) {
      this.op_store.succeed("theme.file_load");
      return {
        path: snapshot.path,
        status: "missing",
        theme: null,
        errors: [],
      };
    }

    // @Robustness: Older WebKitGTK builds do not support light-dark(), so a
    // file using it (like one created from Mocha) fails there.
    const parsed = parse_theme_file(snapshot.text, (value) =>
      CSS.supports("color", value),
    );
    if (parsed.status === "invalid") {
      return this.fail_theme_file_load(snapshot.path, parsed.errors);
    }
    this.op_store.succeed("theme.file_load");
    // The docs tell agents to look for this line to know an edit applied.
    log.info("Theme file loaded", { path: snapshot.path });
    return {
      path: snapshot.path,
      status: "valid",
      theme: parsed.theme,
      errors: [],
    };
  }

  async create_theme_file_from(theme: Theme): Promise<ThemeFileCreateResult> {
    try {
      const path = await this.theme_file_port.create_theme_file(
        theme_to_file_text(theme),
      );
      return { status: "created", path };
    } catch (error) {
      const message = error_message(error);
      log.error("Create theme file failed", { error: message });
      return { status: "failed", error: message };
    }
  }

  async open_theme_file(): Promise<boolean> {
    try {
      await this.theme_file_port.open_theme_file();
      return true;
    } catch (error) {
      log.error("Open theme file failed", { error: error_message(error) });
      return false;
    }
  }

  async reveal_theme_file(): Promise<boolean> {
    try {
      await this.theme_file_port.reveal_theme_file();
      return true;
    } catch (error) {
      log.error("Reveal theme file failed", { error: error_message(error) });
      return false;
    }
  }

  // Calls on_change after each save of the theme file. Subscribes before
  // starting the watcher so no change slips through. Returns the unsubscribe.
  watch_theme_file(on_change: () => void): () => void {
    const unsubscribe =
      this.theme_file_port.subscribe_theme_file_changes(on_change);
    this.theme_file_port.watch_theme_file().catch((error: unknown) => {
      log.error("Watch theme file failed", { error: error_message(error) });
    });
    return unsubscribe;
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

  private async load_stored_themes(): Promise<
    Omit<ThemeLoadResult, "theme_file">
  > {
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

  // Agents and editors read theme.schema.json next to the file. A failed
  // write only costs them the schema, so it does not fail the load.
  private async write_theme_schema(): Promise<void> {
    const text = `${JSON.stringify(build_theme_file_schema(), null, 2)}\n`;
    try {
      await this.theme_file_port.write_theme_schema(text);
    } catch (error) {
      log.warn("Write theme schema failed", { error: error_message(error) });
    }
  }

  // The op error is the toast text: the first error, plus how many more.
  private fail_theme_file_load(
    path: string | null,
    errors: ThemeFileError[],
  ): ThemeFileState {
    const messages = errors.map(format_theme_file_error);
    // One record per error, so a message with commas stays whole and grep
    // shows each one. docs/theme_file.md tells agents to look for this text.
    for (const message of messages) {
      log.warn(`Theme file has errors: ${message}`);
    }
    const rest = String(messages.length - 1);
    const at_least = may_have_more_theme_file_errors(errors) ? " or" : "";
    const more = messages.length > 1 ? ` (+${rest}${at_least} more)` : "";
    this.op_store.fail("theme.file_load", `${messages[0] ?? ""}${more}`);
    return { path, status: "invalid", theme: null, errors };
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
    file_tree_density: enum_val(
      raw.file_tree_density,
      ["compact", "normal", "comfortable"],
      defaults.file_tree_density,
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

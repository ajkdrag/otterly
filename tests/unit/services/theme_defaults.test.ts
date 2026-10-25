import { describe, expect, it, vi } from "vitest";
import { ThemeService } from "$lib/features/theme/application/theme_service";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { create_test_theme_file_adapter } from "../../adapters/test_theme_file_adapter";
import {
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_DARK,
  BUILTIN_NORDIC_LIGHT,
  DEFAULT_THEME_ID,
  get_all_themes,
  resolve_theme,
} from "$lib/shared/types/theme";

function create_theme_service(settings: Record<string, unknown>) {
  const port = {
    get_setting: vi
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(settings[key] ?? null),
      ),
    set_setting: vi.fn().mockResolvedValue(undefined),
  };
  return new ThemeService(
    port,
    create_test_theme_file_adapter(),
    new OpStore(),
    () => 0,
  );
}

describe("theme defaults", () => {
  it("keeps Nordic colors with Mocha's typography and editor styling", () => {
    const shared_style = {
      font_family_sans: "IBM Plex Sans",
      font_family_mono: "IBM Plex Mono",
      font_size: 1,
      line_height: 1.7,
      paragraph_spacing: 1.25,
      spacing: "normal",
      heading_color: "inherit",
      heading_font_weight: 500,
      heading_1_size: 2,
      heading_2_size: 1.375,
      heading_3_size: 1.125,
      heading_4_size: 1.0625,
      heading_5_size: 1,
      heading_6_size: 0.875,
      editor_padding_x: 2,
      editor_padding_y: 3,
      bold_style: "default",
      blockquote_style: "default",
      code_block_style: "default",
      code_block_radius: 0.5,
      table_cell_padding: 0.65,
      tag_text_color: null,
      tag_bg: null,
      tag_border_color: null,
      tag_radius: 1.5,
      tag_padding_x: 0.25,
    } as const;

    expect(BUILTIN_NORDIC_LIGHT).toMatchObject(shared_style);
    expect(BUILTIN_NORDIC_DARK).toMatchObject(shared_style);
    expect(BUILTIN_MOCHA).toMatchObject(shared_style);
    expect(BUILTIN_NORDIC_LIGHT.token_overrides).toMatchObject({
      "--editor-heading-font": "var(--font-heading)",
    });
    expect(BUILTIN_NORDIC_DARK.token_overrides).toMatchObject({
      "--editor-heading-font": "var(--font-heading)",
    });
  });

  it("uses Mocha when no theme has been selected", async () => {
    const service = create_theme_service({});
    const result = await service.load_themes();

    expect(result.active_theme_id).toBe(DEFAULT_THEME_ID);
    expect(resolve_theme(get_all_themes([]), result.active_theme_id)).toBe(
      BUILTIN_MOCHA,
    );
  });

  it("keeps an existing built-in selection", async () => {
    const service = create_theme_service({ active_theme_id: "nordic-light" });
    const result = await service.load_themes();

    expect(resolve_theme(get_all_themes([]), result.active_theme_id)).toBe(
      BUILTIN_NORDIC_LIGHT,
    );
  });

  it("fills the interface fields on a theme saved before they existed", async () => {
    const saved_before: Record<string, unknown> = {
      ...BUILTIN_NORDIC_LIGHT,
      id: "old",
      name: "Saved last year",
      is_builtin: false,
    };
    delete saved_before.ui_radius;
    delete saved_before.file_tree_density;
    delete saved_before.editor_max_width_ch;
    const service = create_theme_service({
      active_theme_id: "old",
      user_themes: [saved_before],
    });

    const result = await service.load_themes();

    expect(result.user_themes).toHaveLength(1);
    expect(result.user_themes[0]).toMatchObject({
      id: "old",
      ui_radius: 0.25,
      file_tree_density: "normal",
      editor_max_width_ch: null,
    });
  });

  it("keeps a saved custom theme and its fonts", async () => {
    const custom = {
      ...BUILTIN_NORDIC_LIGHT,
      id: "custom",
      name: "Nordic Dark V2",
      color_scheme: "dark" as const,
      is_builtin: false,
      font_family_sans: "Inter",
      font_family_mono: "JetBrains Mono",
      line_height: 1.75,
      paragraph_spacing: 0.5,
      heading_font_weight: 400,
      heading_1_size: 1.75,
      heading_2_size: 1.1875,
      code_block_radius: 0.75,
      accent_hue: 185,
      accent_chroma: 0.23,
      code_block_bg: "hsl(40, 8%, 15%)",
      code_block_text_color: "hsl(0, 0%, 75%)",
      inline_code_bg: "hsl(40, 8%, 15%)",
      inline_code_text_color: "hsl(0, 0%, 75%)",
    };
    const service = create_theme_service({
      active_theme_id: custom.id,
      user_themes: [custom],
    });
    const result = await service.load_themes();

    expect(
      resolve_theme(get_all_themes(result.user_themes), result.active_theme_id),
    ).toEqual(custom);
  });
});

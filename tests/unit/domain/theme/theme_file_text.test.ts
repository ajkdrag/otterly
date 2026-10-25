import { describe, expect, it } from "vitest";
import { theme_to_file_text } from "$lib/features/theme/domain/theme_file_text";
import { parse_theme_file } from "$lib/features/theme/domain/parse_theme_file";
import {
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_LIGHT,
  FILE_THEME_ID,
  create_user_theme,
  type Theme,
} from "$lib/shared/types/theme";

function parse_back(theme: Theme): Theme {
  const result = parse_theme_file(theme_to_file_text(theme), () => true);
  if (result.status !== "valid") {
    throw new Error(`expected a valid file, got ${JSON.stringify(result)}`);
  }
  return result.theme;
}

describe("theme_to_file_text", () => {
  it("round trips a built-in theme under the default file theme name", () => {
    expect(parse_back(BUILTIN_MOCHA)).toEqual({
      ...BUILTIN_MOCHA,
      id: FILE_THEME_ID,
      name: "Theme file",
      is_builtin: true,
    });
  });

  it("round trips a Mocha copy, which extends Nordic and lists Mocha tokens", () => {
    const mocha_copy = {
      ...create_user_theme("Mocha tweaked", BUILTIN_MOCHA),
      ui_radius: 0.5,
      editor_max_width_ch: 90,
    };

    const text = theme_to_file_text(mocha_copy);

    expect(text).toContain("extends: nordic-dark");
    expect(parse_back(mocha_copy)).toEqual({
      ...mocha_copy,
      id: FILE_THEME_ID,
      is_builtin: true,
    });
  });

  it("round trips a light user theme and writes only what differs", () => {
    const light_theme = {
      ...create_user_theme("Desk lamp", BUILTIN_NORDIC_LIGHT),
      font_size: 1.125,
      file_tree_density: "comfortable" as const,
      link_color: "hsl(25, 60%, 35%)",
      token_overrides: {
        ...BUILTIN_NORDIC_LIGHT.token_overrides,
        "--sidebar": "#f4efe6",
      },
    };

    const text = theme_to_file_text(light_theme);

    expect(text.startsWith("# yaml-language-server: $schema=")).toBe(true);
    expect(text).toContain("extends: nordic-light");
    expect(text).not.toContain("line_height");
    expect(text).not.toContain("--editor-heading-font");
    expect(parse_back(light_theme)).toEqual({
      ...light_theme,
      id: FILE_THEME_ID,
      is_builtin: true,
    });
  });
});

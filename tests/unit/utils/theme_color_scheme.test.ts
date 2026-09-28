import { describe, expect, it } from "vitest";
import { BUILTIN_MOCHA } from "$lib/shared/types/theme";
import { format_hsl, parse_hsl } from "$lib/shared/utils/theme_helpers";

describe("scheme-aware theme colors", () => {
  it("shows the current base color when editing a copied Mocha theme", () => {
    const copy = { ...BUILTIN_MOCHA, id: "copy", is_builtin: false };
    const dark = parse_hsl(copy.code_block_bg, copy.color_scheme);
    copy.color_scheme = "light";
    const light = parse_hsl(copy.code_block_bg, copy.color_scheme);
    copy.color_scheme = "dark";

    expect(dark).toEqual({ h: 240, s: 21, l: 12 });
    expect(light).toEqual({ h: 220, s: 22, l: 92 });
    expect(parse_hsl(copy.code_block_bg, copy.color_scheme)).toEqual(dark);
  });

  it("preserves explicit color edits when the base changes", () => {
    const chosen = { h: 180, s: 25, l: 40 };
    const value = format_hsl(chosen);

    expect(parse_hsl(value, "dark")).toEqual(chosen);
    expect(parse_hsl(value, "light")).toEqual(chosen);
  });

  it("keeps empty and non-HSL values unset in numeric color controls", () => {
    expect(parse_hsl(null, "light")).toBeNull();
    expect(parse_hsl("var(--primary)", "dark")).toBeNull();
  });
});

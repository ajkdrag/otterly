import { describe, expect, it } from "vitest";
import { parse_theme_file } from "$lib/features/theme/domain/parse_theme_file";
import {
  BUILTIN_MOCHA,
  BUILTIN_NORDIC_LIGHT,
  FILE_THEME_ID,
  type Theme,
  type ThemeFileError,
} from "$lib/shared/types/theme";

// The app checks colors with CSS.supports. Here anything but "not-a-color"
// passes, so the tests only cover how the parser uses the check.
const is_valid_color = (value: string) => value !== "not-a-color";

function parse_valid(text: string): Theme {
  const result = parse_theme_file(text, is_valid_color);
  if (result.status !== "valid") {
    throw new Error(`expected a valid file, got ${JSON.stringify(result)}`);
  }
  return result.theme;
}

function parse_errors(text: string): ThemeFileError[] {
  const result = parse_theme_file(text, is_valid_color);
  if (result.status !== "invalid") {
    throw new Error("expected an invalid file");
  }
  return result.errors;
}

describe("parse_theme_file", () => {
  it("builds a theme from YAML on top of the extended built-in", () => {
    const theme = parse_valid(
      [
        "# yaml-language-server: $schema=./theme.schema.json",
        "name: Desk lamp",
        "extends: nordic-light",
        "font_size: 1.05",
        "file_tree_density: compact",
        'link_color: "hsl(25, 60%, 35%)"',
        "tokens:",
        '  --sidebar: "#f4efe6"',
        "  --size-status-bar: 1.5rem",
      ].join("\n"),
    );

    expect(theme).toEqual({
      ...BUILTIN_NORDIC_LIGHT,
      id: FILE_THEME_ID,
      name: "Desk lamp",
      is_builtin: true,
      font_size: 1.05,
      file_tree_density: "compact",
      link_color: "hsl(25, 60%, 35%)",
      token_overrides: {
        ...BUILTIN_NORDIC_LIGHT.token_overrides,
        "--sidebar": "#f4efe6",
        "--size-status-bar": "1.5rem",
      },
    });
  });

  it("reads JSON with the same keys and ignores $schema", () => {
    const theme = parse_valid(
      JSON.stringify({
        $schema: "./theme.schema.json",
        extends: "nordic-light",
        accent_hue: 30,
        tokens: { "--radius-scale": 2 },
      }),
    );

    expect(theme.color_scheme).toBe("light");
    expect(theme.accent_hue).toBe(30);
    expect(theme.token_overrides["--radius-scale"]).toBe("2");
  });

  it("treats an empty file as Mocha", () => {
    const theme = parse_valid("# nothing here yet\n");

    expect(theme).toEqual({
      ...BUILTIN_MOCHA,
      id: FILE_THEME_ID,
      name: "Theme file",
      is_builtin: true,
    });
  });

  it("accepts null for the editor width so the Layout setting decides", () => {
    const theme = parse_valid("editor_max_width_ch: null\n");

    expect(theme.editor_max_width_ch).toBeNull();
  });

  it("accepts null to clear a color the base theme sets", () => {
    const theme = parse_valid("editor_text_color: null\n");

    expect(BUILTIN_MOCHA.editor_text_color).not.toBeNull();
    expect(theme.editor_text_color).toBeNull();
  });

  it("keeps accepting an explicit null or ~ for a color", () => {
    expect(parse_valid("link_color: ~\n").link_color).toBeNull();
    expect(parse_valid('{"link_color": null}').link_color).toBeNull();
  });

  it("rejects an unquoted # color, which YAML reads as an empty value plus a comment", () => {
    expect(parse_errors("name: Warm\nlink_color: #ff0000\n")).toEqual([
      {
        line: 2,
        key: "link_color",
        message:
          'link_color is empty. In YAML an unquoted # starts a comment, so quote the color: "#ff0000"',
      },
    ]);
  });

  it("rejects an unquoted # color in tokens", () => {
    expect(parse_errors("tokens:\n  --ok: red\n  --sidebar: #fff\n")).toEqual([
      {
        line: 3,
        key: "--sidebar",
        message:
          'token --sidebar is empty. In YAML an unquoted # starts a comment, so quote colors: "#ff0000"',
      },
    ]);
  });

  it("rejects unknown keys", () => {
    expect(parse_errors("fontsize: 1.1\n")).toEqual([
      { line: 1, key: "fontsize", message: 'unknown key "fontsize"' },
    ]);
  });

  it("says JSON comments are not allowed, not that a strange key is unknown", () => {
    const errors = parse_errors(
      '{\n  "name": "x", // warm\n  "accent_hue": 10\n}',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
    expect(errors[0]?.message).toContain("comments like // and /* */");
    expect(errors[0]?.message).not.toContain("unknown key");
  });

  it("says the same for a /* */ comment inside tokens", () => {
    const errors = parse_errors(
      '{"tokens": {\n  /* surfaces */ "--sidebar": "red"\n}}',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
    expect(errors[0]?.message).toContain("comments like // and /* */");
  });

  it("rejects numbers outside the descriptor range and names the range", () => {
    expect(parse_errors("name: Big\n\nfont_size: 2\n")).toEqual([
      {
        line: 3,
        key: "font_size",
        message: "font_size must be a number from 0.875 to 1.25 (got 2)",
      },
    ]);
  });

  it("rejects numbers written as strings", () => {
    const errors = parse_errors('line_height: "1.8"\n');

    expect(errors.map((error) => error.key)).toEqual(["line_height"]);
  });

  it("rejects an editor width outside 60 to 140", () => {
    expect(parse_errors("editor_max_width_ch: 200\n")[0]?.message).toBe(
      "editor_max_width_ch must be null or a number from 60 to 140 (got 200)",
    );
  });

  it("rejects a select value that is not an option", () => {
    expect(parse_errors("file_tree_density: dense\n")[0]?.message).toBe(
      'file_tree_density must be one of compact, normal, comfortable (got "dense")',
    );
  });

  it("rejects extends that is not a built-in theme", () => {
    expect(parse_errors("extends: my-theme\n")).toEqual([
      {
        line: 1,
        key: "extends",
        message:
          'extends must be one of mocha, nordic-light, nordic-dark (got "my-theme")',
      },
    ]);
  });

  it("checks colors with the injected validator", () => {
    expect(parse_valid("caret_color: var(--primary)\n").caret_color).toBe(
      "var(--primary)",
    );
    expect(parse_errors("caret_color: not-a-color\n")).toEqual([
      {
        line: 1,
        key: "caret_color",
        message: 'caret_color must be a CSS color or null (got "not-a-color")',
      },
    ]);
  });

  it("rejects token names without the -- prefix", () => {
    const errors = parse_errors("tokens:\n  --ok: red\n  sidebar: blue\n");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3, key: "sidebar" });
  });

  it("checks color tokens with the injected validator", () => {
    expect(
      parse_errors("tokens:\n  --ok: red\n  --sidebar: not-a-color\n"),
    ).toEqual([
      {
        line: 3,
        key: "--sidebar",
        message: 'token --sidebar must be a CSS color (got "not-a-color")',
      },
    ]);
  });

  it("does not check tokens in a color family that hold lengths or numbers", () => {
    const only_red_is_a_color = (value: string) => value === "red";
    const result = parse_theme_file(
      [
        "tokens:",
        "  --sidebar: red",
        "  --accent-hue: 30",
        "  --border-width-thick: 3px",
        "  --scrollbar-width: 8px",
        "  --size-status-bar: 1.5rem",
      ].join("\n"),
      only_red_is_a_color,
    );

    expect(result.status).toBe("valid");
  });

  it("rejects --size-tree-row and points at file_tree_density", () => {
    expect(parse_errors("tokens:\n  --size-tree-row: 40px\n")).toEqual([
      {
        line: 2,
        key: "--size-tree-row",
        message:
          "token --size-tree-row is set by file_tree_density, use file_tree_density instead",
      },
    ]);
  });

  it("rejects tokens that are not a mapping", () => {
    expect(parse_errors("tokens: [red]\n")[0]?.key).toBe("tokens");
  });

  it("reports duplicate keys with the line of the second one", () => {
    expect(parse_errors("font_size: 1\nfont_size: 1.1\n")).toEqual([
      { line: 2, key: "font_size", message: 'duplicate key "font_size"' },
    ]);
  });

  it("reports duplicate keys in JSON too", () => {
    expect(parse_errors('{\n  "font_size": 1,\n  "font_size": 1.1\n}')).toEqual(
      [{ line: 3, key: "font_size", message: 'duplicate key "font_size"' }],
    );
  });

  it("reports a repeated token", () => {
    expect(parse_errors("tokens:\n  --a: red\n  --a: blue\n")).toEqual([
      { line: 3, key: "--a", message: 'duplicate key "--a"' },
    ]);
  });

  it("lists a duplicate key in file order with the other errors", () => {
    const errors = parse_errors(
      "name: a\nfont_size: 1\nfont_sise: 1\nfont_size: 1.1\n",
    );

    expect(errors.map((error) => error.line)).toEqual([3, 4]);
  });

  it("parses a file of thousands of keys without freezing", () => {
    const text = Array.from({ length: 20000 }, (_, i) => `k${String(i)}: 1`);
    const started_at = performance.now();

    const errors = parse_errors(text.join("\n"));

    // yaml's own duplicate check took 30 s here. This takes 1 to 2 s.
    expect(performance.now() - started_at).toBeLessThan(10_000);
    expect(errors).toHaveLength(20);
  });

  it("reports YAML syntax errors with a line number", () => {
    const errors = parse_errors(
      "font_size: 1\nlink_color: 'red\nline_height: 2\n",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
  });

  it("says a second document is not allowed instead of naming a yaml function", () => {
    const errors = parse_errors("accent_hue: 40\n---\nfont_size: 1\n");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain("one YAML document");
    expect(errors[0]?.message).not.toContain("parseAllDocuments");
  });

  it("ignores a leading --- line", () => {
    expect(parse_valid("---\naccent_hue: 40\n").accent_hue).toBe(40);
  });

  it("rejects a top level that is not a mapping", () => {
    expect(parse_errors("- font_size\n- 1.1\n")).toEqual([
      {
        line: 1,
        key: null,
        message:
          "the file must be a mapping of keys to values, like font_size: 1.1",
      },
    ]);
  });

  it("accepts unicode in the name and font families", () => {
    const theme = parse_valid(
      "name: Café ☕ テーマ\nfont_family_sans: Noto Sans JP\nfont_family_mono: 'M+ 1m'\n",
    );

    expect(theme.name).toBe("Café ☕ テーマ");
    expect(theme.font_family_sans).toBe("Noto Sans JP");
  });

  it("rejects a CSS font stack where one family name goes", () => {
    const errors = parse_errors("font_family_sans: Inter, sans-serif\n");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1, key: "font_family_sans" });
  });

  it("rejects a top level that is a single value", () => {
    expect(parse_errors("dark\n")[0]?.message).toContain("must be a mapping");
  });

  it("reports an alias bomb as an error instead of throwing", () => {
    const lines = ["a: &a [x, x, x, x, x, x, x, x, x]"];
    let previous = "a";
    for (const name of ["b", "c", "d", "e", "f", "g", "h", "i"]) {
      const refs = Array(9).fill(`*${previous}`).join(", ");
      lines.push(`${name}: &${name} [${refs}]`);
      previous = name;
    }
    lines.push(`name: *${previous}`);

    const errors = parse_errors(lines.join("\n"));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBeNull();
  });

  it("reports every error, up to 20", () => {
    const text = Array.from(
      { length: 25 },
      (_, index) => `unknown_${String(index)}: 1`,
    ).join("\n");

    expect(parse_errors(text)).toHaveLength(20);
  });
});

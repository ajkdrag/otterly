import { BUILTIN_THEMES } from "$lib/shared/types/theme";
import {
  STYLE_DESCRIPTORS,
  type ThemeStyleDescriptor,
} from "$lib/features/theme/domain/theme_style_descriptors";
import {
  FONT_FAMILY_PATTERN,
  TOKEN_NAME_PATTERN,
} from "$lib/features/theme/domain/parse_theme_file";

// theme.schema.json, written next to the theme file so editors and agents can
// check a file before saving it. It covers what parse_theme_file checks except
// color syntax (fields and color tokens) and the --size-tree-row token, which
// the tokens description only warns about. Draft-07 because
// yaml-language-server and most editors handle it best.

export const THEME_FILE_DOC_URL =
  "https://github.com/ajkdrag/otterly/blob/main/docs/theme_file.md";

type JsonSchema = Record<string, unknown>;

export function build_theme_file_schema(): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    $schema: {
      type: "string",
      description:
        "Path or URL of this schema, for editors. Otterly ignores it.",
    },
    name: {
      type: "string",
      minLength: 1,
      // The parser also rejects a name of only whitespace.
      pattern: "\\S",
      description: 'Name shown in Settings > Theme. Default "Theme file".',
    },
    extends: {
      enum: BUILTIN_THEMES.map((theme) => theme.id),
      description:
        "Built-in theme to start from. Keys you leave out come from it. Default mocha.",
    },
  };

  for (const desc of STYLE_DESCRIPTORS) {
    properties[desc.theme_key] = descriptor_schema(desc);
  }

  properties.tokens = {
    type: "object",
    description:
      'Raw CSS custom properties, applied last, so they win over every other key. Example: --sidebar: "#f4efe6". Useful ones: surface colors (--background, --sidebar, --border), sizes (--size-*), spacing (--space-*), text sizes (--text-*) and syntax colors (--syntax-*). Otterly checks color tokens (--background, --sidebar, --border, --syntax-* and similar) when it loads the file, this schema does not. --size-tree-row is an error: use file_tree_density.',
    propertyNames: { pattern: TOKEN_NAME_PATTERN.source },
    additionalProperties: { type: ["string", "number"], minLength: 1 },
  };

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Otterly theme file",
    description: [
      "Otterly theme file: theme.yaml, theme.yml or theme.json in the same folder as this schema.",
      "Otterly reloads it on every save and switches to it, so changes show right away.",
      'Every key is optional. Keys you leave out come from the built-in theme in "extends".',
      '"tokens" sets raw CSS custom properties and wins over every other key.',
      'An edit with errors is not applied, and the last valid theme stays on screen. To check an edit, read the end of the app log (otterly.log): "Theme file loaded" means it worked, "Theme file has errors" lines name each problem.',
      "Log folder: macOS ~/Library/Logs/com.otterly.app/, Windows %LOCALAPPDATA%\\com.otterly.app\\logs\\ (portable: data\\logs\\ next to otterly.exe), Linux ~/.local/share/com.otterly.app/logs/.",
      `Errors also show in Settings > Theme. Docs: ${THEME_FILE_DOC_URL}`,
    ].join("\n"),
    type: "object",
    additionalProperties: false,
    properties,
  };
}

function descriptor_schema(desc: ThemeStyleDescriptor): JsonSchema {
  switch (desc.control) {
    case "slider":
      return {
        type: desc.nullable ? ["number", "null"] : "number",
        minimum: desc.min,
        maximum: desc.max,
        description: sentences(desc.description, unit_note(desc.unit)),
      };
    case "select":
      return {
        enum: (desc.options ?? []).map((option) => option.value),
        description: sentences(desc.description),
      };
    case "font_select":
      return {
        type: "string",
        pattern: FONT_FAMILY_PATTERN.source,
        description: sentences(
          desc.description,
          "One installed font family name, like Inter. Not a CSS font stack",
        ),
      };
    case "color":
      return {
        type: ["string", "null"],
        description: sentences(
          desc.description,
          "Any CSS color, including light-dark(...) and var(--token). null clears it",
        ),
      };
  }
}

function sentences(...parts: string[]): string {
  return `${parts.filter(Boolean).join(". ")}.`;
}

function unit_note(unit: string | undefined): string {
  switch (unit) {
    case "rem":
      return "In rem (1rem is 16px)";
    case "em":
      return "In em, relative to the editor font size";
    case "ch":
      return "In characters";
    case "°":
      return "In degrees on the color wheel";
    case "×":
      return "A multiplier";
    default:
      return "";
  }
}

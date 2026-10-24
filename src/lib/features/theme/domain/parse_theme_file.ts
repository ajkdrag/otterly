import {
  LineCounter,
  isMap,
  isNode,
  isScalar,
  parseDocument,
  type Document,
  type YAMLError,
  type YAMLMap,
} from "yaml";
import type { Theme, ThemeFileError } from "$lib/shared/types/theme";
import {
  BUILTIN_MOCHA,
  BUILTIN_THEMES,
  FILE_THEME_ID,
} from "$lib/shared/types/theme";
import {
  STYLE_DESCRIPTORS,
  type ThemeStyleDescriptor,
} from "$lib/features/theme/domain/theme_style_descriptors";
import { error_message } from "$lib/shared/utils/error_message";

// Reads theme.yaml or theme.json. JSON is valid YAML, so one parser reads
// both. Every key is optional. The theme is the built-in named in `extends`
// with the file's fields and tokens on top:
//
//   extends: nordic-light
//   font_size: 1.05
//   tokens:
//     --sidebar: "#f4efe6"
//
// STYLE_DESCRIPTORS gives the allowed fields and their ranges, the same table
// the settings UI and theme.schema.json use. Colors need a real CSS parser,
// so the caller passes is_valid_color (CSS.supports in the app).

export type ThemeFileParseResult =
  | { status: "valid"; theme: Theme }
  | { status: "invalid"; errors: ThemeFileError[] };

const MAX_ERRORS = 20;
export const TOKEN_NAME_PATTERN = /^--[a-zA-Z0-9-]+$/;
// One family name. apply_theme wraps it in quotes, so a CSS stack like
// "Inter, sans-serif" would silently match no font at all.
export const FONT_FAMILY_PATTERN = /^[^",;\\\n\r]+$/;
const DEFAULT_FILE_THEME_NAME = "Theme file";

const DESCRIPTOR_BY_KEY = new Map<string, ThemeStyleDescriptor>(
  STYLE_DESCRIPTORS.map((desc) => [desc.theme_key, desc]),
);

// $schema is for editors (yaml-language-server, VS Code) and is ignored here.
export const THEME_FILE_KEYS: string[] = [
  "$schema",
  "name",
  "extends",
  "tokens",
  ...DESCRIPTOR_BY_KEY.keys(),
];

export function parse_theme_file(
  text: string,
  is_valid_color: (value: string) => boolean,
): ThemeFileParseResult {
  try {
    return parse_theme_file_text(text, is_valid_color);
  } catch (error) {
    // yaml throws, instead of reporting, when aliases expand without bound
    // (a "billion laughs" file). The caller promises never to throw.
    return invalid([{ line: null, key: null, message: error_message(error) }]);
  }
}

function parse_theme_file_text(
  text: string,
  is_valid_color: (value: string) => boolean,
): ThemeFileParseResult {
  const line_counter = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter: line_counter,
    prettyErrors: false,
  });
  const line_at = (offset: number) => line_counter.linePos(offset).line;

  if (doc.errors.length > 0) {
    return invalid(doc.errors.map((error) => syntax_error(error, line_at)));
  }

  const contents = doc.contents;
  if (contents !== null && !isMap(contents)) {
    return invalid([
      {
        line: line_at(contents.range[0]),
        key: null,
        message:
          "the file must be a mapping of keys to values, like font_size: 1.1",
      },
    ]);
  }

  const errors: ThemeFileError[] = [];
  const fields: Record<string, unknown> = {};
  let base = BUILTIN_MOCHA;
  let name = DEFAULT_FILE_THEME_NAME;
  let tokens: Record<string, string> = {};

  // An empty file (or only comments) has no entries: the default theme.
  const entries = contents ? read_entries(contents, doc, line_at) : [];
  for (const entry of entries) {
    const { key, value } = entry;
    const report = (expected: string) => {
      errors.push({
        line: entry.line,
        key,
        message: `${key} ${expected} (got ${describe_value(value)})`,
      });
    };

    if (key === "$schema") continue;

    if (key === "name") {
      if (typeof value === "string" && value.trim() !== "") {
        name = value;
      } else {
        report("must be a non-empty string");
      }
      continue;
    }

    if (key === "extends") {
      const builtin = BUILTIN_THEMES.find((theme) => theme.id === value);
      if (builtin) {
        base = builtin;
      } else {
        report(`must be one of ${BUILTIN_THEMES.map((t) => t.id).join(", ")}`);
      }
      continue;
    }

    if (key === "tokens") {
      if (!isMap(entry.node)) {
        report(
          "must be a mapping of CSS custom properties, like --sidebar: red",
        );
        continue;
      }
      tokens = read_tokens(entry.node, doc, line_at, errors);
      continue;
    }

    const desc = DESCRIPTOR_BY_KEY.get(key);
    if (!desc) {
      errors.push({
        line: entry.line,
        key,
        message: `unknown key "${key}"`,
      });
      continue;
    }

    const expected = check_field_value(desc, value, is_valid_color);
    if (expected) {
      report(expected);
      continue;
    }
    fields[key] = value;
  }

  if (errors.length > 0) return invalid(errors);
  return {
    status: "valid",
    theme: build_file_theme(base, name, fields, tokens),
  };
}

export function format_theme_file_error(error: ThemeFileError): string {
  return error.line === null
    ? error.message
    : `line ${String(error.line)}: ${error.message}`;
}

// Returns what the value should have been, or null when it is fine.
function check_field_value(
  desc: ThemeStyleDescriptor,
  value: unknown,
  is_valid_color: (value: string) => boolean,
): string | null {
  switch (desc.control) {
    case "slider": {
      if (desc.nullable && value === null) return null;
      const min = desc.min ?? 0;
      const max = desc.max ?? 0;
      const in_range =
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= min &&
        value <= max;
      if (in_range) return null;
      const range = `a number from ${String(min)} to ${String(max)}`;
      return desc.nullable ? `must be null or ${range}` : `must be ${range}`;
    }
    case "select": {
      const options = (desc.options ?? []).map((option) => option.value);
      if (typeof value === "string" && options.includes(value)) return null;
      return `must be one of ${options.join(", ")}`;
    }
    case "font_select":
      if (typeof value === "string" && FONT_FAMILY_PATTERN.test(value)) {
        return null;
      }
      return "must be one font family name, like Inter (no commas or quotes)";
    case "color":
      // null clears a color the base theme sets.
      if (value === null) return null;
      if (typeof value === "string" && is_valid_color(value)) return null;
      return "must be a CSS color or null";
  }
}

function read_tokens(
  map: YAMLMap,
  doc: Document,
  line_at: (offset: number) => number,
  errors: ThemeFileError[],
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const { key, line, value } of read_entries(map, doc, line_at)) {
    if (!TOKEN_NAME_PATTERN.test(key)) {
      errors.push({
        line,
        key,
        message: `token "${key}" must start with -- and use only letters, digits and dashes`,
      });
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      tokens[key] = String(value);
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      errors.push({
        line,
        key,
        message: `token ${key} must be a string or number (got ${describe_value(value)})`,
      });
      continue;
    }
    tokens[key] = value;
  }
  return tokens;
}

type FileEntry = {
  key: string;
  line: number | null;
  node: unknown;
  value: unknown;
};

function read_entries(
  map: YAMLMap,
  doc: Document,
  line_at: (offset: number) => number,
): FileEntry[] {
  return map.items.map((pair) => {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
    const line =
      isNode(pair.key) && pair.key.range ? line_at(pair.key.range[0]) : null;
    const value: unknown = isNode(pair.value)
      ? pair.value.toJS(doc)
      : pair.value;
    return { key, line, node: pair.value, value };
  });
}

// The fields were checked against their descriptors, so they fit Theme.
function build_file_theme(
  base: Theme,
  name: string,
  fields: Record<string, unknown>,
  tokens: Record<string, string>,
): Theme {
  return {
    ...base,
    ...(fields as Partial<Theme>),
    id: FILE_THEME_ID,
    name,
    is_builtin: true,
    token_overrides: { ...base.token_overrides, ...tokens },
  };
}

function syntax_error(
  error: YAMLError,
  line_at: (offset: number) => number,
): ThemeFileError {
  const message =
    error.code === "DUPLICATE_KEY" ? "duplicate key" : error.message;
  return { line: line_at(error.pos[0]), key: null, message };
}

function invalid(errors: ThemeFileError[]): ThemeFileParseResult {
  return { status: "invalid", errors: errors.slice(0, MAX_ERRORS) };
}

// Keeps a stray object or long string from flooding the error toast.
function describe_value(value: unknown): string {
  const text =
    typeof value === "number" ? String(value) : String(JSON.stringify(value));
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

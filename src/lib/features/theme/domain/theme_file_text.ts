import { stringify } from "yaml";
import type { Theme } from "$lib/shared/types/theme";
import {
  BUILTIN_NORDIC_DARK,
  BUILTIN_NORDIC_LIGHT,
  BUILTIN_THEMES,
} from "$lib/shared/types/theme";
import { STYLE_DESCRIPTORS } from "$lib/features/theme/domain/theme_style_descriptors";
import { THEME_FILE_DOC_URL } from "$lib/features/theme/domain/theme_file_schema";

// Writes a theme as theme.yaml text: the built-in it starts from, then only
// the fields and tokens that differ from it. This is how a theme made in the
// settings UI becomes a file a person or an agent keeps editing.
//
// A user theme does not remember which built-in it was copied from, so it
// extends Nordic. A Mocha copy then lists every Mocha token. Verbose, but it
// parses back to the same theme.
export function theme_to_file_text(theme: Theme): string {
  const base =
    BUILTIN_THEMES.find((builtin) => builtin.id === theme.id) ??
    (theme.color_scheme === "light"
      ? BUILTIN_NORDIC_LIGHT
      : BUILTIN_NORDIC_DARK);

  const file: Record<string, unknown> = { extends: base.id };
  // A built-in keeps the default file theme name, so the theme list does not
  // show two entries called Mocha.
  if (theme.id !== base.id) file.name = theme.name;

  for (const desc of STYLE_DESCRIPTORS) {
    const key = desc.theme_key;
    if (theme[key] !== base[key]) file[key] = theme[key];
  }

  const tokens = Object.fromEntries(
    Object.entries(theme.token_overrides).filter(
      ([name, value]) => base.token_overrides[name] !== value,
    ),
  );
  if (Object.keys(tokens).length > 0) file.tokens = tokens;

  const header = [
    "# yaml-language-server: $schema=./theme.schema.json",
    `# Every key is optional. Docs: ${THEME_FILE_DOC_URL}`,
  ].join("\n");
  // lineWidth 0 keeps long light-dark(...) values on one line.
  return `${header}\n${stringify(file, { lineWidth: 0 })}`;
}

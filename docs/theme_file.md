# Theme file

You can restyle Otterly by editing one file, `theme.yaml` (or `theme.json`). Otterly reloads it every time you save, so you see the change right away. It is meant for coding agents as much as for people: tell the agent where the file is, point it at `theme.schema.json`, and let it iterate.

## Where it lives

The file sits next to `settings.json`, in the app config folder. Themes are global, so there is one file for all vaults.

| OS      | Folder                                                       |
| ------- | ------------------------------------------------------------ |
| macOS   | `~/Library/Application Support/com.otterly.app/otterly/`     |
| Windows | `%APPDATA%\com.otterly.app\otterly\`                         |
| Linux   | `~/.config/com.otterly.app/otterly/` (or `$XDG_CONFIG_HOME`) |

In that folder:

- `theme.yaml` or `theme.json`: yours. Same keys in both. Having both is an error, so nobody edits a file that gets ignored. Settings > Theme still shows the path in that case, and Reveal opens the folder so you can delete one.
- `theme.schema.json`: written by Otterly at startup. Don't edit it, point your editor or agent at it.

Dev builds and release builds use the same folder.

Easiest way to get started: Settings > Theme > "Create from current theme". It writes `theme.yaml` with only the things that differ from a built-in theme, then opens it. The command palette also has "Open Theme File", "Reveal Theme File" and "Copy Theme File Path" (paste the path into an agent).

## YAML example

```yaml
# yaml-language-server: $schema=./theme.schema.json
name: Desk lamp
extends: nordic-light
accent_hue: 30
font_family_sans: Inter
font_size: 1.05
line_height: 1.8
editor_max_width_ch: 72 # null or leave it out to use Settings > Layout
ui_radius: 0.5
file_tree_density: compact
link_color: "hsl(25, 60%, 35%)"
tokens:
  --sidebar: "#f4efe6"
  --size-status-bar: 1.5rem
```

## JSON example

```json
{
  "$schema": "./theme.schema.json",
  "name": "Night shift",
  "extends": "nordic-dark",
  "accent_hue": 200,
  "heading_color": "accent",
  "code_block_style": "filled",
  "tokens": {
    "--background": "#10141a",
    "--syntax-keyword": "#ff9e64"
  }
}
```

## What happens when you save

- Otterly waits about 150 ms after the last write, then reloads once. Editors that save through a temp file (vim, VS Code) and agents that write a temp file and rename it are fine. A burst of quick saves (under 150 ms apart) is one reload and one toast.
- **Valid file:** the "Theme file" theme is updated and Otterly switches to it (and remembers that choice, but only while the vault window is open: with only a document window open, the switch lasts until you quit). If Settings is open with unsaved theme edits, the theme is updated but your active theme stays as it is.
- **File with errors:** the last valid version stays on screen, so the app doesn't jump around while you are mid-edit. The errors show in Settings > Theme (in the "Theme file" card), in a toast, and in the app log (see [Checking an edit](#checking-an-edit)).
- **Deleted file:** Otterly falls back to Mocha. Create the file again and it comes back.
- **Empty file** (or only comments) is valid and equals Mocha.
- The file theme is read-only in Settings. To tweak it there, duplicate it.
- Limits: UTF-8 text, up to 256 KB.
- A symlinked `theme.yaml` loads fine, but live reload only sees changes to the link itself, not to the file it points at (checked on macOS). Restart Otterly after editing the target, or keep a real file here.

## Checking an edit

When the file has errors, the last valid version stays on screen, so a bad save looks the same as a good one. If you can't see the window (a headless agent, for example), read the end of the app log instead:

| OS      | Log file                                                                |
| ------- | ----------------------------------------------------------------------- |
| macOS   | `~/Library/Logs/com.otterly.app/otterly.log`                            |
| Windows | `%LOCALAPPDATA%\com.otterly.app\logs\otterly.log`                       |
| Linux   | `~/.local/share/com.otterly.app/logs/otterly.log` (or `$XDG_DATA_HOME`) |

Save, wait a second, then look at the newest lines:

```sh
grep "Theme file" ~/Library/Logs/com.otterly.app/otterly.log | tail
```

- `Theme file loaded`: the file is valid and Otterly loaded it.
- `Theme file has errors: line 3: ...`: one line per error. Nothing was applied. Fix the file and save again.

With several windows open (a vault and some document windows), only one of them writes these lines for each save. You get one line per error, not one per window.

Every line starts with a timestamp, so compare it with the time of your save. A `loaded` line after the error lines means the fix worked. The log is small (about 40 KB, then it rolls over), so read the tail and not the whole file.

I checked the macOS path against a real build. The Windows and Linux paths come from Tauri's source and I have not checked them on those systems.

## extends

`extends` picks the built-in theme to start from: `mocha` (default), `nordic-light` or `nordic-dark`. Every key you leave out comes from it, and your `tokens` are merged on top of its tokens. It only takes built-in ids, so the file stays self-contained and doesn't break when someone renames a theme in Settings.

## Fields

Every key is optional. `theme.schema.json` lists all of them with types, ranges and descriptions, so validate against that instead of guessing. Unknown keys are errors (it catches typos), and numbers outside the range are errors too, not clamped.

- Base: `name`, `extends`, `color_scheme` (`light` or `dark`)
- Interface: `accent_hue`, `accent_chroma`, `ui_radius`, `file_tree_density`, `font_family_sans`, `font_family_mono`
- Typography: `font_size`, `line_height`, `paragraph_spacing`, `heading_spacing_after`, `list_item_spacing`, `spacing`, `editor_text_color`, `link_color`
- Layout: `editor_padding_x`, `editor_padding_y`, `editor_max_width_ch`
- Headings: `heading_color`, `heading_font_weight`, `heading_1_size` to `heading_6_size`
- Bold and italic: `bold_style`, `bold_color`, `italic_color`
- Blockquotes: `blockquote_style`, `blockquote_border_color`, `blockquote_bg_color`, `blockquote_text_color`
- Code: `inline_code_bg`, `inline_code_text_color`, `code_block_style`, `code_block_bg`, `code_block_text_color`, `code_block_radius`
- Highlights and tables: `highlight_bg`, `highlight_text_color`, `selection_bg`, `caret_color`, `table_border_color`, `table_header_bg`, `table_cell_padding`
- Escape hatch: `tokens`

Rules worth knowing:

- Colors take any CSS color: `"#abc"`, `"oklch(0.7 0.1 200)"`, `"light-dark(#fff, #000)"`, `"var(--primary)"`. Typos like `redd` and non-colors like `12px` are errors. `null` clears a color the base theme sets. In YAML, quote colors: an unquoted `#` starts a comment.
- Fonts are one family name, like `Inter`. Not a CSS stack: `Inter, sans-serif` is an error.
- `editor_max_width_ch: null` and leaving it out both mean "use the Layout setting". A number overrides the Layout setting while this theme is active.
- `file_tree_density` (`compact`, `normal`, `comfortable`) sets the file tree row height to 26, 30 or 34 px. The tree is virtualized and places its rows from this setting, so `--size-tree-row` in `tokens` is an error.
- `ui_radius` is in rem and sets `--radius`.
- Older WebKitGTK builds (Linux) may not know `light-dark()`, so a color or color token written with it fails validation there. "Create from current theme" on a copy of Mocha writes a lot of them. I have not verified which WebKitGTK versions are affected. If you hit it, start from `nordic-dark` or `nordic-light`, or use plain colors.

## tokens

`tokens` are raw CSS custom properties, applied last, so they win over every other key. Names start with `--` and use letters, digits and dashes. Values are strings or numbers (a number becomes a string, so `--foo: 2` is `"2"`). They apply in both light and dark, so use `light-dark(a, b)` if you want a different color per scheme. Tokens that hold colors (`--background`, `--sidebar`, `--border`, `--syntax-*` and the other families in the table) are checked by Otterly when it loads the file. The schema can't check them, so a typo like `"#f4efe"` only shows up as an error in Otterly. Tokens that hold lengths, like `--border-width-thick`, are not checked.

| What              | Tokens                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `--background`, `--foreground`, `--card`, `--popover`, `--secondary`, `--muted`, `--muted-foreground`, `--sidebar`, `--sidebar-foreground`, `--background-surface-2`, `--background-surface-3`                                                                   |
| Borders           | `--border`, `--border-subtle`, `--border-strong`, `--input`, `--sidebar-border`                                                                                                                                                                                  |
| Accent and states | `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--interactive`, `--interactive-hover`, `--focus-ring`, `--selection-bg`, `--destructive`, `--warning`                                                                                   |
| Sizes             | `--size-status-bar`, `--size-activity-bar`, `--size-tree-indent`, `--size-icon`, `--size-touch`, `--size-dialog-md`                                                                                                                                              |
| Spacing (rem)     | `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--space-8` (plus half steps like `--space-1-5`)                                                                                                                                                |
| Text sizes        | `--text-xs`, `--text-sm`, `--text-base`, `--text-md`, `--text-lg`                                                                                                                                                                                                |
| Syntax colors     | `--syntax-comment`, `--syntax-keyword`, `--syntax-string`, `--syntax-number`, `--syntax-function`, `--syntax-variable`, `--syntax-class`, `--syntax-tag`, `--syntax-operator`, `--syntax-punctuation`, `--syntax-property`, `--syntax-boolean`, `--syntax-regex` |
| Editor extras     | `--editor-code-border`, `--editor-mark-bg`, `--editor-find-match-bg`                                                                                                                                                                                             |

This is a starting list, not all of them. The full set lives in `src/styles/design_tokens.css`, `src/styles/editor.css` and `src/app.css`.

## Errors

Each error is one line: `line N: message`. The line is the line of the key (or of the syntax problem), and it is left out when the problem isn't tied to a line (a file that can't be read, for example). Up to 20 are reported. Examples:

```text
line 3: font_size must be a number from 0.875 to 1.25 (got 2)
line 5: unknown key "fontsize"
line 7: caret_color must be a CSS color or null (got "redd")
line 8: link_color is empty. In YAML an unquoted # starts a comment, so quote the color: "#ff0000"
line 9: token "sidebar" must start with -- and use only letters, digits and dashes
line 10: token --sidebar must be a CSS color (got "#f4efe")
line 11: token --size-tree-row is set by file_tree_density, use file_tree_density instead
line 2: duplicate key "font_size"
line 4: comments like // and /* */ are not allowed. Remove it, or write the file as YAML and start comments with #
line 1: extends must be one of mocha, nordic-light, nordic-dark (got "my-theme")
line 1: the file must be a mapping of keys to values, like font_size: 1.1
Found both theme.yaml and theme.json. Delete one.
theme.yaml is 300 KB. The limit is 256 KB.
theme.yaml can't be read: Permission denied (os error 13)
```

The toast shows the first error plus `(+N more)`. The full list is in Settings > Theme. Otterly stops counting at 20, so a file with more errors shows `20+ errors` in Settings and `(+19 or more)` in the toast.

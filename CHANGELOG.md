# Changelog

Newest first. This file did not exist before this batch, so it starts at the next release. Earlier releases are on the [releases page](https://github.com/ajkdrag/otterly/releases).

## Unreleased

### Added

- **Tags.** Type `#tag` in a note and it renders as a styled chip with autocomplete. `Cmd+T` opens tag search in the omnibar: pick tags as chips, a note must carry every chip, and anything you type searches inside the tagged notes. The left bar has a Tags pane with counts, a filter box and a note drill-down with previews. A note's tags also show in its side panel. Tags inside code, headings, URLs and links are ignored. Unicode and emoji tags work. Frontmatter `tags:` count too.
- **Find in files, inside Cmd+O.** `Cmd+Shift+F` opens the omnibar in Text mode: regex, case and whole-word toggles, include and exclude globs, streamed results grouped by file with the match in view. Press `Tab` for Replace. You get an inline preview, replace one match, all matches in a file, or everything, with a confirm dialog. Vaults that are not git repos get a warning because replace cannot be undone there. Tag chips scope a find, so you can replace only inside notes with a tag.
- **Theme file.** Edit `theme.yaml` or `theme.json` in the app config folder and the whole app restyles live. Errors name the line. A JSON schema is written next to the file for editors and agents. It covers colors, fonts, spacing, radius, tree density, headings, quotes, code, tables and tag chips, plus raw CSS tokens. Settings > Theme shows the path with Open, Reveal and Copy path. See `docs/theme_file.md`.
- **Vim mode.** Settings > Vim turns it on. Motions, operators, counts, text objects, visual modes, registers, search, macros and a small ex set, checked case by case against real `vim`. There is a mode indicator, a cursor shape per mode and a pending-key display. A `vimrc` in the app config folder takes `map` variants and `set`; lines that do not apply are listed with line numbers in Settings.
- **New windows.** `Shift+Cmd+N`, File > New Window and the Dock menu open another window. A vault can open in this window or a new one (the window button on a picker row, or `Cmd+Enter` in the switcher). A vault is open in at most one window, and opening it again focuses that window. Settings stay shared.
- **Windows portable zip** next to the installer. It skips the installer updater.
- **Standalone file windows** got find, word counts, copy, reveal and help.

### Changed

- `Cmd+Shift+F` is now find in files. "Search All Vaults" moved to `Cmd+Alt+Shift+F`.
- The vault window and the standalone file window share one status bar.
- The omnibar tabs are `All | Files | Text`. The content-only tab and the `@content` prefix are gone, `Text` is exact search.

### Fixed

- AppImage builds ship a working `.DirIcon`, and CI checks it.

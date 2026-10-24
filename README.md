<img src="./assets/icon.png" alt="Otterly icon" width="96">

[![Release](https://github.com/ajkdrag/otterly/actions/workflows/release.yml/badge.svg)](https://github.com/ajkdrag/otterly/actions/workflows/release.yml)

# Otterly

Open a folder of Markdown notes and get to work. Otterly gives you a clean editor, quick search, and links between notes. The files stay on your computer.

## Download

**[Get the latest Otterly release](https://github.com/ajkdrag/otterly/releases/latest)** for macOS, Windows, or Linux. No account is needed.

| Platform                       | Package to choose                                                  |
| ------------------------------ | ------------------------------------------------------------------ |
| macOS (Apple Silicon or Intel) | `.dmg` for your Mac                                                |
| Windows x64                    | `setup.exe` or `.msi`, or `portable.zip` (no install)              |
| Linux x64                      | `.AppImage` or `.deb`                                              |
| Arch Linux x86_64              | [AUR package](https://aur.archlinux.org/packages/otterly-appimage) |

### Windows portable zip

Unzip it anywhere and run `otterly.exe`. Everything in the editor works the same as the installed app. Three things differ:

- Updates: a portable copy does not update itself. Download the newest zip and replace `otterly.exe`. Keep `portable.txt` next to it, because the app reads that file to know it is portable.
- File association: nothing is registered with Windows, so use "Open with" > "Choose another app" > "Choose an app on your PC" and pick `otterly.exe`.
- Settings and the vault list still live in your user profile (`%APPDATA%\com.otterly.app`), not next to the exe. Installed and portable copies share them.

Otterly needs the WebView2 runtime. Windows 11 and up-to-date Windows 10 already have it.

## See it in action

[Visit the Otterly site](https://ajkdrag.github.io/otterly/) for a short tour of the desktop app and a closer look at its features.

## Why Otterly

Most note apps ask you to choose between polished UX and file ownership.

Otterly is for people who want both:

- a privacy-focused note-taking app
- a local-first Markdown editor
- an Obsidian alternative that stays close to plain files
- a desktop notes app that does not require plugin hunting to feel usable

If you stop using Otterly, your notes are still just Markdown files in a folder you already own.

## Open Markdown Files With Otterly

Otterly can open any `.md` file, not just notes in a vault. The file opens in its own window. Edits save back to the same file, with its line endings kept.

To make Otterly the default app for Markdown:

- **macOS:** Select a `.md` file in Finder, press Cmd+I, pick Otterly under "Open with", and click "Change All".
- **Windows:** Right-click a `.md` file, choose "Open with" > "Choose another app", pick Otterly, and tick "Always use this app".
- **Linux:** Right-click a `.md` file in your file manager, open its properties, and set Otterly as the default for "Markdown". From a terminal: `xdg-mime default otterly.desktop text/markdown`. The desktop file name depends on how you installed Otterly.

## Build From Source

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/)
- Platform-specific build tools from [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Run

```bash
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Contributing

Otterly uses a ports-and-adapters architecture so the business logic stays testable and the UI remains replaceable.

- Architecture: [docs/architecture.md](./docs/architecture.md)
- Reusable Markdown editor: [packages/markdown_editor](./packages/markdown_editor/README.md) (CodeMirror 6, no Svelte or Tauri dependency; not published yet)
- Editor acceptance contract: [docs/markdown_editor_behavior_spec.md](./docs/markdown_editor_behavior_spec.md)
- Coding guidelines: [devlog/coding_guidelines.md](./devlog/coding_guidelines.md)
- Validation:

```bash
pnpm check
pnpm lint
pnpm test
cd src-tauri && cargo check
pnpm format
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ajkdrag/otterly&type=date&legend=top-left)](https://www.star-history.com/#ajkdrag/otterly&type=date&legend=top-left)

## License

MIT. See [LICENSE](./LICENSE).

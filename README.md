<img src="./assets/icon.png" alt="Otterly icon" width="96">

[![Release](https://github.com/ajkdrag/otterly/actions/workflows/release.yml/badge.svg)](https://github.com/ajkdrag/otterly/actions/workflows/release.yml)

# Otterly

Open a folder of Markdown notes and get to work. Otterly gives you a clean editor, quick search, and links between notes. The files stay on your computer.

## Download

**[Get the latest Otterly release](https://github.com/ajkdrag/otterly/releases/latest)** for macOS, Windows, or Linux. No account is needed.

| Platform                       | Package to choose                                                  |
| ------------------------------ | ------------------------------------------------------------------ |
| macOS (Apple Silicon or Intel) | `.dmg` for your Mac                                                |
| Windows x64                    | `setup.exe` or `.msi`                                              |
| Linux x64                      | `.AppImage` or `.deb`                                              |
| Arch Linux x86_64              | [AUR package](https://aur.archlinux.org/packages/otterly-appimage) |

## See it in action

[Visit the Otterly site](https://ajkdrag.github.io/otterly/) for a 19-second tour of the desktop app and a closer look at its features.

## Why Otterly

Most note apps ask you to choose between polished UX and file ownership.

Otterly is for people who want both:

- a privacy-focused note-taking app
- a local-first Markdown editor
- an Obsidian alternative that stays close to plain files
- a desktop notes app that does not require plugin hunting to feel usable

If you stop using Otterly, your notes are still just Markdown files in a folder you already own.

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

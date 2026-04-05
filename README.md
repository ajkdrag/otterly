<img src="./assets/icon.png" alt="Otterly icon" width="120">

[![Release](https://github.com/ajkdrag/otterly/actions/workflows/release.yml/badge.svg)](https://github.com/ajkdrag/otterly/actions/workflows/release.yml)
[![Reddit](https://img.shields.io/reddit/subreddit-subscribers/obsidianalternative?style=social&logo=reddit)](https://www.reddit.com/r/ObsidianAlternative)

# Otterly

Otterly is a local-first Markdown editor and privacy-focused note-taking app for people who want plain files, fast search, wiki-links, and desktop performance without accounts or cloud lock-in.

Your notes stay as normal Markdown files in a folder you control. Otterly adds the workflow you actually want on top: tabs, backlinks, search, git-aware status, themes, hotkeys, and a command-first omnibar.

## Download

| Platform            | Direct download                                                                                         | Install                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| macOS Apple Silicon | [`.dmg`](https://github.com/ajkdrag/otterly/releases/download/v0.2.2/otterly_0.2.2_aarch64.dmg)         | Open the DMG and drag Otterly into `Applications`.    |
| macOS Intel         | [`.dmg`](https://github.com/ajkdrag/otterly/releases/download/v0.2.2/otterly_0.2.2_x64.dmg)             | Open the DMG and drag Otterly into `Applications`.    |
| Windows x64         | [`setup.exe`](https://github.com/ajkdrag/otterly/releases/download/v0.2.2/otterly_0.2.2_x64-setup.exe)  | Run the installer.                                    |
| Linux x64           | [`.AppImage`](https://github.com/ajkdrag/otterly/releases/download/v0.2.2/otterly_0.2.2_amd64.AppImage) | Make it executable, then run it.                      |
| Debian/Ubuntu       | [`.deb`](https://github.com/ajkdrag/otterly/releases/download/v0.2.2/otterly_0.2.2_amd64.deb)           | Install with your package manager or double-click it. |

[See the latest release](https://github.com/ajkdrag/otterly/releases/latest) if you want checksums, signatures, or every packaged asset.

## Local-First Markdown Editor

- Plain Markdown files in a normal folder
- No accounts, no sync subscription, no proprietary database
- Tauri desktop app with native-feeling performance
- Wiki-links, backlinks, and outlinks built in
- Search files, content, commands, and settings from one omnibar
- Git-aware status and version history support
- Rebindable hotkeys and built-in dark/light themes

<p align="center">
  <img src="./assets/readme/readme-hero-dark.png" alt="Otterly dark theme showing Markdown notes, file tree, tabs, wiki-links, and git-aware status." width="92%">
</p>

## Features

### Writing and Formatting

Otterly keeps the editor close to Markdown while still feeling like a real writing tool. The goal is to make common structure, media, and formatting tasks feel native instead of plugin-dependent.

<p align="center">
  <img src="./assets/readme/readme-hero-dark.png" alt="Otterly editor with Markdown content, tabs, file tree, and formatting controls in the main writing view." width="92%">
</p>

<details>
<summary>Supported capabilities</summary>

- Headings, lists, checklists, tables, quotes, and fenced code blocks
- Slash-driven insertion flow for common block types
- Resizable code blocks with per-tab restore
- Inline and block images with paste/import support
- Resizable images and image captions in the editor
- Plain Markdown files on disk instead of a proprietary note format

</details>

### Navigation and Connected Notes

Search, commands, wiki-links, backlinks, and outlinks are part of the core workflow. You can move through a vault from the keyboard, then inspect note relationships without losing context.

<p align="center">
  <img src="./assets/readme/readme-omnibar.png" alt="Otterly omnibar showing command results for search, navigation, and git actions." width="45%">
  <img src="./assets/readme/readme-links.png" alt="Otterly links panel showing backlinks and outlinks for the current Markdown note." width="50%">
</p>

<details>
<summary>Supported capabilities</summary>

- One omnibar for files, note content, commands, and settings
- `[[wiki-links]]` with backlink and outlink views
- Full-text search across your vault
- File tree and folder navigation
- Starred notes for quick access
- Command-first flow for opening dialogs and actions without hunting through menus

</details>

### Tabs, Workflow, and Daily Use

Otterly is designed for working across multiple notes at once, not just opening one file at a time. Tabs, keyboard shortcuts, recent state, and quick vault actions are treated as first-class features.

<p align="center">
  <img src="./assets/readme/readme-dashboard.png" alt="Otterly vault dashboard showing note count, folder count, recent activity, and quick actions." width="40%" align="center">
</p>

<details>
<summary>Supported capabilities</summary>

- Multiple tabs open at the same time
- Drag-reorder tabs within pinned and unpinned groups
- Pin important tabs so they stay anchored
- Restore tab sessions, cursor position, scroll state, and code block sizes
- Close other tabs, close tabs to the right, and reopen recently closed tabs
- Rebindable hotkeys for navigation and actions
- Vault dashboard with recent notes and quick actions

</details>

### Themes and Personalization

Themes are not just a dark-mode toggle. Otterly supports built-in themes and editable user themes so you can tune typography, spacing, colors, and code presentation without changing your files.

<p align="center">
  <img src="./assets/readme/readme-hero-dark.png" alt="Otterly dark theme workspace." width="48%">
  <img src="./assets/readme/readme-hero-light.png" alt="Otterly light theme workspace." width="48%">
</p>

<details>
<summary>Supported capabilities</summary>

- Built-in dark and light themes
- Duplicate, rename, and delete custom themes
- Adjustable accent color, typography, spacing, and editor padding
- Theme controls for headings, blockquotes, inline code, code blocks, and tables
- Persistent active theme and user theme library
- Keyboard shortcut customization stored in app settings

</details>

### Versioning, Safety, and File Ownership

Otterly stays close to the filesystem while still giving you guardrails for day-to-day work. The app surfaces git-aware state and preserves enough workspace context that you do not lose your place when you come back.

<details>
<summary>Supported capabilities</summary>

- Plain Markdown notes in folders you control
- Git-aware file status in the workspace
- Version history and checkpoints from the app
- Dirty-tab tracking and save-aware close flows
- Session restore for open work
- Recent notes and starred paths persisted per vault

</details>

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

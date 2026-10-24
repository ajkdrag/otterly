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

Otterly can open any `.md` file, not just notes in a vault. The file opens in its own window. Edits save back to the same file, with its line endings kept. Find in file (Cmd/Ctrl+F), source mode, zoom, and F1 help work there too. Right-click the path in the status bar to copy the Markdown or the path, or to show the file in your file manager.

To make Otterly the default app for Markdown:

- **macOS:** Select a `.md` file in Finder, press Cmd+I, pick Otterly under "Open with", and click "Change All".
- **Windows:** Right-click a `.md` file, choose "Open with" > "Choose another app", pick Otterly, and tick "Always use this app".
- **Linux:** Right-click a `.md` file in your file manager, open its properties, and set Otterly as the default for "Markdown". From a terminal: `xdg-mime default otterly.desktop text/markdown`. The desktop file name depends on how you installed Otterly.

## Profiles

A profile is a separate Otterly with its own settings, vault list, window size and tabs. Use one to keep work and personal notes apart, or to get a second window on the same vault.

- In the app: run "Profiles…" from the command palette, then pick a profile or type a new name. On macOS the Dock menu lists them too. Opening a profile that already runs just brings its window to the front.
- From a terminal: `otterly --profile=work`, or `OTTERLY_PROFILE=work otterly`. The flag wins when both are set. Write it with `=`, because `--profile work` is not read as a profile.
- A profile name is up to 32 lowercase letters, digits and dashes. A bad name is logged and Otterly starts the default profile.
- `default` is what you get without a flag. `--profile=default` is the same thing, and it keeps all the data you had before profiles existed.
- Each profile is its own app instance. On macOS you get one Dock icon per running profile. On Windows the windows share the Otterly taskbar button. The window title ends with the profile name, like `notes — My Vault (work)`.
- On macOS, launching Otterly while another profile runs brings that profile to the front. Use the Dock menu or Profiles… to start `default`.
- Two profiles can open the same vault. The notes, the search index, the git history and the starred notes are shared. The open tabs and the recent notes are kept per profile. Treat it like having the vault open in Otterly and another editor.
- Vault settings are shared too. A running profile reads them when it opens the vault and when you open its settings dialog, so avoid saving settings in two profiles on one vault at the same time. The last save wins.
- Only the default profile checks for updates in the background. "Check for Updates" works in any profile. On macOS and Linux, a running profile keeps the old version until you restart it. On Windows, installing an update closes every running profile, because the installer has to replace `otterly.exe`. Save your work in the other profiles first.
- A `.md` file opened from the file manager goes to the default profile on Windows and Linux. On macOS the system picks a running Otterly, and I have not checked which.
- On macOS before 14, profiles share the webview storage, so a profile may flash the wrong theme for a moment on start.
- The Windows jump list and Linux desktop actions do not list profiles. Use the command palette or the flag.

Profile data lives in a folder named after the profile in the same place as the default one:

| Platform | Folder                                                         |
| -------- | -------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/com.otterly.app.profile-<name>` |
| Windows  | `%APPDATA%\com.otterly.app.profile-<name>`                     |
| Linux    | `~/.config/com.otterly.app.profile-<name>`                     |

To delete a profile, quit it and delete that folder. That is also what removes it from the list. Logs and webview data live in a second folder, named the same way:

| Platform | Logs and webview data                                       |
| -------- | ----------------------------------------------------------- |
| macOS    | `~/Library/Logs/com.otterly.app.profile-<name>` (logs only) |
| Windows  | `%LOCALAPPDATA%\com.otterly.app.profile-<name>`             |
| Linux    | `~/.local/share/com.otterly.app.profile-<name>`             |

Delete it too if you plan to create a profile with the same name later, because the new one picks up the old webview data. On macOS 14 and later the webview data (the cached theme) sits in WebKit's own store, not in a folder you can pick out by name.

The profile also leaves files in each vault it opened: its tabs in `.otterly/sessions/latest-<name>.json`, and its recent notes under the `recent_notes-<name>` key in `.otterly/settings.json`. Delete those too if you want it all gone.

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

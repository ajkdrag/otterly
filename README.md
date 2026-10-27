<img src="./assets/icon.png" alt="Otterly icon" width="96">

[![Release](https://github.com/ajkdrag/otterly/actions/workflows/release.yml/badge.svg)](https://github.com/ajkdrag/otterly/actions/workflows/release.yml)

# Otterly

Open a folder of Markdown notes and get to work. Otterly gives you a clean editor, quick search, and links between notes. The files stay on your computer.

## Download

**[Get the latest Otterly release](https://github.com/ajkdrag/otterly/releases/latest)** for macOS, Windows, or Linux. No account is needed.

| Platform                       | Package to choose                                                           |
| ------------------------------ | --------------------------------------------------------------------------- |
| macOS (Apple Silicon or Intel) | `aarch64.dmg` (Apple Silicon) or `x64.dmg` (Intel)                          |
| Windows x64                    | `setup.exe` for most people, `.msi` for managed machines, or `portable.zip` |
| Linux x64                      | `.deb` on Debian and Ubuntu, `.AppImage` elsewhere                          |
| Arch Linux x86_64              | [AUR package](https://aur.archlinux.org/packages/otterly-appimage)          |

Every installed copy updates itself from the same package type you installed. Your notes are plain files in your vault folders, and installing, updating or uninstalling never touches them.

### Windows

- `setup.exe` installs for your user only, needs no admin rights and is the one to pick if you are unsure.
- `.msi` installs for every user on the machine and asks for admin rights, also on each update. Use it when IT deploys software. Do not install both.
- Otterly needs the WebView2 runtime. Windows 11 and up-to-date Windows 10 already have it, and `setup.exe` installs it when it is missing.
- If Windows shows "Windows protected your PC", click "More info" and then "Run anyway". Windows shows this for apps it has not seen often yet.

Uninstall from Settings > Apps. For `setup.exe` installs, tick "Also delete settings and the vault list" to remove those and the logs too. The `.msi` uninstall leaves them, so delete `%APPDATA%\com.otterly.app` and `%LOCALAPPDATA%\com.otterly.app` by hand for a clean removal. Uninstalling a `setup.exe` install gives `.md` files back to the app that opened them before. Each vault keeps a `.otterly` folder with its search index. Delete it by hand if you stop using that vault.

### Windows portable zip

Unzip it anywhere you can write to, such as Documents or a USB stick, and run `otterly.exe`. Everything in the editor works the same as the installed app. A few things differ:

- Data: settings, the vault list, the theme file, the vimrc, logs and the WebView profile live in a `data` folder next to `otterly.exe`. Delete the folder and Otterly leaves nothing behind (Windows itself may still list it under recent apps). A portable copy and an installed one, or two portable copies, run side by side without sharing anything. The first start copies settings and the vault list from an earlier portable or installed Otterly.
- Updates: a portable copy does not update itself. Download the newest zip and replace `otterly.exe`, keeping `portable.txt` and `data` next to it. The app reads `portable.txt` to know it is portable.
- File association: nothing is registered with Windows, so use "Open with" > "Choose another app" > "Choose an app on your PC" and pick `otterly.exe`.
- Run it from an unzipped folder, not from inside the zip. Explorer runs a file inside a zip from a temporary folder without `portable.txt`.

### macOS

Open the `.dmg` and drag Otterly to Applications. The app is not notarized by Apple yet, so the first start shows a warning. Open System Settings > Privacy & Security and click "Open Anyway" next to Otterly, then start it again.

To uninstall, move Otterly to the Bin. Settings and logs live in `~/Library/Application Support/com.otterly.app`, `~/Library/Caches/com.otterly.app`, `~/Library/WebKit/com.otterly.app` and `~/Library/Logs/com.otterly.app`. Delete them for a clean removal.

### Linux

- `.deb`: `sudo apt install ./otterly_<version>_amd64.deb`. It adds Otterly to your app menu and opens `.md` files. Updates ask for your password, since they install a new `.deb`. Remove it with `sudo apt remove otterly`.
- `.AppImage`: make it executable (`chmod +x`) and run it. Keep it in a folder you can write to, since updates replace the file. Ubuntu 22.04 and later need `libfuse2` (`sudo apt install libfuse2`) to run AppImages.

Settings live in `~/.config/com.otterly.app`, and logs and the WebView profile in `~/.local/share/com.otterly.app`. Delete them for a clean removal.

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

## Several Windows

- New Window opens another Otterly window on the vault picker. On macOS use the Dock menu or File > New Window (Shift+Cmd+N). The command palette has New Window too. On Windows and Linux, starting Otterly again also opens one.
- In the vault picker and the vault switcher, the window button on a row (or Cmd/Ctrl+Enter on the highlighted row) opens that vault in a new window. Clicking the row opens it in this window.
- A vault is open in one window at a time. Opening a vault that another window has brings that window to the front. Settings, themes and hotkeys are shared by all windows.

## Vim Mode

Turn it on in Settings, under Vim. Notes and text files then use Vim keys: `hjkl`, `w` `b` `e`, `0` `$`, `gg` `G`, `d` `c` `y` with motions and text objects, `dd` `yy` `p`, `v` `V` and Ctrl-v, `u` and Ctrl-r, `/` search, `i` `a` `o` `O`, registers, macros, counts, and `.`. The status bar shows the mode, the keys of a command you are still typing, and the register of a macro you are recording. Normal and visual mode draw a block cursor. Code blocks and tables show their Markdown source while the cursor is inside them, so Vim edits the whole file.

It follows real Vim. The few places where it does not are listed in the package design (`packages/markdown_editor/DESIGN.md`).

- `u` undoes one typed command or one insert session, like Vim. A macro, a map and `.` are one step each.
- `:w` saves, `:q` closes the tab (it asks first when there are unsaved changes), and `:wq` does both. On a new note, `:wq` opens the save dialog and keeps the tab open.
- Every yank and put uses the system clipboard (`clipboard=unnamed`). Put `set clipboard=` in your vimrc to keep them inside Vim.
- `o` and `O` continue a list, task or quote, like Enter does in insert mode.
- Search ignores case unless the pattern has a capital letter.

Cmd keys stay app shortcuts. On macOS, Ctrl keys go to Vim inside the editor. On Windows and Linux the app shortcuts on Ctrl (Ctrl+F, Ctrl+O and so on) win. On macOS, Settings has a "Repeat held keys" switch that turns off the accent menu, so holding `l` keeps moving right.

Key maps and options go in a `vimrc` file next to `settings.json`, at `<app config dir>/otterly/vimrc`. That is `~/Library/Application Support/com.otterly.app/otterly/vimrc` on macOS. Settings, under Vim, shows the path. "Open vimrc" there creates it with examples and opens it in its own window. A window reloads it when you come back to it.

```vim
let mapleader = " "
imap jk <Esc>
nnoremap Y y$
nnoremap <leader>w :w<CR>
set clipboard=unnamed
set timeoutlen=500
```

You get `map`, `nmap`, `vmap`, `xmap`, `imap`, `omap`, their `noremap` and `unmap` forms (and Vim's short names, such as `nn` and `ino`), `let mapleader`, and `set`. A vimrc pasted from terminal Vim works: Vimscript (`if`, `function`, `autocmd`, `Plug`), plugin maps (`<Plug>`, `<SID>`), command-line maps, and settings this editor has no use for (`syntax on`, `set number`, `set smarttab`, `set textwidth=80`) are skipped, and Settings lists them apart from the lines that really failed.

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

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

- Committers and reviewers: [Altamash Khan (@ajkdrag)](https://github.com/ajkdrag)
- Approvers: [Altamash Khan (@ajkdrag)](https://github.com/ajkdrag)

Every release is built by GitHub Actions from this repository and each signing request is approved by hand.

### Privacy policy

Otterly keeps your notes on your computer. The installed app checks GitHub for a newer version every few hours. That check downloads `latest.json` from this repository's releases and sends no notes, file names or other personal data. The portable copy does not check at all. Nothing else leaves your computer unless you ask for it, for example by opening a link.

## License

MIT. See [LICENSE](./LICENSE).

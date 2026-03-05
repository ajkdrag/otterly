# Carbide: Revised Project Guide (v2)

## Strategy: Fork Otterly, Borrow from Moraya

Building from scratch is a multi-month time sink during a PhD. The faster path:

1. **Fork Otterly** as the foundation — it already has the vault model, file tree, Tauri v2 + Milkdown stack, local-first `.md` storage, image paste-to-assets, **git integration (git2 crate with full UI)**, **multiple vault support**, and **resizable split panes**. This gives us most of the core for free.
2. **Study Moraya's codebase** for specific features Otterly lacks — Moraya has working implementations of: outline view, macOS default-app file associations, and PDF export. Extract the architectural patterns and adapt them into the Otterly fork.
3. **Build the genuinely novel pieces ourselves** — plugin system, terminal panel, PDF _viewing_ (not just export), and document-level split view (Otterly's split is layout panes, not side-by-side docs).

Both repos are forked locally at `/Users/abir/src/otterly` and `/Users/abir/src/moraya`.

### What Otterly Already Has (Day 1)

- Tauri v2 + Milkdown WYSIWYG markdown editor
- Vault-based file tree sidebar with search
- Image paste → local assets folder
- Plain `.md` file storage
- **Multiple vault support** — vault picker, vault switcher, per-vault state, cross-vault open dialog
- **Git integration via git2 crate** — status bar (branch + dirty state), commit dialog, version history with diff view, file restore, git init, tagging
- **Resizable 3-pane layout** — file tree | editor | links panel, with drag handles
- Basic keyboard shortcuts
- iCloud/Dropbox-compatible (it's just a folder)

### What We Adapt from Moraya's Patterns

- **Outline view** — Moraya has `OutlinePanel.svelte`: extracts headings from editor state, renders hierarchy with indentation, highlights active heading, debounced live updates. We adapt this for Milkdown's ProseMirror state (Moraya also uses ProseMirror, so the heading extraction logic translates directly).
- **macOS default app registration** — Moraya's `tauri.conf.json` declares `fileAssociations` for `.md`, `.markdown`, `.mdx`, `.txt` with MIME types and editor role. Its `lib.rs` handles `file://` scheme open events. We replicate this pattern in the Otterly fork.
- **PDF export** — Moraya uses `jsPDF` to export editor content as multi-page PDF. We take this as a starting point and extend it to PDF _viewing_ (which neither project has).

### What We Build New

These features don't exist in either project:

1. **Vault switcher dropdown** — Otterly has a vault picker dialog; Carbide adds a Moraya-style dropdown in the sidebar header for fast vault switching. (Future: simultaneous multi-vault sidebar with all vaults as collapsible root nodes.)
2. **Document-level split view** — open two different files side by side (Otterly has resizable panes but they're fixed to file-tree | editor | links, not two editors)
3. **Terminal panel** — embedded PTY terminal
4. **In-app document viewer** — render PDFs, images, CSVs, and other non-markdown files directly in the editor area (not just export). Neither project has a viewer for non-markdown content.
5. **Plugin system** — the long-term differentiator

### What Otterly Already Has That We Enhance

- **Git integration** — Otterly has commit/status/diff/history/restore. We add: push/pull with SSH auth, auto-commit option (on-save / interval), and a more prominent status bar widget.
- **Multiple vaults** — Otterly supports multiple vaults with a picker dialog. We add a quick-access dropdown switcher in the sidebar header (Moraya-style). Simultaneous multi-vault sidebar deferred to future.

---

## Part 1: Inspecting Octarine (Reference Only)

The original binary inspection steps remain useful for understanding what a polished Tauri note app looks like under the hood.

```bash
# Inspect Octarine's app bundle (macOS)
ls -la /Applications/Octarine.app/Contents/
otool -L /Applications/Octarine.app/Contents/MacOS/Octarine
strings /Applications/Octarine.app/Contents/MacOS/Octarine | grep -i "tauri\|prosemirror\|tiptap\|milkdown"
strings /Applications/Octarine.app/Contents/MacOS/Octarine | grep -i "serde\|tokio\|sqlx\|rusqlite"
codesign -d --entitlements - /Applications/Octarine.app
```

---

## Part 2: The Project Prompt

Use this prompt with Claude to bootstrap Carbide from the Otterly fork.

---

```text
I'm building "Carbide" — a high-performance, local-first markdown note-taking app
with a plugin system. I'm forking Otterly (Tauri v2 + Milkdown vault editor) as my
starting point. The fork is at /Users/abir/src/otterly. I also have Moraya forked
at /Users/abir/src/moraya for reference.

My background: computational biology PhD student. Heavy LaTeX, git workflows, multi-year
vault. Comfortable with Rust. I want to move fast by building on existing open-source work.

## What Otterly Already Provides (DO NOT REBUILD)
- Tauri v2 (Rust backend + system webview)
- Milkdown editor (ProseMirror-based WYSIWYG markdown)
- Vault model (open folder, file tree, file operations)
- Image paste to local assets
- Plain .md file storage
- Multiple vault support (picker, switcher, per-vault state) — one vault at a time
- Git integration via git2: status, commit, diff, version history, file restore, init, tagging
- Resizable 3-pane layout (file tree | editor | links panel)

## Features to Add (Prioritized)

### Tier 1 — Core UX (make it a daily driver)

**1. Vault Switcher Dropdown** [Adapt from Moraya's dropdown pattern]
Otterly has vault switching but via a picker dialog. Carbide adds a quick-access
dropdown in the sidebar header (like Moraya's knowledge base switcher):
- Dropdown in sidebar header showing current vault name + chevron
- Lists all known vaults (pinned first, then by recency)
- Click to switch vault (uses existing switch_vault logic)
- "Add Vault" and "Manage Vaults" options in dropdown
- Keyboard shortcut: Cmd+Shift+V
- Show git branch + dirty indicator per vault in dropdown

**Future enhancement**: Simultaneous multi-vault sidebar (VS Code multi-root style)
where all open vaults appear as collapsible root nodes. Deferred — requires
rearchitecting the single-vault assumption throughout the codebase.

**2. Outline View** [Adapt from Moraya's OutlinePanel.svelte]
- Sidebar panel showing heading hierarchy from Milkdown's ProseMirror doc state
- Click heading → scroll to it
- Collapsible sections, live updates as you type
- Toggle with Cmd+Shift+O
- Reference: Moraya extracts headings with level-based indentation, highlights active
  heading, debounces updates at 300ms. Same ProseMirror foundation, so logic translates.

**3. Open as Default Markdown App (macOS)** [Adapt from Moraya's tauri.conf.json]
- Add fileAssociations to tauri.conf.json for .md, .markdown, .mdx
- Handle file-open events in Rust (Moraya's lib.rs has file:// scheme handling)
- If file is inside a known vault → open that vault + navigate to file
- If outside any vault → standalone single-file mode
- Drag-and-drop .md files onto dock icon

**4. Document Split View** [New — extends Otterly's existing pane system]
- Cmd+\ to split the editor area into two independent editor instances
- Each pane can open a different file from the same vault
- Otterly already has Resizable.PaneGroup infrastructure — extend it to support
  multiple editor panes within the center area
- Drag tab to split, drag back to merge
- Max 2-3 panes

### Tier 2 — Power Features

**5. Git Enhancements** [Extend Otterly's existing git2 integration]
Otterly already has: git_status, git_stage_and_commit, git_log, git_diff,
git_show_file_at_commit, git_restore_file, git_create_tag, git_init_repo.
We add:
- Push/pull support (detect remote, SSH key auth via ssh2 crate or git2's SSH transport)
- Auto-commit option (configurable: off, on-save, every N minutes)
- More prominent status bar git widget (Otterly's exists but may need polish)

**6. Terminal Panel** [Use existing plugin — don't build from scratch]
- **Use [`tauri-plugin-pty`](https://github.com/Tnze/tauri-plugin-pty)** — a Tauri 2-native PTY plugin
  - Rust: `cargo add tauri-plugin-pty` → one-liner `.plugin(tauri_plugin_pty::init())`
  - Frontend: `npm install tauri-pty` + xterm.js + xterm-addon-fit
  - Handles PTY spawn, resize, data transport via Tauri events out of the box
  - No need to write custom `terminal_spawn`/`terminal_write`/`terminal_resize` commands
- Bottom panel toggled with Cmd+` (like VS Code)
- Shell inherits user's default shell (zsh/bash) and environment
- Working directory = current vault root
- Resize handle between editor and terminal
- Multiple terminal tabs (stretch goal)
- Why: comp bio workflows need terminal access for scripts, conda, git operations
- **Reference implementations:**
  - [marc2332/tauri-terminal](https://github.com/marc2332/tauri-terminal) — minimal xterm.js + portable-pty example
  - [Terminon](https://github.com/Shabari-K-S/terminon) — full Tauri v2 terminal app (split panes, SSH profiles)
  - [terraphim-liquid-glass-terminal](https://github.com/terraphim/terraphim-liquid-glass-terminal) — WebGL xterm rendering

**7. In-App Document Viewer** [New — neither project has non-markdown viewing]
Open non-markdown files directly in the editor area instead of launching external apps:
- **PDF**: render via pdf.js — page navigation, zoom, scroll, text search
- **Images**: display PNG, JPG, SVG, GIF with zoom/pan controls
- **CSV/TSV**: render as a sortable, scrollable table
- **Code files** (.py, .R, .rs, .json, .yaml, etc.): syntax-highlighted read-only view
- **Plain text**: render as-is
- File tree click on any supported type opens it in the editor pane
- Side-by-side: PDF/image in one split pane, notes in the other
- Drag a non-markdown file into a note → insert appropriate markdown link
- PDF export of notes (adapt Moraya's jsPDF approach)
- Stretch: PDF annotation highlights synced to a linked note
- Why: comp bio vaults contain PDFs (papers), CSVs (data), images (figures),
  scripts (.py/.R). Constantly switching to Preview/Finder breaks flow.

### Tier 3 — Extensibility (long-term moat)

**8. Plugin System** [New]
- Plugins are TypeScript/JS in sandboxed iframes within the webview
- Plugin API: vault (read/write files), editor (insert/replace/decorate),
  commands (palette entries), UI (sidebar panels, status bar), events, metadata
- Loaded from `<vault>/.carbide/plugins/`
- Each plugin: manifest.json + main.js + optional styles.css
- Permission model via manifest (fs:read, fs:write, editor:modify, network:fetch)
- Hot-reload in dev mode, versioned API

## What I Need Right Now

### Step 1: Audit Otterly
- Get it building locally with `cargo tauri dev`
- Audit: document current architecture, Rust modules, frontend components,
  Tauri command surface
- Identify exact integration points for each new feature
- Produce AUDIT.md

### Step 2: Architecture Plan for Carbide Additions
ARCHITECTURE.md covering:
- Rust modules to add: terminal-host, document-viewer, plugin-host
- Rust modules to extend: git (push/pull/auto-commit)
- Frontend modules to add: vault switcher dropdown, outline panel, split-view editor,
  terminal, document viewer (PDF/image/CSV/code), plugin bridge
- New Tauri commands
- How each module hooks into Otterly's existing code (minimal invasive changes)
- Plugin API TypeScript interfaces

### Step 3: Implement Tier 1 features (one PR per feature)

Start with the audit. Don't write application code yet.
```

---

## Part 3: Follow-up Prompts

### Prompt 2: Vault Switcher Dropdown

```text
Add a Moraya-style vault switcher dropdown to Otterly's sidebar.

Current state: Otterly shows one vault at a time. Switching requires opening the
vault picker dialog. The vault management code is in src/lib/features/vault/ and
the sidebar layout is in workspace_layout.svelte.

Target: A dropdown in the sidebar header for fast vault switching without a dialog.

Implementation:
- Dropdown component in sidebar header: shows current vault name + chevron icon
- Click to expand: lists all known vaults, pinned first, then sorted by recency
- Click a vault → calls existing VaultService.switch_vault() — no architectural changes
- "Add Vault" option at bottom → opens native folder picker dialog
- "Manage Vaults" option → opens existing vault management dialog
- Show vault icon or first-letter avatar as visual identifier
- Right-click vault in dropdown → Remove from list, Reveal in Finder
- Keyboard shortcut: Cmd+Shift+V to open the dropdown
- Show git branch + dirty indicator per vault in dropdown (lazy-fetch on expand)

Reference: Study Moraya's KnowledgeBaseManager.svelte for the dropdown pattern.

Considerations:
- This is purely a UI improvement — no changes to the single-vault model
- Existing VaultStore.vault, switch_vault(), and all store resets remain as-is
- Keep it simple: dropdown, not a full sidebar rearchitecture

Result: I click the vault name in the sidebar header, see my vaults in a dropdown,
and click to switch instantly. No dialog needed for the common case.
```

### Prompt 3: Outline View

```text
Implement the outline view on the Otterly fork.

Reference implementation: Moraya's OutlinePanel.svelte at /Users/abir/src/moraya.
It extracts headings from ProseMirror editor state, renders them as an indented
hierarchy with active heading highlighting, and debounces updates.

In Otterly:
- Add a new panel to the right sidebar (alongside the existing Links tab)
- Extract heading nodes from Milkdown's ProseMirror doc state
- Render as nested clickable list, click → scroll to heading
- Live update via editor transaction listener (debounced)
- Cmd+Shift+O to toggle the outline panel
- Collapsible heading sections

Result: Open a long note, see its heading structure in the right sidebar, click
to navigate. Outline updates as I type new headings.
```

### Prompt 4: Default App + Split View

```text
Implement macOS default app registration and document split view.

1. macOS Default App:
   Reference: Moraya's tauri.conf.json fileAssociations and lib.rs file:// handling.
   - Add fileAssociations for .md, .markdown, .mdx to Otterly's tauri.conf.json
   - Handle file-open events in Rust backend
   - If file is in a known vault → open vault + navigate to file
   - If outside → standalone single-file mode
   - Test: right-click .md in Finder → Open With → Carbide

2. Document Split View:
   Otterly already uses Resizable.PaneGroup (in workspace_layout.svelte) for its
   3-pane layout. Extend the center editor pane to support multiple editor instances:
   - Cmd+\ to split, each pane opens a different file
   - Shared vault context (file tree, git status)
   - Drag divider to resize, Cmd+W to close pane
   - Remember split state per vault

Result: I can open .md files from Finder. I can view two documents side by side.
```

### Prompt 5: Git Enhancements

```text
Extend Otterly's existing git integration with push/pull and auto-commit.

Otterly already has in src-tauri/src/features/git/service.rs:
- git_has_repo, git_init_repo, git_status, git_stage_and_commit
- git_create_tag, git_log, git_diff, git_show_file_at_commit, git_restore_file

Frontend git UI in src/lib/features/git/ui/:
- git_status_widget.svelte, checkpoint_dialog.svelte
- version_history_dialog.svelte, git_diff_view.svelte

Add:
1. Push/pull commands using git2's remote operations
   - Detect configured remotes
   - SSH auth: detect ~/.ssh keys, support ssh-agent
   - HTTPS: credential helper passthrough
   - Push/pull buttons in the git status widget

2. Auto-commit feature:
   - Settings option: off / on-save / every N minutes
   - Uses existing git_stage_and_commit with auto-generated message
   - Configurable per vault

3. Status bar polish:
   - Show ahead/behind counts relative to remote
   - Sync indicator during push/pull

Result: I can push/pull from within the app, and optionally auto-commit on save.
```

### Prompt 6: Terminal Panel

```text
Implement the embedded terminal panel using tauri-plugin-pty (don't build from scratch).

## Research Findings (March 2026)

The best option is `tauri-plugin-pty` — a Tauri 2-native plugin that handles all the
PTY plumbing. No need to manually wire portable-pty + custom Tauri commands.

- GitHub: https://github.com/Tnze/tauri-plugin-pty
- crates.io: https://crates.io/crates/tauri-plugin-pty
- npm: tauri-pty

Other references studied:
- marc2332/tauri-terminal — minimal example (xterm.js + portable-pty)
- Terminon (Shabari-K-S/terminon) — full terminal app, Tauri v2 + React + xterm.js
- terraphim-liquid-glass-terminal — WebGL xterm, high-perf PTY management

## Implementation

Rust side:
- cargo add tauri-plugin-pty
- Register plugin: .plugin(tauri_plugin_pty::init())
- That's it — no custom terminal_spawn/write/resize/kill commands needed
- Working directory defaults to vault root (configure on spawn)

Frontend:
- npm install tauri-pty xterm xterm-addon-fit
- Create TerminalPanel.svelte: mount xterm.js, connect via tauri-pty's API
- Bottom panel toggled with Cmd+`
- Draggable resize handle between editor area and terminal
- Terminal persists across file/tab switches
- Cmd+Shift+` for additional terminal tab (stretch)

Integration:
- Add terminal pane below the existing editor area in workspace_layout.svelte
- Use Otterly's existing Resizable.PaneGroup pattern for the vertical split

Result: I can toggle a terminal, run scripts, use git CLI, activate conda envs —
all inside Carbide.
```

### Prompt 7: In-App Document Viewer

```text
Implement viewing of non-markdown files directly in the editor area.

Currently, clicking a non-.md file in the file tree does nothing useful.
Carbide should open these files inline:

1. PDF Viewer (primary):
   - Add pdfjs-dist to package.json
   - When a .pdf is selected in the file tree, render in the editor pane via pdf.js
   - Controls: page navigation, zoom, scroll, text search
   - "Open to Side" context menu → PDF in one split pane, notes in the other

2. Image Viewer:
   - Display PNG, JPG, SVG, GIF, WebP directly in the editor pane
   - Zoom/pan controls, fit-to-width default
   - Dark/light checkerboard background for transparent images

3. CSV/TSV Viewer:
   - Parse via a lightweight lib (e.g., papaparse)
   - Render as a scrollable, sortable table
   - Column resize, row count display

4. Code/Text File Viewer:
   - Syntax-highlighted read-only view for .py, .R, .rs, .json, .yaml, .toml, .sh, etc.
   - Use a lightweight highlighter (e.g., Shiki or highlight.js)
   - Line numbers, copy button

5. Cross-cutting:
   - File tree icon badges indicate file type
   - Drag any supported file into a note → insert markdown link/embed
   - PDF export of notes (adapt Moraya's jsPDF from export-service.ts)
   - Stretch: PDF text selection → "Copy as Quote" into active note
   - Stretch: PDF annotations stored in .carbide/annotations/<filename>.json

Architecture:
- Create a DocumentViewer component that dispatches to the right renderer based
  on file extension. The editor pane already shows Milkdown for .md files;
  extend it to show the appropriate viewer for other types.

Result: I click a PDF in my vault → it renders in the editor area. I click a .csv →
I see a table. I open a .py → syntax-highlighted code. All without leaving Carbide.
```

### Prompt 8: Plugin System

```text
Implement the plugin system:

Rust side:
- Plugin discovery: scan <vault>/.carbide/plugins/ for folders with manifest.json
- Manifest parsing and permission validation
- Tauri commands for plugin ↔ vault/git/fs operations (gated by permissions)

Frontend:
- Plugin sandbox: each plugin runs in a sandboxed iframe
- postMessage-based RPC bridge between plugin iframe and main app
- TypeScript SDK: @carbide/plugin-api with types for Vault, Editor,
  Commands, UI, Events, Settings
- Lifecycle: discover → validate → load → activate → deactivate

Demo plugins:
1. "Hello World" — registers command palette entry, inserts text at cursor
2. "Word Count" — status bar item with live word/character count
3. "LaTeX Snippets" — snippet expansion (//frac → \frac{}{}, etc.)

Result: All three demo plugins work. A developer can write a TypeScript plugin,
drop it in .carbide/plugins/, and it loads on restart.
```

---

## Development Timeline (Realistic for PhD Student)

| Phase | Features                                        | Est. Effort | Milestone                                   |
| ----- | ----------------------------------------------- | ----------- | ------------------------------------------- |
| 0     | Audit Otterly, get building, rebrand to Carbide | 1 weekend   | `cargo tauri dev` works                     |
| 1     | Vault switcher dropdown                         | 3–5 days    | Fast vault switching from sidebar           |
| 2     | Outline view                                    | 3–5 days    | Heading navigation while editing            |
| 3     | Default app + Document split view               | 1–2 weeks   | Open .md from Finder, two docs side by side |
| 4     | Git push/pull + auto-commit                     | 1 week      | Full git workflow without leaving app       |
| 5     | Terminal panel                                  | 1–2 weeks   | No more window-switching for scripts        |
| 6     | In-app document viewer (PDF, images, CSV, code) | 2–3 weeks   | View any file type without leaving app      |
| 7     | Plugin system                                   | 3–4 weeks   | Extensibility unlocked                      |

**Total: ~9–14 weeks of part-time work.**

Phase 1 (vault switcher dropdown) is now a lightweight UI addition — no architectural changes to the single-vault model. This means we get to a daily driver faster (Phases 1–3). Simultaneous multi-vault sidebar is deferred as a future enhancement that would require rearchitecting the single-vault assumption. Phase 6 (document viewer) is modular and can be built incrementally (start with PDF, add other types later).

## Editor Framework Note

Otterly already uses **Milkdown** (ProseMirror-based, markdown-native WYSIWYG). This is the right choice — don't switch. Milkdown's plugin architecture aligns with our plugin system goals, and it has existing plugins for LaTeX (`@milkdown/plugin-math`) and code blocks that we can enable immediately.

## Codebase Reference

### Otterly Key Paths (`/Users/abir/src/otterly`)

- **Rust backend**: `src-tauri/src/features/git/service.rs` (8+ git commands)
- **Git UI**: `src/lib/features/git/ui/` (status widget, commit dialog, history, diff view)
- **Vault management**: `src/lib/features/vault/` (selection, dashboard, switcher dialogs)
- **Layout**: `src/lib/app/bootstrap/ui/workspace_layout.svelte` (3-pane resizable)
- **Tauri config**: `src-tauri/tauri.conf.json`

### Moraya Key Paths (`/Users/abir/src/moraya`)

- **Outline panel**: `src/lib/components/OutlinePanel.svelte`
- **File associations**: `src-tauri/tauri.conf.json` (lines 45–68)
- **File open handling**: `src-tauri/src/lib.rs` (file:// scheme)
- **PDF export**: `src/lib/services/export-service.ts` (jsPDF)
- **Split mode**: `src/lib/stores/editor-store.ts` (visual/source/split modes)
- **Knowledge bases**: `src/lib/stores/files-store.ts`, `src/lib/components/KnowledgeBaseManager.svelte`

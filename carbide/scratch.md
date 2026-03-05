# Scratch: Portable Components for Otterly

Reference document cataloging high-value features from [scratch](~/src/scratch/) (React/Tauri markdown editor) that can be ported to Otterly (SvelteKit/Tauri).

Source: `~/src/scratch/`

---

## 1. Tantivy Full-Text Search (Rust)

**Files:** `src-tauri/src/lib.rs` (lines 139-307), `src-tauri/Cargo.toml`

**What it does:** Rust-native full-text search engine with scored results, prefix fallback, and incremental indexing. Far superior to naive substring matching for large vaults.

**Schema:**

```rust
// Fields: id (STRING|STORED), title (TEXT|STORED), content (TEXT|STORED), modified (INDEXED|STORED)
let id_field = schema_builder.add_text_field("id", STRING | STORED);
let title_field = schema_builder.add_text_field("title", TEXT | STORED);
let content_field = schema_builder.add_text_field("content", TEXT | STORED);
let modified_field = schema_builder.add_i64_field("modified", INDEXED | STORED);
```

**Key APIs:**

- `SearchIndex::new(index_path)` - Creates/opens index at a path with 50MB write buffer
- `SearchIndex::index_note(id, title, content, modified)` - Upserts a document (delete-then-add)
- `SearchIndex::delete_note(id)` - Removes by ID term
- `SearchIndex::search(query_str, limit)` - Parses query, falls back to prefix (`query*`) on parse failure, returns top N results with score
- `SearchIndex::rebuild_index(notes_folder)` - Walks folder, re-indexes all `.md` files

**Dependency:** `tantivy = "0.22"`, `walkdir = "2"`

**Integration notes:**

- Index stored in app data dir (`app.path().app_data_dir()/search_index`)
- File watcher automatically updates index on create/modify/delete events
- Search results include `id`, `title`, `preview` (first non-title line, stripped of markdown), `modified`, and `score`
- Query parser searches both `title` and `content` fields

**Porting effort:** Medium. The Rust code is self-contained. Needs: Tauri command wrappers, frontend service layer, and wiring into Otterly's existing search feature store.

---

## 2. File Watcher with Per-File Debounce (Rust)

**Files:** `src-tauri/src/lib.rs` (lines 1495-1628)

**What it does:** Uses `notify` crate with a custom per-file debounce map (500ms per path). Cleans up stale entries after 5 seconds. Emits typed events (`created`/`modified`/`deleted`) with note IDs to the frontend, and auto-updates the Tantivy search index on external changes.

**Key pattern:**

```rust
// Per-file debounce with cleanup
let mut map = debounce_map.lock().expect("debounce map mutex");
let now = Instant::now();
if map.len() > 100 {
    map.retain(|_, last| now.duration_since(*last) < Duration::from_secs(5));
}
if let Some(last) = map.get(path) {
    if now.duration_since(*last) < Duration::from_millis(500) {
        continue;
    }
}
map.insert(path.clone(), now);
```

**Event payload:**

```rust
struct FileChangeEvent {
    kind: String,      // "created" | "modified" | "deleted"
    path: String,      // absolute path
    changed_ids: Vec<String>,  // note IDs affected
}
```

**Smart edge case handling:**

- A `modify` event on a non-existent file is treated as `deleted`
- File-gone-between-event-and-read is treated as deletion
- Debounce map auto-cleans when it exceeds 100 entries

**Dependency:** `notify = "6"`

**Porting effort:** Low-Medium. Otterly already has a `watcher` feature. Compare implementations and cherry-pick the debounce pattern and search-index integration.

---

## 3. AI CLI Integration (Rust + TypeScript)

**Files:** `src-tauri/src/lib.rs` (lines 2148-2347), `src/services/ai.ts`

**What it does:** Executes AI CLI tools (Claude Code, Codex, Ollama) from within the app. Detects CLI availability, spawns processes with stdin/stdout capture, enforces a 5-minute timeout with process kill, and strips ANSI escape codes from output.

**Architecture:**

```
Frontend (ai.ts)           Rust (lib.rs)
───────────────           ──────────────
checkClaudeCli()   ──>    ai_check_claude_cli()   // check_cli_exists("claude")
executeClaudeEdit() ──>   ai_execute_claude()     // execute_ai_cli() shared runner
checkCodexCli()    ──>    ai_check_codex_cli()
executeCodexEdit() ──>    ai_execute_codex()
checkOllamaCli()   ──>    ai_check_ollama_cli()
executeOllamaEdit() ──>   ai_execute_ollama()
```

**Shared runner pattern (`execute_ai_cli`):**

1. Expands PATH (reads shell profile to find CLI binaries)
2. Checks CLI exists
3. Spawns process with piped stdin/stdout/stderr
4. Writes prompt to stdin, closes pipe
5. Reads stdout/stderr without holding process lock (allows timeout kill)
6. 5-minute timeout with SIGKILL + 5s grace period for task join
7. Strips ANSI escape sequences from output

**Result type:**

```typescript
interface AiExecutionResult {
  success: boolean;
  output: string;
  error: string | null;
}
```

**Porting effort:** Medium. The Rust `execute_ai_cli` is ~180 lines but well-structured. The TypeScript service layer is trivial. Main work is building the Svelte UI (prompt modal + response display).

---

## 4. Git Remote Operations (Rust)

**Files:** `src-tauri/src/git.rs` (full file, 485 lines)

**What it does:** Complete git CLI wrapper with: status, init, commit, push, fetch, pull, remote add, push with upstream tracking. Includes user-friendly error parsing for auth failures, network issues, merge conflicts, and diverged histories.

**Key types:**

```rust
struct GitStatus {
    is_repo: bool,
    has_remote: bool,
    has_upstream: bool,
    remote_url: Option<String>,
    changed_count: usize,
    ahead_count: i32,     // -1 = no upstream
    behind_count: i32,    // -1 = no upstream
    current_branch: Option<String>,
    error: Option<String>,
}

struct GitResult {
    success: bool,
    message: Option<String>,
    error: Option<String>,
}
```

**Capabilities beyond basic git:**

- `push()` / `fetch()` / `pull()` with network timeouts (`http.lowSpeedLimit`, `ssh -o ConnectTimeout=10`)
- `add_remote()` with URL validation (https://, http://, git@)
- `push_with_upstream()` for first push to new remote
- `get_remote_url()` to display remote info
- Human-readable error messages: "Authentication failed. Check your SSH keys or credentials.", "Commit your changes before syncing with remote.", etc.

**Cross-platform:** Windows hides console window via `CREATE_NO_WINDOW` flag on all git commands.

**Porting effort:** Low. Self-contained Rust module. Otterly already has a `git` feature — compare and merge the remote operations (`push`, `pull`, `fetch`, `add_remote`, `push_with_upstream`) and error parsing.

---

## 5. Wikilink Extension (TipTap)

**Files:** `src/components/editor/Wikilink.ts` (72 lines)

**What it does:** TipTap Node extension for `[[note title]]` wikilinks. Handles parsing from markdown, rendering to HTML, and roundtripping back to markdown.

**Key design:**

```typescript
// Inline atom node with noteTitle attribute
// Markdown tokenizer: matches [[...]] (no nested brackets)
// Roundtrip: parseMarkdown → wikilink node → renderMarkdown back to [[title]]
markdownTokenizer: {
    name: "wikilink",
    level: "inline",
    start: "[[",
    tokenize(src) {
        const match = src.match(/^\[\[([^\]]+?)\]\]/);
        // returns { type: "wikilink", raw: match[0], text: match[1] }
    },
},
```

**Storage:** Maintains a `notes: NoteMetadata[]` list for autocomplete suggestions (populated externally).

**Porting effort:** High conceptual, low code. The TipTap extension is React-agnostic — the core Node definition, tokenizer, and markdown serialization work unchanged. Otterly would need to integrate with its editor (if TipTap-based) or reimplement the `[[]]` parsing for its markdown pipeline. The suggestion UI (`WikilinkSuggestion.tsx` / `WikilinkSuggestionList.tsx`) would need Svelte equivalents.

---

## 6. Mermaid Diagram Rendering

**Files:** `src/components/editor/MermaidRenderer.tsx` (52 lines)

**What it does:** Renders Mermaid diagram code to SVG using `beautiful-mermaid` library. Supports CSS variable theming (bg, fg, muted, border colors). Synchronous rendering with error handling.

**Key pattern:**

```typescript
const svg = renderMermaidSVG(code.trim(), {
  bg: "var(--color-bg)",
  fg: "var(--color-text)",
  muted: "var(--color-text-muted)",
  border: "var(--color-border-solid)",
  transparent: true,
});
```

**Dependency:** `beautiful-mermaid` (sync SVG rendering, no async/WASM overhead)

**Porting effort:** Low. The rendering logic is framework-agnostic. Svelte component would be simpler than the React version. Main work is integrating with the editor's code block handling to detect `language: "mermaid"` blocks.

---

## 7. Math/LaTeX Support (TipTap)

**Files:** `src/components/editor/MathExtensions.ts` (71 lines), `src/components/editor/BlockMathEditor.tsx` (74 lines)

**What it does:** Extends TipTap's `@tiptap/extension-mathematics` for block math (`$$...$$`). Adds input rules, custom ProseMirror plugins for selection handling, and a keyboard-accessible editor popup.

**Key features:**

- Input rule: typing `$$expr$$` converts to rendered math block
- Node selection clears DOM selection to prevent highlight bleed
- Enter/Space on selected math block opens editor
- `BlockMathEditor`: textarea with Cmd+Enter to apply, Escape to cancel

**Dependencies:** `@tiptap/extension-mathematics`, KaTeX (for rendering)

**Porting effort:** Medium. Depends on editor choice. If Otterly uses TipTap, the extension code ports directly. The editor UI needs a Svelte rewrite.

---

## 8. PDF/Markdown Export

**Files:** `src/services/pdf.ts` (66 lines)

**What it does:** Two export methods:

1. **PDF:** Triggers `window.print()` for native print dialog (users choose "Save as PDF")
2. **Markdown:** Uses Tauri's native save dialog (`@tauri-apps/plugin-dialog`) to write `.md` files via a Rust command

**Key pattern:**

```typescript
// Markdown export with native save dialog
const filePath = await save({
  defaultPath: `${sanitizedTitle}.md`,
  filters: [{ name: "Markdown", extensions: ["md"] }],
});
const encoder = new TextEncoder();
await invoke("write_file", {
  path: filePath,
  contents: Array.from(encoder.encode(markdown)),
});
```

**Porting effort:** Low. Both approaches are framework-agnostic. The Tauri dialog plugin is already likely available in Otterly.

---

## 9. CI/CD Pipelines

**Files:** `.github/workflows/ci.yml` (55 lines), `.github/workflows/release.yml` (79 lines)

### CI (`ci.yml`)

Runs on push to main and PRs. Single Ubuntu job:

1. Install system deps (libwebkit2gtk, etc.)
2. Setup Node + Rust (with clippy)
3. Rust cache via `swatinem/rust-cache@v2`
4. Build frontend
5. `cargo check` + `cargo clippy -- -D warnings`

**Concurrency:** `ci-${{ github.ref }}` with cancel-in-progress.

### Release (`release.yml`)

Triggered by `v*` tags or manual dispatch. Matrix build for 3 platforms:

| Platform       | Args                              | Rust Targets                               |
| -------------- | --------------------------------- | ------------------------------------------ |
| macos-latest   | `--target universal-apple-darwin` | `aarch64-apple-darwin,x86_64-apple-darwin` |
| ubuntu-22.04   | (none)                            | (none)                                     |
| windows-latest | (none)                            | (none)                                     |

Uses `tauri-apps/tauri-action@v0` with:

- Apple code signing + notarization (6 secrets)
- Tauri updater signing key (2 secrets)
- Creates draft GitHub release with `updaterJsonPreferNsis: true`

**Required secrets:** `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Porting effort:** Low. Mostly copy-paste with path adjustments (npm -> pnpm, project name changes). Add Otterly-specific checks (svelte-check, oxlint, vitest).

---

# Medium-Value Portables

These features partially overlap with what Otterly already has, or require more adaptation work. Worth comparing implementations and cherry-picking specific patterns.

---

## 10. Code Block Syntax Highlighting (TipTap + lowlight)

**Files:** `src/components/editor/lowlight.ts` (88 lines), `src/components/editor/CodeBlockView.tsx` (101 lines)

**What it does:** Selective registration of 20 languages with highlight.js/lowlight for syntax highlighting in code blocks. Includes a language selector dropdown and Mermaid preview toggle within the code block NodeView.

**Language setup (`lowlight.ts`):**

```typescript
// Tree-shakeable imports — only registers languages actually used
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
// ... 18 more languages

const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("js", javascript); // aliases
lowlight.register("jsx", javascript);
// ...

export const SUPPORTED_LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  // ... 21 entries including "mermaid"
];
```

**CodeBlockView features:**

- Language selector dropdown with chevron icon
- Mermaid blocks get Edit/Preview toggle button
- When in Mermaid preview mode, source is hidden but kept in DOM for TipTap content tracking
- Uses `ReactNodeViewRenderer` (would need Svelte NodeView equivalent)

**Dependencies:** `lowlight`, `highlight.js` (selective imports), `@tiptap/extension-code-block-lowlight`

**Porting effort:** Medium. The lowlight setup and language list are framework-agnostic. The CodeBlockView NodeView needs a Svelte rewrite. The Mermaid integration within code blocks is a nice pattern to adopt.

---

## 11. Inline Link Editor (TipTap)

**Files:** `src/components/editor/LinkEditor.tsx` (131 lines)

**What it does:** Floating popup for adding, editing, and removing links. Supports both URL-only mode (editing existing link) and URL+text mode (inserting new link from selected text). Keyboard-driven: Enter to apply, Escape to cancel, Tab navigates between inputs.

**Key UX patterns:**

- Auto-focuses URL input (or text input if inserting new link)
- Shows "Remove link" button only when editing an existing link
- Compact inline UI with icon buttons (check, unlink, close)
- Tab key captured and stopped from propagating to prevent editor focus trap

**Interface:**

```typescript
interface LinkEditorProps {
  initialUrl: string;
  initialText?: string; // presence determines URL-only vs URL+text mode
  onSubmit: (url: string, text?: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}
```

**Porting effort:** Low. Simple form component with no framework-specific logic beyond JSX. Svelte equivalent would be shorter.

---

## 12. Command Palette with Tantivy-Backed Search

**Files:** `src/components/command-palette/CommandPalette.tsx` (712 lines)

**What it does:** Unified Cmd+P palette combining commands and note search. Commands are memoized and context-aware (shows git commands only when git is available, note-specific commands only when a note is selected). Note search uses Tantivy with 150ms debounce.

**Command categories (contextual):**

- Always: New Note, Focus Mode, Toggle Source, Open Notes Folder, Settings, Theme switching
- When note selected: Pin/Unpin, AI Edit (Claude/Codex/Ollama), Duplicate, Delete, Copy (Markdown/Plain/HTML), Print PDF, Export Markdown
- When git available: Quick Commit, Sync (Pull+Push)

**Search integration:**

```typescript
// Debounced Tantivy search — separate from sidebar search state
const timer = setTimeout(async () => {
  const results = await invoke<SearchResult[]>("search_notes", {
    query: trimmed,
  });
  setLocalSearchResults(results);
}, 150);
```

**Key patterns:**

- Two sections: Commands (filtered by label) + Notes (filtered by Tantivy or shown all)
- Arrow key navigation with scroll-into-view
- Delete confirmation via AlertDialog
- Notes capped at 10 results with first-letter avatar

**Porting effort:** Medium-High. Otterly already has a hotkey/action system. The useful takeaways are: (a) the pattern of combining commands + search in one palette, (b) the contextual command registration, and (c) the Tantivy search integration. The React component itself won't port.

---

## 13. AI Edit Modal + Response Toast

**Files:** `src/components/ai/AiEditModal.tsx` (273 lines), `src/components/ai/AiResponseToast.tsx` (232 lines)

**What it does:** Two-component AI editing workflow:

1. **AiEditModal** — Provider-aware prompt input that:
   - Auto-detects CLI availability on open (shows install instructions if missing)
   - Supports provider switching (Claude, Codex, Ollama) with distinct icons
   - Ollama gets a model selector (persisted to settings)
   - Loading state with spinner during execution
   - Keyboard: Enter to submit, Escape to go back

2. **AiResponseToast** — Displays AI output with basic markdown rendering:
   - Custom `parseMarkdown()` handles code blocks, lists, headers, bold, italic, inline code
   - Shows "Use Cmd+Z to undo changes" hint
   - Provider icon in toast header

**Provider configuration:**

```typescript
type AiProvider = "claude" | "codex" | "ollama";
// Each provider has: icon, display name, CLI name, install URL
// Ollama additionally has a model selector with persistent settings
```

**Porting effort:** Medium. The modal UI needs Svelte rewrite. The markdown-to-HTML parser in the toast (`parseMarkdown`, `parseInlineMarkdown`) is framework-agnostic and could be extracted as a utility. The provider abstraction pattern is clean and reusable.

---

## 14. Focus/Zen Mode

**Files:** `src/App.tsx` (lines 67-78, 233, 356-395)

**What it does:** Distraction-free writing mode that hides the sidebar with animated transitions. Toggle via Cmd+Shift+Enter or command palette. Escape exits focus mode when not in editor.

**Implementation pattern:**

```typescript
const [focusMode, setFocusMode] = useState(false);

// Sidebar hide with animation
className={`transition-all duration-500 ease-out overflow-hidden ${
    !sidebarVisible || focusMode
        ? "opacity-0 -translate-x-4 w-0 pointer-events-none"
        : "opacity-100 translate-x-0 w-64"
}`}
```

**Key behaviors:**

- Sidebar slides out with opacity fade + translate animation (500ms ease-out)
- `pointer-events-none` prevents interaction with hidden sidebar
- Escape key exits focus mode only when focus is outside editor
- State passed to both Sidebar and Editor components

**Porting effort:** Low. This is purely a CSS animation + boolean state toggle. Trivial to implement in Svelte with transitions.

---

## 15. Copy & Export Menu

**Files:** `src/components/command-palette/CommandPalette.tsx` (lines 201-304)

**What it does:** Multiple export formats accessible via command palette:

- **Copy Markdown** — Raw markdown to clipboard via Tauri clipboard plugin
- **Copy Plain Text** — Markdown stripped to plain text (`plainTextFromMarkdown()`)
- **Copy HTML** — Editor's `getHTML()` to clipboard
- **Print as PDF** — `window.print()` for native print dialog
- **Export Markdown** — Save dialog + write to file

**Key utility:** `plainTextFromMarkdown()` — strips markdown formatting to plain text (separate utility in `src/lib/plainText.ts`).

**Porting effort:** Low. Each export is 5-15 lines. The clipboard and dialog Tauri plugins likely already exist in Otterly. The `plainTextFromMarkdown` utility is framework-agnostic.

---

## 16. Editor Typography Settings

**Files:** `src/context/ThemeContext.tsx` (lines 21-46)

**What it does:** Configurable editor typography with CSS variable application:

```typescript
const fontFamilyMap: Record<FontFamily, string> = {
  "system-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", ...',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", ...',
  monospace: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, ...",
};

const editorWidthMap: Record<EditorWidth, string> = {
  narrow: "36rem",
  normal: "48rem",
  wide: "64rem",
  full: "100%",
};

// Defaults
baseFontFamily: "system-sans";
baseFontSize: 15; // px
boldWeight: 600;
lineHeight: 1.6;
```

**Settings persisted per-folder** in `.scratch/settings.json`:

- Font family, size, bold weight, line height
- Text direction (LTR/RTL)
- Editor width (narrow/normal/wide/full/custom px)
- Interface zoom level
- Custom editor width in pixels

**Porting effort:** Low. The font maps and width presets are just data. Otterly likely has its own theme system; these values serve as good defaults/reference.

---

# Low-Value Portables

Features Otterly already has or where the architecture difference makes porting impractical. Listed for reference — specific patterns may still be worth adopting.

---

## 17. Markdown Stripping Utilities (Rust)

**Files:** `src-tauri/src/lib.rs` (lines 400-553)

**What it does:** Rust utilities for extracting display data from markdown notes:

- `strip_frontmatter()` — Removes YAML frontmatter (`---` ... `---`)
- `extract_title()` — First `# Heading` or first non-empty line (capped at 50 chars)
- `generate_preview()` — First non-title line, stripped of markdown (capped at 100 chars)
- `strip_markdown()` — Removes headings, bold, italic, strikethrough, inline code, images, links, task markers, list markers

**Handles edge cases:** NBSP/BOM characters, effectively-empty strings, CRLF line endings.

**Porting effort:** Low but may be redundant. Check if Otterly already has equivalent utilities in its `note` feature.

---

## 18. Note ID / Path Resolution (Rust)

**Files:** `src-tauri/src/lib.rs` (lines 555-636)

**What it does:** Bidirectional conversion between note IDs and filesystem paths with security hardening:

- `id_from_abs_path()` — Converts absolute path to note ID (relative, no `.md`, POSIX separators). Excludes `.git`, `.scratch`, `.obsidian`, `.trash`, `assets` directories. Only accepts `.md` files.
- `abs_path_from_id()` — Converts note ID back to absolute path. Validates against path traversal (`..`, absolute paths, backslashes). Uses OsString append to avoid `with_extension` breaking on dots in filenames (e.g., `meeting.2024-01-15.md`).

**Security:** Guards against directory traversal, absolute paths, and Windows backslash injection.

**Porting effort:** Low but architecture-dependent. Otterly uses branded types (`NotePath`) which may handle this differently. The `with_extension` gotcha and path traversal guards are worth reviewing regardless.

---

## 19. Tauri Auto-Updater Configuration

**Files:** `src-tauri/tauri.conf.json` (updater plugin section)

**What it does:** OTA updates via `tauri-plugin-updater`:

- Checks `latest.json` from GitHub releases on startup (3s delay) and manually via settings
- Uses Tauri updater signing key for verification
- Shows toast with "Update Now" button when newer version available

**Key config pattern:**

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/OWNER/REPO/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**Dependency:** `tauri-plugin-updater = "2"` (already in Scratch's Cargo.toml)

**Porting effort:** Low. Add the plugin + config. The release workflow (item 9) already generates `latest.json`.

---

## 20. Per-Folder Settings Pattern

**Files:** `src-tauri/src/lib.rs` (lines 638-699)

**What it does:** Two-tier settings: app-level config (notes folder path, stored in app data dir) + per-folder settings (theme, editor prefs, stored in `.scratch/settings.json` within the notes folder).

```rust
// App config: {APP_DATA}/config.json
fn get_app_config_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data = app.path().app_data_dir()?;
    Ok(app_data.join("config.json"))
}

// Per-folder: {NOTES_FOLDER}/.scratch/settings.json
fn get_settings_path(notes_folder: &str) -> PathBuf {
    PathBuf::from(notes_folder).join(".scratch").join("settings.json")
}
```

**Porting effort:** N/A — Otterly has its own vault-based settings. The two-tier pattern (global app config vs per-vault settings) is the same concept as Otterly's vault management. Worth comparing for any gaps.

---

## Dependency Summary

Rust crates to add to `src-tauri/Cargo.toml`:

```toml
tantivy = "0.22"     # full-text search
walkdir = "2"        # recursive directory walking (for index rebuild)
notify = "6"         # file watching (may already exist)
chrono = "0.4"       # date/time (for note templates)
regex = "1"          # markdown stripping, ANSI cleanup
```

NPM packages to add:

```
beautiful-mermaid    # sync mermaid SVG rendering
@tiptap/extension-mathematics  # if using TipTap for math
```

---

## Priority Order

### High value

1. **Tantivy search** + **file watcher integration** — biggest UX upgrade, pure Rust
2. **Git remote ops** — low effort, high value for sync workflows
3. **CI/CD pipelines** — enables release automation early
4. **Mermaid rendering** — small, self-contained, nice-to-have
5. **AI CLI integration** — compelling feature but larger UI surface
6. **Wikilinks** — core for knowledge management, but editor-dependent
7. **Math support** — niche but important for some users
8. **PDF export** — trivial to add when needed

### Medium value

9. **Code block syntax highlighting** — adopt lowlight setup + language list
10. **Inline link editor** — small, clean UX pattern
11. **Command palette + search** — adopt the combined commands+search pattern
12. **AI edit modal + response toast** — port after AI CLI backend (item 5)
13. **Focus/zen mode** — trivial CSS toggle, add when polish phase
14. **Copy & export menu** — add formats incrementally as needed
15. **Editor typography settings** — reference for font/width presets

### Low value (reference only)

16. **Markdown stripping utilities** — check for overlap with existing utils
17. **Note ID/path resolution** — review path traversal guards
18. **Auto-updater config** — add alongside release workflow (item 3)
19. **Per-folder settings** — compare with vault settings pattern
